/**
 * Loop maths: how many plays a choice means and how big the result gets. Pure; unit-tested; safe on
 * the page. A loop is whole plays only: a copy cannot stop part way through a play without cutting
 * on a key frame, so "at least 30 s" rounds up to the next whole play and says so.
 */
export const timesPresets = [2, 3, 5, 10] as const;
export const lengthPresets = [15, 30, 60, 180, 600] as const;
export const MAX_PLAYS = 100;
/** The looped file is held in memory; above this the run is refused with the numbers. */
export const MAX_OUTPUT_BYTES = 1_000_000_000;

export interface LoopChoice {
  /** Plays in total (2 = the clip twice). */
  times?: number;
  /** Repeat until the result is at least this long (seconds); wins over `times`. */
  minSeconds?: number;
}

/** Total plays for a clip of `duration` seconds, at least 1, at most MAX_PLAYS. */
export function plays(duration: number, c: LoopChoice): number {
  if (c.minSeconds !== undefined && c.minSeconds > 0) {
    if (duration <= 0) return 1;
    return Math.max(1, Math.min(MAX_PLAYS, Math.ceil(c.minSeconds / duration - 1e-9)));
  }
  return Math.max(1, Math.min(MAX_PLAYS, Math.round(c.times ?? 2)));
}

/** A boomerang play is the clip forwards and backwards, minus the turning frame. */
export const playLength = (duration: number, fps: number, boomerang: boolean) =>
  boomerang ? Math.max(0, duration * 2 - 1 / Math.max(1, fps)) : duration;

/** Bytes of the looped copy: the source's size per play (a copy adds almost nothing). */
export const loopBytes = (sizeBytes: number, n: number) => sizeBytes * n;
