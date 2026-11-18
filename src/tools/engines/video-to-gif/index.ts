/**
 * Video → GIF, fast path. Decodes the chosen range with WebCodecs (mediabunny CanvasSink resizes
 * and applies rotation), quantises a 256-colour palette per frame with gifenc and writes an
 * animated GIF. Runs in the engine worker; progress is frames done of frames total.
 * The "best" quality path (ffmpeg palettegen/paletteuse with dithering) lives in ./ffmpeg.ts and
 * runs on the page like the other ffmpeg work.
 */
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { CanvasSink } from "mediabunny";
import { baseName, formatDimensions, withUnit } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { openInput } from "../mediabunny/shared";
import type { Engine } from "../types";
import { frameCount, frameDelaysCs, frameTimestamps, gifDimensions, MAX_COLORS } from "./math";
import { gifFfmpegCommand, VideoToGifOptions } from "./options";

export { VideoToGifOptions };

export const videoToGifEngine: Engine<VideoToGifOptions> = {
  id: "video-to-gif",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: VideoToGifOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    return (
      typeof VideoDecoder !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      !!input.info?.video
    );
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const v = input.info?.video;
    if (!v) {
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to turn into a GIF.",
        "Choose a video file.",
      );
    }
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");

    const dims = gifDimensions(v.width, v.height, options.width);
    const total = frameCount(options.start, options.end, options.fps);
    // Hundredths per frame, alternating so the GIF lasts exactly as long as the range (./math).
    const delays = frameDelaysCs(total, options.fps);
    const outputName = `${baseName(input.file.name)}.gif`;
    const ffmpegCommand = gifFfmpegCommand(input.file.name, outputName, options, dims);

    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    const media = openInput(input.file);
    let track: Awaited<ReturnType<typeof media.getPrimaryVideoTrack>>;
    try {
      track = await media.getPrimaryVideoTrack();
    } catch (e) {
      throw classifyError(e);
    }
    if (!track) {
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to turn into a GIF.",
        "Choose a video file.",
      );
    }
    if (!(await track.canDecode())) {
      throw new EngineError(
        "unsupported-input",
        "This file uses a codec your browser cannot decode.",
        "Convert it to MP4 first, or try desktop Chrome.",
      );
    }

    const sink = new CanvasSink(track, {
      width: dims.width,
      height: dims.height,
      fit: "fill",
      poolSize: 2,
    });
    const gif = GIFEncoder({ initialCapacity: dims.width * dims.height * 2 });
    const repeat = options.loop ? 0 : -1;
    let done = 0;
    let lastIndex: Uint8Array | undefined;
    let lastPalette: number[][] | undefined;

    try {
      // The range is in page time, from the file's start; the source's clock may start later, and
      // the picture after the sound (MPEG-TS: 1.423 s against 1.400 s), so no time is before it.
      const t0 = input.info?.startSec ?? 0;
      const first = await track.getFirstTimestamp();
      for await (const frame of sink.canvasesAtTimestamps(
        frameTimestamps(options.start, options.end, options.fps).map((t) =>
          Math.max(t + t0, first),
        ),
      )) {
        if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        if (frame) {
          const canvas = frame.canvas as OffscreenCanvas;
          const c2d = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
          if (!c2d)
            throw new EngineError("internal", "Could not read decoded frames.", "Try again.");
          const { data } = c2d.getImageData(0, 0, dims.width, dims.height);
          lastPalette = quantize(data, MAX_COLORS, { format: "rgb565" });
          lastIndex = applyPalette(data, lastPalette, "rgb565");
        }
        // A timestamp past the last decodable frame repeats the previous frame so timing stays honest.
        if (lastIndex && lastPalette) {
          gif.writeFrame(lastIndex, dims.width, dims.height, {
            palette: lastPalette,
            delay: (delays[done] ?? delays[delays.length - 1] ?? 8) * 10,
            repeat,
          });
        }
        done++;
        ctx.onProgress({
          phase: "processing",
          ratio: done / total,
          detail: `Frame ${done.toLocaleString()} of ${total.toLocaleString()}`,
        });
      }
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    }

    if (done === 0 || !lastIndex) {
      throw new EngineError(
        "internal",
        "No frames could be decoded in the chosen range.",
        "Move the range and try again.",
      );
    }
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    gif.finish();
    const bytes = gif.bytes();
    return {
      blob: new Blob([bytes as BlobPart], { type: "image/gif" }),
      filename: outputName,
      ffmpegCommand,
      meta: `${formatDimensions(dims.width, dims.height)} · ${withUnit(done.toLocaleString(), "frames")}`,
    };
  },
};
