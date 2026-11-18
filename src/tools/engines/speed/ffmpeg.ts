/**
 * Change speed with ffmpeg.wasm on the page thread. Threads are pinned exactly like the other
 * ffmpeg runners (decoder 1 before -i, encoder ≤ 4 after, filter graphs 1): the automatic count
 * deadlocks the WASM pthread pool. Progress comes from ffmpeg's own `frame=` lines against the
 * expected output frame count, because the library's ratio is measured against the input duration
 * and would stop at 50% for a 2× run.
 */
import { baseName, formatDimensions, shellQuote } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { FFMPEG_THREADS, loadFFmpeg, shellArg } from "../ffmpeg";
import { ffmpegFailure } from "../ffmpeg/failures";
import { mountInput } from "../ffmpeg/mount";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import type { SpeedOptions } from "./index";
import {
  audioFilter,
  audioSpeedTarget,
  expectedFrames,
  formatSpeed,
  formatSpeedDuration,
  outputDuration,
} from "./math";

/** NTSC rates as ffmpeg writes them, so 29.97 fps stays 30000/1001 and does not drift. */
export function frameRateArg(fps: number | undefined): string {
  const f = fps && fps > 0 && Number.isFinite(fps) ? fps : 30;
  for (const base of [24, 30, 60, 120])
    if (Math.abs(f - (base * 1000) / 1001) < 0.005) return `${base * 1000}/1001`;
  return Number(f.toFixed(3)).toString();
}

/** True when H.264 (4:2:0) cannot take the picture as it is: an odd width or height. */
export const oddSize = (v: { width: number; height: number } | undefined) =>
  !!v && (v.width % 2 === 1 || v.height % 2 === 1);

/**
 * The picture filter. `setpts` alone left the output at the source's frame rate with ffmpeg's frame
 * rate conversion deciding which frames to keep: at 2× the first five source frames played at 1×
 * and the picture then ran 67 ms behind the sound for the whole clip (77 frames for 75; QA
 * 2026-10-08, the same with local FFmpeg 9). `fps=<source rate>:round=up` after it keeps the source
 * rate and picks source frame N×k for output frame k (2×: 0, 2, 4, ...; 8×: 0, 8, 16, ...), and
 * repeats frames when slowing down. An odd size is cropped by one pixel row or column to even, which
 * libx264 with 4:2:0 needs (it failed on 641×361).
 */
export function speedVideoFilter(speed: number, video: MediaInfo["video"]): string {
  const crop = oddSize(video) ? "crop=trunc(iw/2)*2:trunc(ih/2)*2," : "";
  return `${crop}setpts=PTS/${speed},fps=${frameRateArg(video?.fps)}:round=up`;
}

/** Arguments after `-i <input>`; shared by the run and the command shown on the result card. */
export function speedArgs(options: SpeedOptions, info: MediaInfo): string[] {
  const hasAudio = !!info.audio?.length && !options.muteAudio;
  const sampleRate = info.audio?.[0]?.sampleRate ?? 48_000;
  const video = ["-vf", speedVideoFilter(options.speed, info.video)];
  const audio = hasAudio
    ? [
        "-af",
        audioFilter(options.speed, options.keepPitch, sampleRate),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
      ]
    : ["-an"];
  return [
    ...video,
    ...audio,
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
    "-f",
    "mp4",
  ];
}

export const speedOutputName = (inputName: string, speed: number, extension = "mp4") =>
  `${baseName(inputName)}-${formatSpeed(speed).replace("×", "x").replace(".", "-")}.${extension}`;

export function audioSpeedArgs(options: SpeedOptions, info: MediaInfo): string[] {
  const t = audioSpeedTarget(info);
  const sampleRate = info.audio?.[0]?.sampleRate ?? 48_000;
  return [
    "-map",
    "0:a:0",
    "-af",
    audioFilter(options.speed, options.keepPitch, sampleRate),
    "-c:a",
    t.format.encode.ffmpeg,
    ...(t.bitrateKbps ? ["-b:a", `${t.bitrateKbps}k`] : []),
    ...(t.format.encode.args ?? []),
    "-map_metadata",
    "0",
    "-f",
    t.format.ffmpegFormat,
  ];
}

export const speedCommand = (
  inputName: string,
  outputName: string,
  options: SpeedOptions,
  info: MediaInfo,
) =>
  `ffmpeg -i ${shellQuote(inputName)} ${speedArgs(options, info).map(shellArg).join(" ")} ${shellQuote(outputName)}`;

export async function speedWithFfmpeg(
  file: File,
  info: MediaInfo,
  options: SpeedOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  const v = info.video;
  const audioOnly = !v;
  if (audioOnly && !info.audio?.length) {
    throw new EngineError(
      "unsupported-input",
      "This file has no sound or picture to change the speed of.",
      "Choose a video or an audio file.",
    );
  }
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");

  // Mounted, not copied into WASM memory (../ffmpeg/mount).
  const input = await mountInput(ff, file);
  const inName = input.path;
  const audioTarget = audioOnly ? audioSpeedTarget(info) : undefined;
  const extension = audioTarget?.format.extension ?? "mp4";
  const outName = `output.${extension}`;
  const outputName = speedOutputName(file.name, options.speed, extension);
  const total = v ? expectedFrames(info.durationSec, v.fps, options.speed) : 0;
  const totalSec = outputDuration(info.durationSec, options.speed);
  const outputArgs = audioOnly ? audioSpeedArgs(options, info) : speedArgs(options, info);
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
    "-filter_complex_threads",
    "1",
    ...outputArgs,
    "-y",
    outName,
  ];

  const tail: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    tail.push(message);
    if (tail.length > 60) tail.shift();
    // Sound alone has no frames: progress is the output time reached against the new length.
    const tm = audioOnly ? /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message) : null;
    if (tm && totalSec > 0) {
      const done = Math.min(totalSec, Number(tm[1]) * 3600 + Number(tm[2]) * 60 + Number(tm[3]));
      ctx.onProgress({
        phase: "processing",
        ratio: done / totalSec,
        detail: `${formatSpeedDuration(done)} of ${formatSpeedDuration(totalSec)} written`,
      });
    }
    const f = audioOnly ? null : /frame=\s*(\d+)/.exec(message);
    if (f) {
      const done = Math.min(total, Number(f[1]));
      ctx.onProgress({
        phase: "processing",
        ratio: done / total,
        detail: `Frame ${done.toLocaleString()} of ${total.toLocaleString()}`,
      });
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
    const code = await ff.exec(args);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code !== 0) {
      dispose();
      throw ffmpegFailure(tail, code, {
        container: audioTarget?.format.name ?? "MP4",
        hint: "Try a speed closer to 1×.",
      });
    }
    const data = await ff.readFile(outName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    const audioNote =
      options.muteAudio || !info.audio?.length
        ? "no audio"
        : options.keepPitch
          ? "pitch kept"
          : "pitch shifted";
    return {
      blob: new Blob([bytes as BlobPart], { type: audioTarget?.format.mime ?? "video/mp4" }),
      filename: outputName,
      ffmpegCommand: audioOnly
        ? `ffmpeg -i ${shellQuote(file.name)} ${outputArgs.map(shellArg).join(" ")} ${shellQuote(outputName)}`
        : speedCommand(file.name, outputName, options, info),
      meta: [
        `${formatSpeedDuration(info.durationSec)} → ${formatSpeedDuration(outputDuration(info.durationSec, options.speed))}`,
        audioNote,
        v && oddSize(v)
          ? `${formatDimensions(v.width, v.height)} cropped to ${formatDimensions(v.width - (v.width % 2), v.height - (v.height % 2))}: H.264 needs an even size`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ff.off("log", onLog);
    ctx.signal.removeEventListener("abort", onAbort);
    if (ff.loaded) {
      await input.release();
      await ff.deleteFile(outName).catch(() => undefined);
    }
  }
}
