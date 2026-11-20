/**
 * Options of the speech noise removal engine and the words for them. Pure: the panel imports this
 * without the engine or the model.
 */
import { z } from "zod";
import { residualDb } from "../sound/dsp/rnnoise";

export const SpeechDenoiseOptions = z.object({
  /** Share of the cleaned sound in the mix, percent (100: RNNoise's output alone). */
  strength: z.number().int().min(1).max(100).default(100),
  /** Bring the result back to the original's integrated loudness (EBU R128), peaks held at −1 dBTP. */
  keepLoudness: z.boolean().default(true),
  /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
  output: z.enum(["auto", "wav"]).default("auto"),
});
export type SpeechDenoiseOptions = z.infer<typeof SpeechDenoiseOptions>;

/** Peaks the loudness match raises are held under this (dBTP). */
export const DENOISE_CEILING_DB = -1;
/** The loudness match never adds more than this (a near-silent result is not blown up). */
export const MAX_MAKEUP_DB = 12;

/** "noise removed", "noise 20 dB down" for the strength. */
export function strengthWords(strength: number): string {
  const r = residualDb(strength / 100);
  return Number.isFinite(r) ? `noise ${Math.round(-r)} dB down` : "noise removed";
}

/** The hint under the strength control: what the mix leaves of the noise. */
export function strengthHint(strength: number): string {
  const r = residualDb(strength / 100);
  return Number.isFinite(r)
    ? `Mixes ${100 - strength}% of the original back in: the noise ends up about ${Math.round(-r)} dB quieter than now, and the voice sounds less processed.`
    : "The cleaned sound alone. Lower it if the voice starts to sound processed.";
}

/** The gain that brings the cleaned sound back to the original's loudness, in dB (0 when off). */
export function makeupGain(
  keep: boolean,
  before: { integrated: number } | undefined,
  after: { integrated: number } | undefined,
): number {
  if (!keep || !before || !after) return 0;
  const g = before.integrated - after.integrated;
  if (!Number.isFinite(g)) return 0;
  return Math.max(0, Math.min(MAX_MAKEUP_DB, g));
}

/**
 * The equivalent ffmpeg filter: `arnndn` is ffmpeg's RNNoise. It needs a model file in the older
 * format (no file ships with ffmpeg), so the command names one; its `mix` is this tool's strength.
 */
export function denoiseFilter(o: SpeechDenoiseOptions, gainDb: number): string {
  const parts = [`arnndn=m=rnnoise-model.rnnn:mix=${(o.strength / 100).toFixed(2)}`];
  if (gainDb >= 0.05)
    parts.push(
      `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${(10 ** (DENOISE_CEILING_DB / 20)).toFixed(3)}`,
    );
  return parts.join(",");
}
