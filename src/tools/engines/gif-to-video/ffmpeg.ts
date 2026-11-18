/**
 * GIF → video with ffmpeg.wasm on the page, for browsers without `ImageDecoder`. ffmpeg's GIF decoder
 * applies each frame's delay and disposal itself and paints transparent pixels white, matching the
 * native path. Threads are pinned like every other ffmpeg runner (decoder 1 before -i, encoder ≤ 4,
 * filter graphs 1): the automatic count deadlocks the WASM pthread pool. Progress is the `frame=`
 * count against the frames the run will write.
 */
import { formatCount, formatDimensions, formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { FFMPEG_THREADS, loadFFmpeg } from "../ffmpeg";
import { ffmpegFailure } from "../ffmpeg/failures";
import { mountInput } from "../ffmpeg/mount";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { evenSize, frameCountOf, type GifToVideoOptions, gifCommand, outputName } from "./options";

export async function gifToVideoWithFfmpeg(
  file: File,
  info: MediaInfo,
  options: GifToVideoOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  const frames = frameCountOf(info);
  const total = frames * options.repeat;
  const size = evenSize(info.video?.width ?? 2, info.video?.height ?? 2);
  const loop = options.repeat > 1 ? `loop=loop=${options.repeat - 1}:size=${frames}:start=0,` : "";
  // Mounted, not copied into WASM memory (../ffmpeg/mount).
  const input = await mountInput(ff, file);
  const inName = input.path;
  const outName = `output.${options.to}`;
  const codec =
    options.to === "webm"
      ? ["-c:v", "libvpx", "-b:v", "1M", "-deadline", "realtime", "-cpu-used", "8"]
      : [
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
        ];
  const args = [
    "-hide_banner",
    "-threads",
    "1",
    "-i",
    inName,
    "-threads",
    FFMPEG_THREADS,
    "-filter_threads",
    "1",
    "-vf",
    `${loop}scale=${size.width}:${size.height}`,
    ...codec,
    "-an",
    "-y",
    outName,
  ];
  const tail: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    tail.push(message);
    // Enough log for the input description, the stream mapping and the reason (../ffmpeg/failures).
    if (tail.length > 60) tail.shift();
    const f = /frame=\s*(\d+)/.exec(message);
    if (f) {
      const n = Math.min(total, Number(f[1]));
      ctx.onProgress({
        phase: "processing",
        ratio: n / total,
        detail: `Encoding frame ${n.toLocaleString("en")} of ${total.toLocaleString("en")}`,
      });
    }
  };
  const dispose = () => {
    try {
      ff.terminate();
    } catch {
      // already gone
    }
  };
  ff.on("log", onLog);
  ctx.signal.addEventListener("abort", dispose, { once: true });
  try {
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the GIF" });
    const code = await ff.exec(args);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code !== 0) {
      dispose();
      throw ffmpegFailure(tail, code, {
        container: "MP4",
        hint: "Try again, or open the page in desktop Chrome, Edge or Firefox.",
      });
    }
    const data = await ff.readFile(outName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    const name = outputName(file.name, options.to);
    return {
      blob: new Blob([bytes as BlobPart], {
        type: options.to === "webm" ? "video/webm" : "video/mp4",
      }),
      filename: name,
      ffmpegCommand: gifCommand(file.name, options, frames, name),
      meta: `${formatDimensions(size.width, size.height)} · ${formatCount(total, "frame")} · ${formatDuration(info.durationSec * options.repeat)} · ${options.to === "webm" ? "VP8" : "H.264"}`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ff.off("log", onLog);
    ctx.signal.removeEventListener("abort", dispose);
    if (ff.loaded) {
      await input.release();
      await ff.deleteFile(outName).catch(() => undefined);
    }
  }
}
