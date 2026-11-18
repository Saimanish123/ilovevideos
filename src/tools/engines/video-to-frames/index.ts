/**
 * Video to image sequence (feature B7): frames every N seconds or every N-th frame, as numbered
 * JPG, PNG or WebP files. Built on the frame-extract path: WebCodecs decodes through a mediabunny
 * CanvasSink at the output size (rotation applied), OffscreenCanvas encodes each image. Seconds mode
 * decodes only what the chosen times need (`canvasesAtTimestamps`); frames mode decodes the range in
 * order and keeps every N-th. Images are returned as separate files and zipped on the page. Runs in
 * the engine worker; no network.
 */
import { CanvasSink } from "mediabunny";
import { baseName, formatBytes, formatDimensions, formatTimecode, withUnit } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { imageLabel, imageMime, isLossy } from "../frame-extract/math";
import { openInput, pictureDecodes } from "../mediabunny/shared";
import type { Engine, EngineOutputFile } from "../types";
import {
  framesCommand,
  imageCount,
  MAX_BYTES,
  MAX_IMAGES,
  outputSize,
  rangeOf,
  secondTimes,
  sequenceName,
  VideoToFramesOptions,
} from "./plan";

export { VideoToFramesOptions };

const noVideo = () =>
  new EngineError(
    "unsupported-input",
    "This file has no video track to take frames from.",
    "Choose a video file.",
  );

export const videoToFramesEngine: Engine<VideoToFramesOptions> = {
  id: "video-to-frames",
  backends: ["webcodecs"],
  optionsSchema: VideoToFramesOptions,
  async supports(backend, input) {
    return (
      backend === "webcodecs" &&
      typeof VideoDecoder !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      !!input.info?.video &&
      pictureDecodes(input.info)
    );
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) throw noVideo();
    const total = imageCount(o, info.durationSec, v.fps);
    if (total === 0)
      throw new EngineError(
        "unsupported-input",
        "The chosen range holds no frame.",
        "Widen the range.",
      );
    if (total > MAX_IMAGES)
      throw new EngineError(
        "resource",
        `That is ${total.toLocaleString("en")} images; one run writes at most ${MAX_IMAGES.toLocaleString("en")}.`,
        "Choose a longer interval or a shorter range.",
      );
    // Page times run from the file's start; the source's clock may not (MPEG-TS: about 1.4 s).
    const t0 = info.startSec ?? 0;
    const range = rangeOf(o, info.durationSec);
    const start = range.start + t0;
    const end = range.end + t0;
    const size = outputSize(v, o.maxWidth);
    const base = baseName(input.file.name);
    const quality = isLossy(o.format) ? o.quality / 100 : undefined;

    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    const media = openInput(input.file);
    try {
      const track = await media.getPrimaryVideoTrack();
      if (!track) throw noVideo();
      if (!(await track.canDecode()))
        throw new EngineError(
          "unsupported-input",
          "This file uses a codec your browser cannot decode.",
          "Convert it to MP4 first, or try desktop Chrome.",
        );
      const sink = new CanvasSink(
        track,
        size.width === v.width
          ? { poolSize: 2 }
          : { width: size.width, height: size.height, fit: "fill", poolSize: 2 },
      );
      const files: EngineOutputFile[] = [];
      let bytes = 0;
      const keep = async (canvas: OffscreenCanvas, time: number) => {
        if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        const blob = await canvas.convertToBlob({ type: imageMime[o.format], quality });
        if (blob.type !== imageMime[o.format])
          throw new EngineError(
            "unsupported-output",
            `Your browser cannot encode ${imageLabel[o.format]} images.`,
            "Choose PNG or JPG instead.",
          );
        bytes += blob.size;
        if (bytes > MAX_BYTES)
          throw new EngineError(
            "resource",
            `The images passed ${formatBytes(MAX_BYTES)} after ${files.length.toLocaleString("en")} of ${total.toLocaleString("en")}, more than a browser tab can safely hold.`,
            o.format === "png"
              ? "Choose JPG, a smaller size or a longer interval."
              : "Choose a smaller size, a longer interval or a shorter range.",
          );
        files.push({
          blob,
          filename: sequenceName(base, files.length + 1, total, o.format),
          meta: formatTimecode(time),
        });
        ctx.onProgress({
          phase: "processing",
          ratio: files.length / total,
          detail: `Image ${files.length.toLocaleString("en")} of ${total.toLocaleString("en")}`,
          item: { index: files.length - 1, count: total },
        });
      };

      if (o.every === "seconds") {
        const first = await track.getFirstTimestamp();
        const times = secondTimes(start, end, o.step);
        for await (const wrapped of sink.canvasesAtTimestamps(
          times.map((t) => Math.max(t, first)),
        )) {
          if (wrapped) await keep(wrapped.canvas as OffscreenCanvas, wrapped.timestamp);
          else if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        }
      } else {
        const n = Math.max(1, Math.round(o.step));
        let index = 0;
        for await (const wrapped of sink.canvases(start, end)) {
          if (index++ % n === 0) await keep(wrapped.canvas as OffscreenCanvas, wrapped.timestamp);
          if (files.length >= total) break;
        }
      }
      if (files.length === 0)
        throw new EngineError(
          "internal",
          "No frame could be decoded in that range.",
          "Move the range a little and try again.",
        );
      ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Collecting the images" });
      const first = files[0] as EngineOutputFile;
      return {
        blob: first.blob,
        filename: first.filename,
        files,
        ffmpegCommand: framesCommand(input.file.name, base, o, info.durationSec, size, v),
        meta: `${withUnit(files.length.toLocaleString("en"), files.length === 1 ? "image" : "images")} · ${formatDimensions(size.width, size.height)} · ${imageLabel[o.format]}`,
      };
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    } finally {
      media.dispose();
    }
  },
};
