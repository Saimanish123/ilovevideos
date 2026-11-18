/**
 * Video → GIF, "best" quality: ffmpeg.wasm's two-pass palettegen → paletteuse with error-diffusion
 * dithering, the same recipe people copy from the ffmpeg wiki. Runs on the page thread like the
 * other ffmpeg work (see ../ffmpeg). Two separate passes rather than a split filtergraph so the
 * frames are not all buffered in WASM memory and each pass reports its own progress.
 */
import { baseName, formatDimensions, withUnit } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { FFMPEG_THREADS, loadFFmpeg } from "../ffmpeg";
import { ffmpegFailure } from "../ffmpeg/failures";
import { mountInput } from "../ffmpeg/mount";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { frameCount, gifDimensions } from "./math";
import { gifFfmpegCommand, type VideoToGifOptions } from "./options";

const PALETTE_SHARE = 0.35;

export async function gifWithFfmpeg(
  file: File,
  info: MediaInfo,
  options: VideoToGifOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  const v = info.video;
  if (!v) {
    throw new EngineError(
      "unsupported-input",
      "This file has no video track to turn into a GIF.",
      "Choose a video file.",
    );
  }
  const dims = gifDimensions(v.width, v.height, options.width);
  const total = frameCount(options.start, options.end, options.fps);
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");

  // Mounted, not copied into WASM memory (../ffmpeg/mount).
  const input = await mountInput(ff, file);
  const inName = input.path;
  const paletteName = "palette.png";
  const outName = "output.gif";
  const outputName = `${baseName(file.name)}.gif`;
  const range = ["-ss", options.start.toFixed(3), "-t", (options.end - options.start).toFixed(3)];
  const scale = `fps=${options.fps},scale=${dims.width}:${dims.height}:flags=lanczos`;
  // Decoder threads pinned to 1 and filter graphs too: ffmpeg's automatic filter thread count is the
  // CPU count, which deadlocks the WASM pthread pool exactly like the encoder does (see ../ffmpeg).
  const head = ["-hide_banner", "-threads", "1", ...range, "-i", inName];
  const threads = [
    "-threads",
    FFMPEG_THREADS,
    "-filter_threads",
    "1",
    "-filter_complex_threads",
    "1",
  ];
  const passOne = [...head, ...threads, "-an", "-vf", `${scale},palettegen`, "-y", paletteName];
  const passTwo = [
    ...head,
    "-i",
    paletteName,
    ...threads,
    "-an",
    "-lavfi",
    `${scale}[x];[x][1:v]paletteuse=dither=sierra2_4a`,
    "-loop",
    options.loop ? "0" : "-1",
    "-f",
    "gif",
    "-y",
    outName,
  ];

  const tail: string[] = [];
  let pass: 1 | 2 = 1;
  let encoded = 0;
  const onLog = ({ message }: { message: string }) => {
    tail.push(message);
    if (tail.length > 60) tail.shift();
    if (pass === 1) {
      const t = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
      if (t) {
        const sec = Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]);
        const ratio = Math.min(1, sec / Math.max(0.001, options.end - options.start));
        ctx.onProgress({
          phase: "analyzing",
          ratio: ratio * PALETTE_SHARE,
          detail: `Building the palette, ${Math.round(ratio * 100)}%`,
        });
      }
    } else {
      const f = /frame=\s*(\d+)/.exec(message);
      if (f) {
        const done = Math.min(total, Number(f[1]));
        encoded = Math.max(encoded, Number(f[1]));
        ctx.onProgress({
          phase: "processing",
          ratio: PALETTE_SHARE + (done / total) * (1 - PALETTE_SHARE),
          detail: `Frame ${done.toLocaleString()} of ${total.toLocaleString()}`,
        });
      }
    }
  };
  // After an error exit or a cancel the multithreaded core is not reliable; drop it and the next
  // load is served from the browser cache.
  const dispose = () => {
    try {
      ff.terminate();
    } catch {
      // already gone
    }
  };
  const onAbort = () => dispose();
  ff.on("log", onLog);
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  try {
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    const code1 = await ff.exec(passOne);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code1 !== 0) throw exitError(code1, tail, dispose);
    pass = 2;
    ctx.onProgress({ phase: "processing", ratio: PALETTE_SHARE, detail: "Palette ready" });
    const code2 = await ff.exec(passTwo);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code2 !== 0) throw exitError(code2, tail, dispose);
    const data = await ff.readFile(outName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    return {
      blob: new Blob([bytes as BlobPart], { type: "image/gif" }),
      filename: outputName,
      ffmpegCommand: gifFfmpegCommand(file.name, outputName, options, dims),
      meta: `${formatDimensions(dims.width, dims.height)} · ${withUnit((encoded || total).toLocaleString(), "frames")}`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ff.off("log", onLog);
    ctx.signal.removeEventListener("abort", onAbort);
    if (ff.loaded) {
      await input.release();
      await ff.deleteFile(paletteName).catch(() => undefined);
      await ff.deleteFile(outName).catch(() => undefined);
    }
  }
}

function exitError(code: number, tail: string[], dispose: () => void): EngineError {
  dispose();
  return ffmpegFailure(tail, code, {
    container: "GIF",
    hint: "Try the fast quality, a shorter range or a smaller width.",
  });
}
