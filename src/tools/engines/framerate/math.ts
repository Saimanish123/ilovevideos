/**
 * Frame-rate maths for the change-frame-rate engine: the presets, which of them a source can take,
 * and what dropping to a lower rate does to the frames. Pure; unit-tested; safe on the page.
 *
 * The engine only lowers the rate. Each output slot of 1/fps seconds keeps the last source frame that
 * starts in it (mediabunny's frame-rate transform), so frames are dropped, never blended or invented.
 */
import { withUnit } from "@/lib/format";

export const fpsPresets = [60, 50, 30, 25, 24, 15, 12] as const;
export type FpsPreset = (typeof fpsPresets)[number];

/** What each rate is used for, in plain words. */
export const fpsUse: Record<FpsPreset, string> = {
  60: "Smooth motion",
  50: "Smooth, 50 Hz countries",
  30: "Web and phones",
  25: "TV in 50 Hz countries",
  24: "Film cadence",
  15: "Screen recordings",
  12: "Small, choppy",
};

export const MIN_FPS = 1;
/** A target must be at least this far below the source to count as a change. */
export const FPS_EPS = 0.5;

export const lowersRate = (source: number, target: number) => target < source - FPS_EPS;

/** Presets below the source's rate, highest first. */
export const presetsBelow = (source: number) => fpsPresets.filter((p) => lowersRate(source, p));

/**
 * The first rate worth offering: half of a 50 or 60 fps source (every other frame, perfectly even),
 * 24 for a 30 fps source (the usual "film look" request), otherwise the next preset down.
 */
export function defaultTarget(source: number): number | undefined {
  const below = presetsBelow(source);
  if (below.length === 0) return undefined;
  if (source >= 45) {
    const half = below.find((p) => Math.abs(p - source / 2) < 1);
    if (half !== undefined) return half;
  }
  if (source > 24.5 && source < 31 && below.includes(24)) return 24;
  return below[0];
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const nearInt = (n: number) => Math.abs(n - Math.round(n)) < 0.05;

/** Frames the output will have, for progress. */
export const outputFrames = (durationSec: number, target: number) =>
  Math.max(1, Math.round(durationSec * target));

/**
 * What lowering the rate does, in words: "keeps every 2nd frame" for an even ratio, "drops 1 of
 * every 5 frames" otherwise (motion then steps unevenly), or "about 6 of every 30" for rates that
 * are not whole numbers.
 */
export function cadence(source: number, target: number): { text: string; even: boolean } {
  if (!lowersRate(source, target)) return { text: "keeps every frame", even: true };
  const ratio = source / target;
  if (nearInt(ratio)) {
    const k = Math.round(ratio);
    return { text: `keeps every ${ordinal(k)} frame`, even: true };
  }
  if (nearInt(source) && nearInt(target)) {
    const s = Math.round(source);
    const t = Math.round(target);
    const g = gcd(s, t);
    const of = s / g;
    const dropped = (s - t) / g;
    return { text: `drops ${dropped} of every ${of} frames`, even: false };
  }
  const perSecond = Math.round(source - target);
  return {
    text: `drops about ${perSecond} of every ${Math.round(source)} frames`,
    even: false,
  };
}

function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/** NTSC-family rates (n × 1000/1001), which must read as themselves: 23.976, 29.97, 59.94. */
const BROADCAST = [24, 30, 48, 60, 120].map((n) => (n * 1000) / 1001);

/**
 * The rate as people name it. A measured rate within 0.005 of a whole number is that number: an
 * estimate from millisecond timestamps (WebM, MKV) reads 29.9967 for 30 and 24.0027 for 24. A rate
 * within 0.025% of a broadcast rate is that rate (WebM measured 23.9784, 29.9664 and 59.9307 for
 * 24000/1001, 30000/1001 and 60000/1001). Anything else keeps up to three decimals.
 */
export function namedFps(fps: number): number {
  const whole = Math.round(fps);
  if (Math.abs(fps - whole) < 0.005) return whole;
  const broadcast = BROADCAST.find((b) => Math.abs(fps - b) < b * 2.5e-4);
  return Number((broadcast ?? fps).toFixed(3));
}

/** "23.976 fps", "29.97 fps", "30 fps": at most three decimals, trailing zeros trimmed. */
export function formatFps(fps: number): string {
  return withUnit(String(namedFps(fps)), "fps");
}
