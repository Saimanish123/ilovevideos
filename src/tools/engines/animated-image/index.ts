/**
 * Video → animated WebP, APNG or AVIF (ADR-0093). The frames are the GIF engine's: the chosen range
 * sampled at the chosen rate, decoded with WebCodecs and drawn at the output size by a mediabunny
 * CanvasSink (rotation applied). Then, per format:
 *
 * - WebP: each frame is the rectangle that visibly changed (`CHANGE_THRESHOLD`), encoded by the
 *   browser's libwebp (`convertToBlob`, lossy) and muxed here (`./webp`). Where the canvas cannot
 *   encode WebP (Safari), every frame is a VP8 key frame from WebCodecs instead.
 * - APNG: the exact rectangle that changed, PNG-filtered and deflated with `CompressionStream`, in
 *   our own writer (`./apng`). Lossless.
 * - AVIF: AV1 from WebCodecs (one key frame, then inter frames) in our own `avis` writer (`./avis`).
 *
 * Runs in the engine worker; progress is frames done of frames total. No sound in any of them.
 */
import { CanvasSink } from "mediabunny";
import { baseName, formatDimensions, withUnit } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { openInput, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { frameCount, frameTimestamps, gifDimensions } from "../video-to-gif/math";
import { ApngWriter, changedRect, deflate, filterRows, rgbaToRgb } from "./apng";
import {
  av1CodecString,
  av1ConfigRecord,
  parseSequenceHeader,
  sequenceHeaderObu,
  stripForSample,
} from "./av1";
import { type AvisSample, writeAvis } from "./avis";
import { animatedPath } from "./capability";
import {
  type AnimatedFormat,
  AV1_BITS_PER_PIXEL,
  CHANGE_THRESHOLD,
  changedRectRgba,
  copyRect,
  FORMAT_EXT,
  FORMAT_MIME,
  FORMAT_NAME,
  rgbaToI420,
  VP8_BITS_PER_PIXEL,
  WEBP_QUALITY,
} from "./math";
import { AnimatedImageOptions, animatedFfmpegCommand } from "./options";
import { stillChunks, vp8Chunk, WebpWriter } from "./webp";

export { AnimatedImageOptions };

const cancelled = () => new EngineError("cancelled", "Cancelled.");

/** Frames handed to encoders as planes we converted (`rgbaToI420`): BT.601, limited range. */
const BT601_I420 = {
  format: "I420" as const,
  colorSpace: {
    matrix: "smpte170m" as const,
    primaries: "smpte170m" as const,
    transfer: "smpte170m" as const,
    fullRange: false,
  },
};
/** The same, as the nclx code points an AVIF `colr` box carries (ITU-T H.273). */
const BT601_NCLX = { primaries: 6, transfer: 6, matrix: 6, fullRange: false };

const cannotEncode = (format: AnimatedFormat) =>
  new EngineError(
    "unsupported-output",
    format === "avif"
      ? "This browser has no AV1 encoder, which an animated AVIF needs."
      : `This browser cannot encode ${FORMAT_NAME[format]} frames.`,
    format === "avif"
      ? "Use current Chrome or Edge on a computer, or make an animated WebP instead."
      : "Use current Chrome, Edge, Firefox or Safari.",
  );

/** Feeds a VideoEncoder and collects its chunks, with back-pressure and a real error path. */
function chunkEncoder(config: VideoEncoderConfig) {
  const chunks: { data: Uint8Array; key: boolean }[] = [];
  let decoderCodec: string | undefined;
  let failure: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, key: chunk.type === "key" });
      if (meta?.decoderConfig?.codec) decoderCodec = meta.decoderConfig.codec;
    },
    error: (e) => {
      failure = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(config);
  return {
    chunks,
    get codec() {
      return decoderCodec;
    },
    async encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
      if (failure) throw failure;
      while (encoder.encodeQueueSize > 4) {
        await new Promise<void>((r) =>
          encoder.addEventListener("dequeue", () => r(), { once: true }),
        );
        if (failure) throw failure;
      }
      encoder.encode(frame, options);
    },
    async flush() {
      if (failure) throw failure;
      await encoder.flush();
      if (failure) throw failure;
    },
    close() {
      if (encoder.state !== "closed") encoder.close();
    },
  };
}

export const animatedImageEngine: Engine<AnimatedImageOptions> = {
  id: "animated-image",
  backends: ["webcodecs"],
  optionsSchema: AnimatedImageOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    const v = input.info?.video;
    if (typeof VideoDecoder === "undefined" || typeof OffscreenCanvas === "undefined" || !v)
      return false;
    if (!pictureDecodes(input.info)) return false;
    const dims = gifDimensions(v.width, v.height, options.width);
    return (await animatedPath(options.format, dims.width, dims.height, options.fps)) !== undefined;
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const v = input.info?.video;
    const { format } = options;
    const name = FORMAT_NAME[format];
    const noVideo = () =>
      new EngineError(
        "unsupported-input",
        `This file has no video track to turn into an animated ${name}.`,
        "Choose a video file.",
      );
    if (!v) throw noVideo();
    if (ctx.signal.aborted) throw cancelled();

    const dims = gifDimensions(v.width, v.height, options.width);
    const { width, height } = dims;
    const total = frameCount(options.start, options.end, options.fps);
    const outputName = `${baseName(input.file.name)}.${FORMAT_EXT[format]}`;
    const ffmpegCommand = animatedFfmpegCommand(input.file.name, outputName, options, dims);
    const path = await animatedPath(format, width, height, options.fps);
    if (!path) throw cannotEncode(format);

    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    const media = openInput(input.file);
    let track: Awaited<ReturnType<typeof media.getPrimaryVideoTrack>>;
    try {
      track = await media.getPrimaryVideoTrack();
    } catch (e) {
      throw classifyError(e);
    }
    if (!track) throw noVideo();
    if (!(await track.canDecode())) {
      throw new EngineError(
        "unsupported-input",
        "This file uses a codec your browser cannot decode.",
        "Convert it to MP4 first, or try desktop Chrome.",
      );
    }

    const sink = new CanvasSink(track, { width, height, fit: "fill", poolSize: 2 });
    const pixels = width * height;
    // What a viewer sees after the last frame written (lossy formats compare against it).
    const shown = new Uint8ClampedArray(pixels * 4);
    let prevRgb: Uint8Array | undefined;
    let rgb: Uint8Array = new Uint8Array(pixels * 3);
    const apng =
      format === "apng"
        ? new ApngWriter({ width, height, bpp: 3, fps: options.fps, loop: options.loop })
        : undefined;
    const webp =
      format === "webp" ? new WebpWriter({ width, height }, options.fps, options.loop) : undefined;
    const vp8 =
      path === "vp8"
        ? chunkEncoder({
            codec: "vp8",
            width,
            height,
            framerate: options.fps,
            bitrate: Math.round(VP8_BITS_PER_PIXEL[options.quality] * pixels * options.fps),
          })
        : undefined;
    const av1 =
      format === "avif"
        ? chunkEncoder({
            codec: av1CodecString(width, height, options.fps),
            width,
            height,
            framerate: options.fps,
            latencyMode: "quality",
            bitrateMode: "variable",
            bitrate: Math.round(AV1_BITS_PER_PIXEL[options.quality] * pixels * options.fps),
          })
        : undefined;
    // A sub-rectangle canvas for WebP frames, reused while the size repeats.
    let piece: OffscreenCanvas | undefined;

    let done = 0;
    let written = 0;
    let sawFrame = false;
    let last: OffscreenCanvas | undefined;
    const t0 = input.info?.startSec ?? 0;
    try {
      const first = await track.getFirstTimestamp();
      const times = frameTimestamps(options.start, options.end, options.fps).map((t) =>
        Math.max(t + t0, first),
      );
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (ctx.signal.aborted) throw cancelled();
        // A time past the last decodable frame repeats the previous frame, so timing stays honest.
        const canvas = (wrapped?.canvas as OffscreenCanvas | undefined) ?? last;
        if (wrapped) last = canvas;
        if (!canvas) {
          done++;
          continue;
        }
        sawFrame = true;
        const c2d = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
        if (!c2d) throw new EngineError("internal", "Could not read decoded frames.", "Try again.");
        const image = c2d.getImageData(0, 0, width, height);
        const rgba = image.data;
        if (av1) {
          // Our own BT.601 planes, tagged as such in the file: encoders differ in how they turn RGB
          // into YUV (WebKit uses BT.709 and leaves the stream untagged, which reads as BT.601).
          const frame = new VideoFrame(rgbaToI420(rgba, width, height), {
            ...BT601_I420,
            codedWidth: width,
            codedHeight: height,
            timestamp: Math.round((done * 1e6) / options.fps),
            duration: Math.round(1e6 / options.fps),
          });
          try {
            await av1.encode(frame, { keyFrame: written === 0 });
          } finally {
            frame.close();
          }
          written++;
        } else {
          if (apng) {
            rgb = rgbaToRgb(rgba, rgb);
            const rect = prevRgb
              ? changedRect(prevRgb, rgb, width, height, 3)
              : { x: 0, y: 0, w: width, h: height };
            if (!rect) apng.extend();
            else {
              apng.add(rect, await deflate(filterRows(rgb, width, 3, rect)));
              written++;
            }
            if (!prevRgb) prevRgb = new Uint8Array(pixels * 3);
            [prevRgb, rgb] = [rgb, prevRgb];
          } else if (webp && vp8) {
            // Every frame a key frame (WebP frames stand alone); the chunks are muxed at the end.
            // WebP decoders read VP8 as BT.601 limited range; WebKit's encoder converts RGB with
            // BT.709, so the planes are made here and handed over as they must be read.
            const frame = new VideoFrame(rgbaToI420(rgba, width, height), {
              ...BT601_I420,
              codedWidth: width,
              codedHeight: height,
              timestamp: Math.round((done * 1e6) / options.fps),
            });
            try {
              await vp8.encode(frame, { keyFrame: true });
            } finally {
              frame.close();
            }
            written++;
          } else if (webp) {
            const rect =
              written === 0
                ? { x: 0, y: 0, w: width, h: height }
                : changedRectRgba(shown, rgba, width, height, CHANGE_THRESHOLD);
            if (!rect) webp.extend();
            else {
              if (!piece || piece.width !== rect.w || piece.height !== rect.h)
                piece = new OffscreenCanvas(rect.w, rect.h);
              const p2d = piece.getContext("2d", {
                alpha: false,
              }) as OffscreenCanvasRenderingContext2D | null;
              if (!p2d) throw new EngineError("internal", "Could not draw frames.", "Try again.");
              p2d.putImageData(image, -rect.x, -rect.y, rect.x, rect.y, rect.w, rect.h);
              const still = await piece.convertToBlob({
                type: "image/webp",
                quality: WEBP_QUALITY[options.quality],
              });
              const { chunks, hasAlpha } = stillChunks(new Uint8Array(await still.arrayBuffer()));
              webp.add({ chunks, x: rect.x, y: rect.y, width: rect.w, height: rect.h, hasAlpha });
              copyRect(rgba, shown, width, rect);
              written++;
            }
          }
        }
        done++;
        ctx.onProgress({
          phase: "processing",
          ratio: (done / total) * (av1 ? 0.95 : 1),
          detail: `Frame ${done.toLocaleString()} of ${total.toLocaleString()}`,
        });
      }
      if (!sawFrame) {
        throw new EngineError(
          "internal",
          "No frames could be decoded in the chosen range.",
          "Move the range and try again.",
        );
      }
      ctx.onProgress({ phase: "finishing", ratio: 0.97, detail: "Writing the file" });
      let blob: Blob;
      if (webp && vp8) {
        await vp8.flush();
        if (vp8.chunks.length !== written)
          throw new EngineError("internal", "The VP8 encoder dropped frames.", "Try again.");
        for (const c of vp8.chunks)
          webp.add({ chunks: vp8Chunk(c.data), x: 0, y: 0, width, height, hasAlpha: false });
      }
      if (apng) blob = apng.finish();
      else if (webp) blob = webp.finish();
      else if (av1) {
        await av1.flush();
        blob = avifFrom(av1.chunks, width, height, options.fps, written, options.loop);
      } else throw new EngineError("internal", "Unknown format.");
      const frames = apng?.frames ?? webp?.frames ?? done;
      return {
        blob,
        filename: outputName,
        ffmpegCommand,
        meta: `${formatDimensions(width, height)} · ${withUnit(done.toLocaleString(), "frames")}${
          frames < done ? ` (${frames.toLocaleString()} stored)` : ""
        }`,
      };
    } catch (e) {
      if (ctx.signal.aborted) throw cancelled();
      throw classifyError(e);
    } finally {
      av1?.close();
      vp8?.close();
    }
  },
};

/** The AV1 chunks as an AVIF sequence: one sample per frame, each one frame period long. */
function avifFrom(
  chunks: { data: Uint8Array; key: boolean }[],
  width: number,
  height: number,
  fps: number,
  frames: number,
  loop: boolean,
): Blob {
  const first = chunks[0];
  if (!first?.key)
    throw new EngineError(
      "internal",
      "The AV1 encoder did not start with a key frame.",
      "Try again.",
    );
  const seqObu = sequenceHeaderObu(first.data);
  if (!seqObu)
    throw new EngineError("internal", "The AV1 encoder wrote no sequence header.", "Try again.");
  const seq = parseSequenceHeader(seqObu);
  const samples: AvisSample[] = chunks.map((c) => ({ data: stripForSample(c.data), key: c.key }));
  // The planes are ours, so their colour is known whatever the encoder wrote into the stream.
  const color = BT601_NCLX;
  const parts = writeAvis({
    width,
    height,
    timescale: fps,
    durations: samples.map(() => 1),
    samples,
    av1C: av1ConfigRecord(seq, seqObu),
    color,
    bitDepth: seq.bitDepth,
    loop,
  });
  if (samples.length !== frames) {
    // Every frame sent is one chunk out; anything else would shift the timing.
    throw new EngineError(
      "internal",
      `The AV1 encoder returned ${samples.length} of ${frames} frames.`,
      "Try again.",
    );
  }
  return new Blob(parts as BlobPart[], { type: FORMAT_MIME.avif });
}
