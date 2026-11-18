/**
 * Rotate and flip. A quarter or half turn on MP4/MOV is written as rotation metadata in the track
 * header and the video stream is copied bit for bit (lossless, no encoder involved). A flip, or a
 * rotation of a WebM/MKV file, redraws every frame on a canvas and re-encodes.
 */
import { getFirstEncodableVideoCodec, type VideoCodec, VideoSample } from "mediabunny";
import { z } from "zod";
import { baseName, formatDimensions } from "@/lib/format";
import { encodedSize, evenCropFilter } from "../crop/math";
import { EngineError } from "../errors";
import { type ContainerId, canEncodeAvc, convert, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { framePlan, withPreparedFrames } from "../video-filter/frame-prep";
import { sizeWords } from "../video-filter/plan";
import { isIdentity, isMetadataRotation, rotateCommand, rotatedDimensions } from "./math";

export const RotateOptions = z.object({
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  flip: z.enum(["none", "horizontal", "vertical"]).default("none"),
});
export type RotateOptions = z.infer<typeof RotateOptions>;

/** What a WebM re-encode may write, in mediabunny's order of preference. */
const WEBM_CODECS: VideoCodec[] = ["vp9", "av1", "vp8"];

export const containerFor = (name: string): ContainerId => {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "mov") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mkv") return "mkv";
  return "mp4";
};

export const rotateEngine: Engine<RotateOptions> = {
  id: "rotate",
  backends: ["webcodecs"],
  optionsSchema: RotateOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    if (isMetadataRotation(containerFor(input.file.name), options.flip)) return true;
    if (!pictureDecodes(input.info)) return false;
    const v = input.info?.video;
    const dims = rotatedDimensions(v?.width ?? 1920, v?.height ?? 1080, options.rotate);
    // WebM takes VP9 (or AV1, VP8), which encode odd sizes; H.264 gets the even size it will be given.
    if (containerFor(input.file.name) === "webm")
      return (await getFirstEncodableVideoCodec(WEBM_CODECS, dims)) !== null;
    const even = encodedSize(dims);
    return canEncodeAvc(even.width, even.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    if (isIdentity(options.rotate, options.flip)) {
      throw new EngineError(
        "internal",
        "Nothing to change: no rotation or flip is selected.",
        "Pick a rotation or a flip first.",
      );
    }
    const v = input.info?.video;
    if (!v) {
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to rotate.",
        "Choose a video file.",
      );
    }
    const to = containerFor(input.file.name);
    const metadataOnly = isMetadataRotation(to, options.flip);
    const dims = rotatedDimensions(v.width, v.height, options.rotate);
    // MP4, MOV and MKV are written as H.264, which needs even edges; WebM as VP9, which does not.
    const codec = to === "webm" ? undefined : ("avc" as const);
    const out = codec ? encodedSize(dims) : dims;
    const suffix = options.flip === "none" ? "rotated" : "flipped";
    const outputName = `${baseName(input.file.name)}-${suffix}.${to}`;
    const meta = `${metadataOnly ? formatDimensions(dims.width, dims.height) : sizeWords(dims, out)} · ${metadataOnly ? "video copied" : "re-encoded"}`;

    if (metadataOnly) {
      const result = await convert({
        file: input.file,
        to,
        outputName,
        video: { rotate: options.rotate, allowRotationMetadata: true },
        ffmpegCommand: rotateCommand(
          input.file.name,
          outputName,
          options.rotate,
          options.flip,
          true,
        ),
        ctx,
      });
      return { ...result, meta };
    }

    // Transcode path: the turn and the flip are both drawn here, at the exact turned size.
    // mediabunny's own turn redraws every frame rounded up to even edges (a 641×361 VP9 turned to
    // 362×642, scaled), so it is told to undo the track's own rotation instead (no redraw), and
    // `process` draws the source's rotation, the asked turn and the flip in one step. For H.264 the
    // odd edge is cut first, in the source's orientation (../video-filter/frame-prep), so nothing is
    // scaled either way.
    const flipX = options.flip === "horizontal";
    const flipY = options.flip === "vertical";
    const innate = (((v.rotation ?? 0) % 360) + 360) % 360;
    const total = (innate + options.rotate) % 360;
    let canvas: OffscreenCanvas | undefined;
    let c2d: OffscreenCanvasRenderingContext2D | null = null;
    const frames = await framePlan(input.file, codec ?? "vp9", (360 - innate) % 360);
    const prepared = withPreparedFrames(
      {
        ...(codec ? { codec } : {}),
        rotate: ((360 - innate) % 360) as 0 | 90 | 180 | 270,
        allowRotationMetadata: false,
        forceTranscode: true,
        processedWidth: out.width,
        processedHeight: out.height,
        process: (sample) => {
          // The sample may still carry the track's rotation (drawn by `draw`) or arrive unturned.
          const extra = (((total - sample.rotation) % 360) + 360) % 360;
          const w = sample.displayWidth;
          const h = sample.displayHeight;
          const [cw, ch] = extra % 180 === 0 ? [w, h] : [h, w];
          if (!canvas || canvas.width !== cw || canvas.height !== ch) {
            canvas = new OffscreenCanvas(cw, ch);
            c2d = canvas.getContext("2d");
          }
          if (!c2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
          // Read right to left: turn about the centre, then flip in the output's own axes.
          c2d.setTransform(1, 0, 0, 1, cw / 2, ch / 2);
          c2d.scale(flipX ? -1 : 1, flipY ? -1 : 1);
          c2d.rotate((extra * Math.PI) / 180);
          sample.draw(c2d, -w / 2, -h / 2, w, h);
          return new VideoSample(canvas, {
            timestamp: sample.timestamp,
            duration: sample.duration,
          });
        },
      },
      frames,
    );
    let result: Awaited<ReturnType<typeof convert>>;
    try {
      result = await convert({
        file: input.file,
        to,
        outputName,
        video: prepared.video,
        decodeColorSpace: prepared.decodeColorSpace,
        ffmpegCommand: rotateCommand(
          input.file.name,
          outputName,
          options.rotate,
          options.flip,
          false,
          codec ? evenCropFilter({ width: v.width, height: v.height }) : "",
        ),
        ctx,
      });
    } finally {
      prepared.dispose();
    }
    return { ...result, meta };
  },
};
