/**
 * GIF → video (feature B5). Native path, in the engine worker: the browser's own `ImageDecoder`
 * decodes each frame fully composited (disposal and transparency already applied), the frame is drawn
 * on a white canvas with even edges, and WebCodecs encodes it as H.264 (MP4) or VP9 (WebM) with the
 * GIF's own per-frame delays as timestamps, so the video keeps the timing the GIF had in a browser.
 * Browsers without `ImageDecoder` take the ffmpeg.wasm runner on the page (./ffmpeg, engines/page-runners).
 * A GIF has no sound, so the output has no audio track.
 */
import {
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from "mediabunny";
import { formatCount, formatDimensions, formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { openOutputStore } from "../mediabunny/output-store";
import type { Engine } from "../types";
import { GifParseError, parseGif } from "./gif";
import { evenSize, GifToVideoOptions, gifCommand, outputName } from "./options";

export const hasImageDecoder = () => typeof ImageDecoder !== "undefined";

export const gifToVideoEngine: Engine<GifToVideoOptions> = {
  id: "gif-to-video",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: GifToVideoOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs" || !hasImageDecoder()) return false;
    if (!(await ImageDecoder.isTypeSupported("image/gif"))) return false;
    const v = input.info?.video;
    const size = evenSize(v?.width ?? 640, v?.height ?? 360);
    return canEncodeVideo(options.to === "webm" ? "vp9" : "avc", size);
  },
  async run(_backend, inputs, options, ctx) {
    const file = inputs[0]?.file;
    if (!file) throw new EngineError("internal", "No input file.");
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the GIF" });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let facts: ReturnType<typeof parseGif>;
    try {
      facts = parseGif(bytes);
    } catch (e) {
      if (e instanceof GifParseError)
        throw new EngineError("unsupported-input", e.message, "Choose an animated .gif file.");
      throw e;
    }
    const size = evenSize(facts.width, facts.height);
    // A long GIF repeated many times can make a large video: big outputs stream to disk storage
    // (../mediabunny/output-store). The estimate is generous (0.2 bytes per pixel per frame).
    const expected = Math.max(
      file.size,
      facts.delays.length * options.repeat * size.width * size.height * 0.2,
    );
    const store = await openOutputStore(expected);
    const output = new Output({
      format:
        options.to === "webm"
          ? new WebMOutputFormat()
          : new Mp4OutputFormat({ fastStart: store.streamed ? false : "in-memory" }),
      target: store.target,
    });
    const decoder = new ImageDecoder({ data: bytes, type: "image/gif" });
    try {
      await decoder.tracks.ready;
      await decoder.completed;
      const decodable = decoder.tracks.selectedTrack?.frameCount ?? facts.delays.length;
      const frames = Math.min(decodable, facts.delays.length);
      if (frames === 0)
        throw new EngineError("unsupported-input", "The GIF has no frames.", "Choose another GIF.");

      const canvas = new OffscreenCanvas(size.width, size.height);
      const c2d = canvas.getContext("2d", { alpha: false });
      if (!c2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
      c2d.imageSmoothingQuality = "high";
      const source = new CanvasSource(canvas, {
        codec: options.to === "webm" ? "vp9" : "avc",
        quality: QUALITY_HIGH,
        keyFrameInterval: 2,
      });
      output.addVideoTrack(source);
      await output.start();

      const total = frames * options.repeat;
      let t = 0;
      let done = 0;
      for (let pass = 0; pass < options.repeat; pass++) {
        for (let i = 0; i < frames; i++) {
          if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
          const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
          c2d.fillStyle = "rgb(255 255 255)";
          c2d.fillRect(0, 0, size.width, size.height);
          c2d.drawImage(image, 0, 0, size.width, size.height);
          image.close();
          const d = facts.delays[i] ?? 0.1;
          await source.add(t, d);
          t += d;
          done += 1;
          ctx.onProgress({
            phase: "processing",
            ratio: done / total,
            detail: `Encoding frame ${done.toLocaleString("en")} of ${total.toLocaleString("en")}`,
          });
        }
      }
      source.close();
      ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
      await output.finalize();
      const data = await store.finish();
      const name = outputName(file.name, options.to);
      return {
        blob: new Blob([data], { type: options.to === "webm" ? "video/webm" : "video/mp4" }),
        filename: name,
        ffmpegCommand: gifCommand(file.name, options, frames, name),
        meta: `${formatDimensions(size.width, size.height)} · ${formatCount(total, "frame")} · ${formatDuration(t)} · ${options.to === "webm" ? "VP9" : "H.264"}`,
      };
    } catch (e) {
      await output.cancel().catch(() => undefined);
      await store.discard();
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    } finally {
      decoder.close();
    }
  },
};
