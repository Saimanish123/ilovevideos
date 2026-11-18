/**
 * Extract one frame as an image. Decodes the frame at the chosen time with WebCodecs through a
 * mediabunny CanvasSink at the track's display size (rotation from the file applied, no resizing),
 * then encodes it with OffscreenCanvas.convertToBlob. Runs in the engine worker.
 */
import { CanvasSink } from "mediabunny";
import { baseName, formatDimensions, formatTimecode } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { openInput, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import {
  frameFfmpegCommand,
  frameFilename,
  imageLabel,
  imageMime,
  isLossy,
  snapToFrame,
} from "./math";
import { FrameExtractOptions } from "./options";

export { FrameExtractOptions };

const noVideo = () =>
  new EngineError(
    "unsupported-input",
    "This file has no video track to take a frame from.",
    "Choose a video file.",
  );

export const frameExtractEngine: Engine<FrameExtractOptions> = {
  id: "frame-extract",
  backends: ["webcodecs"],
  optionsSchema: FrameExtractOptions,
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
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");

    const time = snapToFrame(options.time, v.fps, input.info?.durationSec ?? 0);
    const outputName = frameFilename(baseName(input.file.name), time, options.format);
    const ffmpegCommand = frameFfmpegCommand(
      input.file.name,
      outputName,
      time,
      options.format,
      options.quality,
    );

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

    ctx.onProgress({
      phase: "processing",
      ratio: 0.2,
      detail: `Decoding the frame at ${formatTimecode(time)}`,
    });
    // Default size is the display size (after rotation); the sink applies the file's rotation itself.
    const sink = new CanvasSink(track, { poolSize: 1 });
    let wrapped: Awaited<ReturnType<typeof sink.getCanvas>>;
    try {
      // Page time is from the file's start; the source's clock may not be (MPEG-TS: about 1.4 s).
      wrapped = await sink.getCanvas(time + (input.info?.startSec ?? 0));
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    }
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (!wrapped) {
      throw new EngineError(
        "internal",
        "No frame could be decoded at that time.",
        "Move the playhead a little and try again.",
      );
    }
    const canvas = wrapped.canvas as OffscreenCanvas;
    ctx.onProgress({
      phase: "finishing",
      ratio: 0.8,
      detail: `Encoding ${imageLabel[options.format]}`,
    });
    let blob: Blob;
    try {
      blob = await canvas.convertToBlob({
        type: imageMime[options.format],
        quality: isLossy(options.format) ? options.quality / 100 : undefined,
      });
    } catch (e) {
      throw classifyError(e);
    }
    if (blob.type !== imageMime[options.format]) {
      // The browser silently fell back to PNG: this format cannot be encoded here.
      throw new EngineError(
        "unsupported-output",
        `Your browser cannot encode ${imageLabel[options.format]} images.`,
        "Choose PNG instead.",
      );
    }
    return {
      blob,
      filename: outputName,
      ffmpegCommand,
      meta: `${formatDimensions(canvas.width, canvas.height)} · ${imageLabel[options.format]} · frame at ${formatTimecode(wrapped.timestamp)}`,
    };
  },
};
