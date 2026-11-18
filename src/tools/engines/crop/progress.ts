/**
 * Progress for geometry runs: frames written out of the total, plus time left once the rate is known.
 * Time left is measured, not guessed: it appears after 2 s and 3% of the work, from the real rate so
 * far. Pure apart from the clock passed in; used by the native runner and the ffmpeg runner.
 */
import { formatDuration } from "@/lib/format";
import type { EngineContext, Progress } from "../types";

export function frameProgress(
  ctx: EngineContext,
  totalFrames: number,
  now: () => number = () => performance.now(),
): EngineContext["onProgress"] {
  let started: number | undefined;
  return (p: Progress) => {
    if (p.phase !== "processing") {
      ctx.onProgress(p);
      return;
    }
    const t = now();
    started ??= t;
    const ratio = Math.min(1, Math.max(0, p.ratio));
    const frame = Math.min(totalFrames, Math.round(ratio * totalFrames));
    const elapsed = (t - started) / 1000;
    const left = ratio > 0.03 && elapsed >= 2 ? (elapsed / ratio) * (1 - ratio) : undefined;
    const detail = `Frame ${frame.toLocaleString("en")} of ${totalFrames.toLocaleString("en")}${
      left !== undefined ? ` · about ${formatDuration(Math.max(1, left))} left` : ""
    }`;
    ctx.onProgress({ ...p, ratio, detail });
  };
}

export const totalFrames = (durationSec: number, fps: number | undefined) =>
  Math.max(1, Math.round(durationSec * (fps && fps > 0 && Number.isFinite(fps) ? fps : 30)));
