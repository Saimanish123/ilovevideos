/**
 * The sharpest frame in a range (ADR-0094). Decodes every frame of the range (an even sample of at
 * most MAX_SCORED) at an analysis size, scores each by Laplacian variance (./score), then decodes
 * the winner again at the video's full display size and encodes it as PNG, JPG or WebP. Runs in the
 * engine worker; progress is frames scored of frames to score.
 */
import { CanvasSink } from "mediabunny";
import { baseName, formatDimensions, formatTimecode, shellQuote } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import {
  frameFfmpegCommand,
  frameFilename,
  imageLabel,
  imageMime,
  isLossy,
} from "../frame-extract/math";
import { openInput, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { FramePickOptions, MAX_SCORED } from "./options";
import { analysisSize, scoreTimes, sharpness } from "./score";

export { FramePickOptions };

const cancelled = () => new EngineError("cancelled", "Cancelled.");
const noVideo = () =>
  new EngineError(
    "unsupported-input",
    "This file has no video track to take a frame from.",
    "Choose a video file.",
  );

export const framePickEngine: Engine<FramePickOptions> = {
  id: "frame-pick",
  backends: ["webcodecs"],
  optionsSchema: FramePickOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    return (
      typeof VideoDecoder !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      !!input.info?.video &&
      pictureDecodes(input.info)
    );
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const v = input.info?.video;
    if (!v) throw noVideo();
    if (ctx.signal.aborted) throw cancelled();
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    const media = openInput(input.file);
    let track: Awaited<ReturnType<typeof media.getPrimaryVideoTrack>>;
    try {
      track = await media.getPrimaryVideoTrack();
    } catch (e) {
      throw classifyError(e);
    }
    if (!track) throw noVideo();
    if (!(await track.canDecode()))
      throw new EngineError(
        "unsupported-input",
        "This file uses a codec your browser cannot decode.",
        "Convert it to MP4 first, or try desktop Chrome.",
      );

    // The display size (rotation applied), as the inspector reports it and the sink draws it.
    if (options.mode === "thumbnail") return thumbnail(track, input, options, ctx);
    const size = analysisSize(v.width, v.height);
    const t0 = input.info?.startSec ?? 0;
    const end = Math.min(options.end, input.info?.durationSec ?? options.end);
    const times = scoreTimes(options.start, end, v.fps, MAX_SCORED);
    const scores: { t: number; score: number }[] = [];
    try {
      const first = await track.getFirstTimestamp();
      const sink = new CanvasSink(track, {
        width: size.width,
        height: size.height,
        fit: "fill",
        poolSize: 2,
      });
      let done = 0;
      for await (const wrapped of sink.canvasesAtTimestamps(
        times.map((t) => Math.max(t + t0, first)),
      )) {
        if (ctx.signal.aborted) throw cancelled();
        done++;
        if (wrapped) {
          const canvas = wrapped.canvas as OffscreenCanvas;
          const c2d = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
          if (!c2d)
            throw new EngineError("internal", "Could not read decoded frames.", "Try again.");
          const { data, width, height } = c2d.getImageData(0, 0, canvas.width, canvas.height);
          // Two times the same decoded frame (a range past the end) are scored once.
          const at = wrapped.timestamp - t0;
          if (scores[scores.length - 1]?.t !== at)
            scores.push({ t: at, score: sharpness(data, width, height) });
        }
        ctx.onProgress({
          phase: "processing",
          ratio: (done / times.length) * 0.9,
          detail: `Scoring frame ${done.toLocaleString()} of ${times.length.toLocaleString()}`,
        });
      }
      if (scores.length === 0)
        throw new EngineError(
          "internal",
          "No frames could be decoded in the chosen range.",
          "Move the range and try again.",
        );
      let best = scores[0] as { t: number; score: number };
      for (const s of scores) if (s.score > best.score) best = s;

      ctx.onProgress({
        phase: "finishing",
        ratio: 0.92,
        detail: `Decoding the frame at ${formatTimecode(best.t)}`,
      });
      const full = new CanvasSink(track, { poolSize: 1 });
      const wrapped = await full.getCanvas(best.t + t0);
      if (ctx.signal.aborted) throw cancelled();
      if (!wrapped)
        throw new EngineError(
          "internal",
          "The chosen frame could not be decoded again.",
          "Try again.",
        );
      const canvas = wrapped.canvas;
      const type = imageMime[options.format];
      const quality = isLossy(options.format) ? options.quality / 100 : undefined;
      // An OffscreenCanvas in the worker; a canvas element if this ever runs on the page.
      const blob =
        "convertToBlob" in canvas
          ? await canvas.convertToBlob({ type, quality })
          : await new Promise<Blob>((ok, fail) =>
              canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), type, quality),
            );
      if (blob.type !== imageMime[options.format])
        throw new EngineError(
          "unsupported-output",
          `Your browser cannot encode ${imageLabel[options.format]} images.`,
          "Choose PNG instead.",
        );
      const outputName = frameFilename(baseName(input.file.name), best.t, options.format);
      return {
        blob,
        filename: outputName,
        ffmpegCommand: `${frameFfmpegCommand(input.file.name, outputName, best.t, options.format, options.quality)}`,
        meta: `frame at ${formatTimecode(best.t)} · sharpest of ${scores.length.toLocaleString()}`,
      };
    } catch (e) {
      if (ctx.signal.aborted) throw cancelled();
      throw classifyError(e);
    }
  },
};

/**
 * The thumbnail maker's run: the frame at `time`, decoded at full display size, cropped to `crop`
 * and drawn at the output size with high-quality resampling, then encoded (ADR-0098).
 */
async function thumbnail(
  track: NonNullable<Awaited<ReturnType<ReturnType<typeof openInput>["getPrimaryVideoTrack"]>>>,
  input: Parameters<Engine<FramePickOptions>["run"]>[1][number],
  options: FramePickOptions,
  ctx: Parameters<Engine<FramePickOptions>["run"]>[3],
) {
  const v = input.info?.video;
  const time = options.time ?? 0;
  const t0 = input.info?.startSec ?? 0;
  ctx.onProgress({
    phase: "processing",
    ratio: 0.3,
    detail: `Decoding the frame at ${formatTimecode(time)}`,
  });
  try {
    const wrapped = await new CanvasSink(track, { poolSize: 1 }).getCanvas(time + t0);
    if (ctx.signal.aborted) throw cancelled();
    if (!wrapped)
      throw new EngineError(
        "internal",
        "No frame could be decoded at that time.",
        "Move the playhead a little and try again.",
      );
    const src = wrapped.canvas;
    const crop = options.crop ?? { x: 0, y: 0, width: src.width, height: src.height };
    // The crop is in the inspector's display size; the decoded canvas should match, but scale if not.
    const kx = src.width / (v?.width || src.width);
    const ky = src.height / (v?.height || src.height);
    const sx = Math.max(0, Math.round(crop.x * kx));
    const sy = Math.max(0, Math.round(crop.y * ky));
    const sw = Math.min(src.width - sx, Math.round(crop.width * kx));
    const sh = Math.min(src.height - sy, Math.round(crop.height * ky));
    const ow = options.outWidth ?? sw;
    const oh = options.outHeight ?? sh;
    ctx.onProgress({
      phase: "finishing",
      ratio: 0.7,
      detail: `Scaling to ${formatDimensions(ow, oh)}`,
    });
    const out = new OffscreenCanvas(ow, oh);
    const c2d = out.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D | null;
    if (!c2d) throw new EngineError("internal", "Could not draw the thumbnail.", "Try again.");
    c2d.imageSmoothingEnabled = true;
    c2d.imageSmoothingQuality = "high";
    c2d.drawImage(src as CanvasImageSource, sx, sy, sw, sh, 0, 0, ow, oh);
    const type = imageMime[options.format];
    const blob = await out.convertToBlob({
      type,
      quality: isLossy(options.format) ? options.quality / 100 : undefined,
    });
    if (blob.type !== type)
      throw new EngineError(
        "unsupported-output",
        `Your browser cannot encode ${imageLabel[options.format]} images.`,
        "Choose JPG or PNG instead.",
      );
    const base = baseName(input.file.name);
    const filename = frameFilename(`${base}-thumbnail`, time, options.format);
    const scale = ow / sw;
    return {
      blob,
      filename,
      ffmpegCommand: `ffmpeg -ss ${time.toFixed(3)} -i ${shellQuote(input.file.name)} -frames:v 1 -vf "crop=${sw}:${sh}:${sx}:${sy},scale=${ow}:${oh}:flags=lanczos" ${shellQuote(filename)}`,
      meta: `${formatDimensions(ow, oh)} · frame at ${formatTimecode(time)} · ${scale > 1.01 ? `enlarged ${scale.toFixed(1)}× from ${formatDimensions(sw, sh)}` : `from a ${formatDimensions(sw, sh)} crop`}`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw cancelled();
    throw classifyError(e);
  }
}

/** The thumbnail maker's page uses the same engine under its own id, so it can have its own panel. */
export const thumbnailEngine: Engine<FramePickOptions> = { ...framePickEngine, id: "thumbnail" };
