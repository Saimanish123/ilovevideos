/**
 * One ffmpeg.wasm run with several input files (a video plus a subtitle file, fonts or a logo), on
 * the page thread. Threads are pinned like every other ffmpeg runner (decoder 1 before -i, encoder
 * ≤ 4 after, filter graphs 1: the automatic count deadlocks the WASM pthread pool). Progress is real:
 * ffmpeg's `frame=` count against the expected frames when re-encoding, its time-based progress for
 * stream copies. After an error exit or a cancel the core is dropped; the next load is cached.
 */
import { frameProgress } from "../crop/progress";
import { classifyError, EngineError } from "../errors";
import { FFMPEG_THREADS, loadFFmpeg } from "../ffmpeg";
import { ffmpegFailure } from "../ffmpeg/failures";
import { type MountedInput, mountInput } from "../ffmpeg/mount";
import type { EngineContext } from "../types";

export interface FfmpegFile {
  /** Path inside ffmpeg's memory file system, e.g. "input.mp4" or "/fonts/Geist-Regular.ttf". */
  path: string;
  data: File | Uint8Array;
}

export interface FfmpegRun {
  files: FfmpegFile[];
  /** Arguments between the pinned thread flags and `-y <output>`; must include every `-i`. */
  inputArgs: string[];
  outputArgs: string[];
  outPath: string;
  /** Frames expected when re-encoding (progress by frame); omit for stream copies. */
  frames?: number;
  /** Shown while the input files are written into ffmpeg's memory. */
  readingLabel: string;
  /** The output format's name ("MP4"), for failures that name it. */
  container?: string;
  failureHint: string;
  ctx: EngineContext;
}

export async function runFfmpeg(run: FfmpegRun): Promise<Uint8Array> {
  const { ctx } = run;
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  const args = [
    "-hide_banner",
    "-threads",
    "1",
    ...run.inputArgs,
    "-threads",
    FFMPEG_THREADS,
    "-filter_threads",
    "1",
    "-filter_complex_threads",
    "1",
    ...run.outputArgs,
    "-y",
    run.outPath,
  ];
  const tail: string[] = [];
  const report = run.frames ? frameProgress(ctx, run.frames) : undefined;
  const onLog = ({ message }: { message: string }) => {
    tail.push(message);
    // Enough log for the input description, the stream mapping and the reason (../ffmpeg/failures).
    if (tail.length > 60) tail.shift();
    const f = report && run.frames ? /frame=\s*(\d+)/.exec(message) : null;
    if (f && report && run.frames)
      report({ phase: "processing", ratio: Math.min(run.frames, Number(f[1])) / run.frames });
  };
  const onProgress = ({ progress }: { progress: number }) => {
    if (report) return;
    const ratio = Math.min(1, Math.max(0, progress));
    ctx.onProgress({ phase: "processing", ratio, detail: `${Math.round(ratio * 100)}% copied` });
  };
  const dispose = () => {
    try {
      ff.terminate();
    } catch {
      // already gone
    }
  };
  const onAbort = () => dispose();
  ff.on("log", onLog);
  ff.on("progress", onProgress);
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  const written: string[] = [];
  const mounted: MountedInput[] = [];
  try {
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: run.readingLabel });
    for (const f of run.files) {
      if (f.data instanceof File) {
        // A media file is mounted, not copied into WASM memory (../ffmpeg/mount); its `-i` follows.
        const m = await mountInput(ff, f.data);
        mounted.push(m);
        for (let i = 0; i < args.length; i++) if (args[i] === f.path) args[i] = m.path;
        continue;
      }
      const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
      if (dir) await ff.createDir(dir).catch(() => undefined);
      await ff.writeFile(f.path, f.data);
      written.push(f.path);
    }
    const code = await ff.exec(args);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code !== 0) {
      dispose();
      throw ffmpegFailure(tail, code, { container: run.container, hint: run.failureHint });
    }
    const data = await ff.readFile(run.outPath);
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    return typeof data === "string" ? new TextEncoder().encode(data) : data;
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ff.off("log", onLog);
    ff.off("progress", onProgress);
    ctx.signal.removeEventListener("abort", onAbort);
    if (ff.loaded) {
      for (const p of [...written, run.outPath]) await ff.deleteFile(p).catch(() => undefined);
      for (const m of mounted) await m.release();
    }
  }
}
