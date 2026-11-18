/**
 * Picture re-encodes for containers the native reader cannot open (AVI, WMV, FLV, MPEG-PS, ...),
 * with ffmpeg.wasm on the page thread: one `-vf` chain (colour, fades, frame rate, borders) and,
 * when asked, one `-af` chain. Always writes MP4 (H.264 + AAC). Threads are pinned like the other
 * ffmpeg runners (decoder 1 before -i, encoder ≤ 4 after, filter graphs 1): the automatic count
 * deadlocks the WASM pthread pool. Progress comes from ffmpeg's `frame=` lines.
 */
import { baseName, shellQuote } from "@/lib/format";
import { encodedSize, withEvenCrop } from "../crop/math";
import { reencodeBitrate } from "../crop/plan";
import { frameProgress } from "../crop/progress";
import { classifyError, EngineError } from "../errors";
import { FFMPEG_THREADS, loadFFmpeg } from "../ffmpeg";
import { ffmpegFailure } from "../ffmpeg/failures";
import { type MountedInput, mountInput } from "../ffmpeg/mount";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { sizeWords } from "./plan";

export interface FfmpegPictureJob {
  file: File;
  info: MediaInfo;
  vf: string;
  /** Audio filter; the sound is encoded to AAC either way (ffmpeg-only sources rarely hold AAC). */
  af?: string;
  /** Output frame rate, when the run changes it (for the bitrate and the progress total). */
  fps?: number;
  /** Output size when the filter changes it. */
  size?: { width: number; height: number };
  suffix: string;
  what: string;
  /** Frames the output will have, for progress. */
  frames: number;
  ctx: EngineContext;
}

export async function pictureWithFfmpeg(job: FfmpegPictureJob): Promise<EngineResult> {
  const { file, info, ctx } = job;
  const v = info.video;
  if (!v) {
    throw new EngineError(
      "unsupported-input",
      "This file has no video track to change.",
      "Choose a video file.",
    );
  }
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  // H.264 takes only even edges: an odd source loses its last column or row, never scaled
  // (../crop/math `encodedSize`), the same cut the native path makes.
  const vf = job.size ? job.vf : withEvenCrop(v, job.vf);
  const size = job.size ?? encodedSize(v);
  const kbps = Math.round(reencodeBitrate({ size, fps: job.fps ?? v.fps, source: v }) / 1000);
  const hasAudio = !!info.audio?.length;
  const outName = "output.mp4";
  const outputName = `${baseName(file.name)}-${job.suffix}.mp4`;
  const report = frameProgress(ctx, job.frames);
  const audioArgs = hasAudio
    ? [...(job.af ? ["-af", job.af] : []), "-c:a", "aac", "-b:a", "128k"]
    : ["-an"];
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
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    `${kbps}k`,
    "-pix_fmt",
    "yuv420p",
    ...audioArgs,
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
    if (f) report({ phase: "processing", ratio: Math.min(job.frames, Number(f[1])) / job.frames });
  };
  // After an error exit or a cancel the multithreaded core is not reliable; drop it.
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
    const audio = hasAudio ? `${job.af ? `-af "${job.af}" ` : ""}-c:a aac -b:a 128k` : "-an";
    return {
      blob: new Blob([bytes as BlobPart], { type: "video/mp4" }),
      filename: outputName,
      ffmpegCommand: `ffmpeg -i ${shellQuote(file.name)} -vf "${vf}" -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p ${audio} -movflags +faststart ${shellQuote(outputName)}`,
      meta: `${job.what} · ${sizeWords(v, size)} · re-encoded · ${hasAudio ? "sound encoded to AAC" : "no sound"}`,
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
