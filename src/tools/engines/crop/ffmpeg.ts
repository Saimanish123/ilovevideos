/**
 * Crop and aspect-ratio for containers the native reader cannot open (AVI, WMV, FLV, MPEG-PS, ...),
 * with ffmpeg.wasm on the page thread. Always writes MP4 (H.264 + AAC). Threads are pinned like the
 * other ffmpeg runners (decoder 1 before -i, encoder ≤ 4 after, filter graphs 1): the automatic
 * count deadlocks the WASM pthread pool. Progress comes from ffmpeg's `frame=` lines against the
 * expected frame count.
 */
import { baseName, formatDimensions } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { FFMPEG_THREADS, loadFFmpeg } from "../ffmpeg";
import { ffmpegFailure } from "../ffmpeg/failures";
import { type MountedInput, mountInput } from "../ffmpeg/mount";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { geometryCommand, padFilter } from "./math";
import { cropPlanFilter, type GeometryPlan, geometryBitrate, outputSize } from "./plan";
import { frameProgress, totalFrames } from "./progress";

export async function geometryWithFfmpeg(
  file: File,
  info: MediaInfo,
  plan: GeometryPlan,
  suffix: string,
  ctx: EngineContext,
  /** Page-specific words for the result line (see ./native `runGeometry`). */
  labels?: { what?: string },
): Promise<EngineResult> {
  const v = info.video;
  if (!v) {
    throw new EngineError(
      "unsupported-input",
      "This file has no video track to reshape.",
      "Choose a video file.",
    );
  }
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");

  const size = outputSize(plan);
  const kbps = Math.round(geometryBitrate(size, v.fps, v) / 1000);
  const filter =
    plan.kind === "crop"
      ? cropPlanFilter(plan)
      : padFilter(plan.layout, { width: v.width, height: v.height }, plan.color);
  const hasAudio = !!info.audio?.length;
  const outName = "output.mp4";
  const outputName = `${baseName(file.name)}-${suffix}.mp4`;
  const end = plan.end !== undefined && plan.end < info.durationSec ? plan.end : undefined;
  const total = totalFrames(end ?? info.durationSec, v.fps);
  const report = frameProgress(ctx, total);
  const args = (inName: string) => [
    "-hide_banner",
    "-threads",
    "1",
    "-i",
    inName,
    "-threads",
    FFMPEG_THREADS,
    "-filter_threads",
    "1",
    "-filter_complex_threads",
    "1",
    ...(end !== undefined ? ["-t", String(end)] : []),
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    `${kbps}k`,
    "-pix_fmt",
    "yuv420p",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "-y",
    outName,
  ];

  const tail: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    tail.push(message);
    if (tail.length > 60) tail.shift();
    const f = /frame=\s*(\d+)/.exec(message);
    if (f) {
      report({ phase: "processing", ratio: Math.min(total, Number(f[1])) / total });
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
  let input: MountedInput | undefined;
  try {
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    // The input is mounted, not copied into ffmpeg's memory (../ffmpeg/mount).
    input = await mountInput(ff, file);
    const code = await ff.exec(args(input.path));
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code !== 0) {
      dispose();
      throw ffmpegFailure(tail, code, {
        container: "MP4",
        hint: "Convert the file to MP4 first, then try again.",
      });
    }
    const data = await ff.readFile(outName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    const what =
      labels?.what ??
      (plan.kind === "crop"
        ? "cropped"
        : plan.color === "blur"
          ? "blurred background added"
          : `${plan.color} bars added`);
    return {
      blob: new Blob([bytes as BlobPart], { type: "video/mp4" }),
      filename: outputName,
      ffmpegCommand: geometryCommand(file.name, outputName, filter, kbps, false, end),
      meta: `${formatDimensions(v.width, v.height)} → ${formatDimensions(size.width, size.height)} · ${what} · re-encoded`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ff.off("log", onLog);
    ctx.signal.removeEventListener("abort", onAbort);
    await input?.release();
    if (ff.loaded) await ff.deleteFile(outName).catch(() => undefined);
  }
}
