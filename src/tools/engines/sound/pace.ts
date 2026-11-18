/**
 * Keeping long sound jobs responsive. Measured on a 3-hour, 1.9 GB WAV (2026-10-08): decoding PCM
 * never leaves the worker's microtask queue, so a Cancel message waited until the whole job was
 * done (43 s after Cancel on remove silence; normalise ran to 100 %), and a progress message for
 * every decoded block (over 100 000) kept the page thread busy for about 30 s after the worker had
 * finished. `breathe` hands the worker's event loop a turn every 50 ms, so a cancel is seen within
 * that; `paced` passes on at most one progress report every 100 ms, plus every change of phase.
 * Pure timing helpers; no DOM, no mediabunny.
 */
import type { Progress } from "../types";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** An `await`able that yields to the event loop (a macrotask) at most every `ms` milliseconds. */
export function breather(ms = 50): () => Promise<void> {
  let last = now();
  return async () => {
    if (now() - last < ms) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    last = now();
  };
}

/** `report`, called at most every `ms` milliseconds; a new phase always goes through. */
export function paced(report: (p: Progress) => void, ms = 100): (p: Progress) => void {
  let last = Number.NEGATIVE_INFINITY;
  let phase: Progress["phase"] | undefined;
  return (p) => {
    const t = now();
    if (p.phase === phase && t - last < ms) return;
    last = t;
    phase = p.phase;
    report(p);
  };
}

/** A ratio callback called at most every `ms` milliseconds, and always for the last step (1). */
export function pacedRatio(
  report: ((ratio: number) => void) | undefined,
  ms = 100,
): ((ratio: number) => void) | undefined {
  if (!report) return undefined;
  let last = Number.NEGATIVE_INFINITY;
  return (r) => {
    const t = now();
    if (r < 1 && t - last < ms) return;
    last = t;
    report(r);
  };
}
