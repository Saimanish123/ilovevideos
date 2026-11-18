/**
 * Stabilize, first pass: every frame decoded once at the analysis size (./options), turned grey,
 * and aligned with the one before it (./motion). Frames come in presentation order from
 * mediabunny's CanvasSink, drawn as the picture is shown (rotation applied), the space the second
 * pass draws in. Runs in the engine worker; no network access.
 */
import { CanvasSink, type InputVideoTrack } from "mediabunny";
import { EngineError } from "../errors";
import type { EngineContext } from "../types";
import { estimateMotion, type Gray, IDENTITY, type Motion, plausible, pyramid } from "./motion";

export interface Analysis {
  /** Source timestamps of the frames, in order. */
  times: number[];
  /** Motion from each frame to the one before it (identity for the first and after a cut). */
  motions: Motion[];
  /** The analysis size the motions are measured in. */
  size: { width: number; height: number };
  /** Pairs that did not line up (cuts, flashes) and were taken as still. */
  breaks: number;
}

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4)
    data[i] = 0.299 * (rgba[j] ?? 0) + 0.587 * (rgba[j + 1] ?? 0) + 0.114 * (rgba[j + 2] ?? 0);
  return { data, width, height };
}

export async function analyzeMotion(
  track: InputVideoTrack,
  size: { width: number; height: number },
  expectedFrames: number,
  ctx: EngineContext,
): Promise<Analysis> {
  const sink = new CanvasSink(track, {
    width: size.width,
    height: size.height,
    fit: "fill",
    poolSize: 2,
  });
  const times: number[] = [];
  const motions: Motion[] = [];
  let prev: Gray[] | null = null;
  let guess = IDENTITY;
  let breaks = 0;
  const total = Math.max(1, expectedFrames);
  for await (const wrapped of sink.canvases()) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    const canvas = wrapped.canvas as OffscreenCanvas;
    const c2d = canvas.getContext("2d", {
      willReadFrequently: true,
    }) as OffscreenCanvasRenderingContext2D | null;
    if (!c2d) throw new EngineError("internal", "Could not read decoded frames.", "Try again.");
    const { data } = c2d.getImageData(0, 0, size.width, size.height);
    const levels = pyramid(toGray(data, size.width, size.height));
    if (!prev) motions.push(IDENTITY);
    else {
      const e = estimateMotion(prev, levels, guess);
      if (plausible(e, size.width, size.height)) {
        motions.push(e.motion);
        guess = e.motion;
      } else {
        motions.push(IDENTITY);
        guess = IDENTITY;
        breaks++;
      }
    }
    times.push(wrapped.timestamp);
    prev = levels;
    const n = times.length;
    if (n % 5 === 0 || n === total)
      ctx.onProgress({
        phase: "analyzing",
        ratio: Math.min(0.99, n / total),
        detail: `Measuring motion, frame ${n.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")}`,
      });
  }
  return { times, motions, size, breaks };
}

/** Index of the frame whose timestamp is nearest `t` (times ascending). */
export function nearestFrame(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs((times[lo - 1] as number) - t) <= Math.abs((times[lo] as number) - t))
    return lo - 1;
  return lo;
}
