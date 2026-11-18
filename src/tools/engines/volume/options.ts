/**
 * Volume and loudness normalisation (E4): options and the pure plan, shared by the panel (the
 * numbers it shows before running), the worker engine and the page runner. Pure: no DOM, no
 * mediabunny.
 *
 * Two jobs. "gain": turn the sound up or down by a fixed number of dB. "normalize": measure the
 * integrated loudness (EBU R128) and apply the gain that brings it to a target. Either way, when
 * `limit` is on, a look-ahead limiter holds the true peak at `ceiling` so a boost does not clip;
 * when it is off, a normalise stops short of the target rather than clip, and says so.
 */
import { z } from "zod";
import { fromDb } from "../sound/dsp/loudness";

export const VolumeOptions = z.object({
  mode: z.enum(["gain", "normalize"]).default("gain"),
  /** Gain mode: dB added (negative turns it down). */
  gainDb: z.number().min(-30).max(30).default(6),
  /** Normalise mode: integrated loudness to reach, LUFS. */
  target: z.number().min(-36).max(-6).default(-16),
  /** Hold the true peak at `ceiling` with the limiter. */
  limit: z.boolean().default(true),
  /** True-peak ceiling, dBTP. */
  ceiling: z.number().min(-9).max(0).default(-1),
  /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
  output: z.enum(["auto", "wav"]).default("auto"),
});
export type VolumeOptions = z.infer<typeof VolumeOptions>;

export interface Measured {
  integrated: number;
  truePeak: number;
}

export interface GainPlan {
  /** dB actually applied. */
  gainDb: number;
  /** The limiter runs (only when a peak would pass the ceiling). */
  limiter: boolean;
  /** Normalise without the limiter could not reach the target: the peaks set the gain. */
  heldByPeaks: boolean;
  /** Expected loudness after, LUFS (before the limiter, which lowers it slightly on loud peaks). */
  expected: number;
  /** Expected true peak before limiting, dBTP. */
  peakBefore: number;
}

/** Normalise targets offered as presets, LUFS. */
export const loudnessTargets = [
  { value: -14, label: "−14", note: "Loud, for music" },
  { value: -16, label: "−16", note: "A common target for podcasts and speech" },
  { value: -23, label: "−23", note: "EBU R128, for broadcast" },
] as const;

/** Gain presets offered in gain mode, dB. */
export const gainPresets = [-6, 3, 6, 10] as const;

/**
 * The gain to apply for these options and this measurement. A silent or unmeasurable sound (under
 * 0.4 s, or digital silence) cannot be normalised; `undefined` then.
 */
export function planGain(o: VolumeOptions, m: Measured): GainPlan | undefined {
  let gainDb: number;
  let heldByPeaks = false;
  if (o.mode === "normalize") {
    if (!Number.isFinite(m.integrated)) return undefined;
    gainDb = o.target - m.integrated;
    if (!o.limit && Number.isFinite(m.truePeak) && m.truePeak + gainDb > o.ceiling) {
      gainDb = Math.min(gainDb, o.ceiling - m.truePeak);
      heldByPeaks = true;
    }
  } else {
    gainDb = o.gainDb;
  }
  const peakAfter = m.truePeak + gainDb;
  return {
    gainDb,
    limiter: o.limit && Number.isFinite(peakAfter) && peakAfter > o.ceiling,
    heldByPeaks,
    expected: m.integrated + gainDb,
    peakBefore: peakAfter,
  };
}

/** The ffmpeg filter for the same processing: `volume` and, when it acts, `alimiter`. */
export function volumeFilter(plan: GainPlan, o: VolumeOptions): string {
  const db = Math.round(plan.gainDb * 10) / 10;
  const parts = [`volume=${db}dB`];
  if (plan.limiter)
    parts.push(
      `alimiter=limit=${Math.round(fromDb(o.ceiling) * 1000) / 1000}:attack=5:release=80:level=disabled`,
    );
  return parts.join(",");
}
