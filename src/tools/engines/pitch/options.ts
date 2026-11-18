/**
 * Options of the pitch engine and the words for them. Pure: the panel imports this without the
 * engine.
 */
import { z } from "zod";
import { MAX_SEMITONES, MIN_SEMITONES, pitchRatio } from "../sound/dsp/pitch";

export const PitchOptions = z
  .object({
    /** Whole semitones, −12 to +12. */
    semitones: z.number().int().min(MIN_SEMITONES).max(MAX_SEMITONES).default(0),
    /** Fine tuning in cents (hundredths of a semitone), −50 to +50. */
    cents: z.number().int().min(-50).max(50).default(0),
    /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
    output: z.enum(["auto", "wav"]).default("auto"),
  })
  .refine((o) => o.semitones !== 0 || o.cents !== 0, { message: "Choose a shift" });
export type PitchOptions = z.infer<typeof PitchOptions>;

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** "+3 semitones", "−1 semitone 20 cents", "+15 cents". */
export function shiftWords(o: { semitones: number; cents: number }): string {
  const parts: string[] = [];
  if (o.semitones !== 0)
    parts.push(`${signed(o.semitones)} ${Math.abs(o.semitones) === 1 ? "semitone" : "semitones"}`);
  if (o.cents !== 0)
    parts.push(
      o.semitones === 0
        ? `${signed(o.cents)} ${Math.abs(o.cents) === 1 ? "cent" : "cents"}`
        : `${o.cents > 0 ? "+" : "−"}${Math.abs(o.cents)} ${Math.abs(o.cents) === 1 ? "cent" : "cents"}`,
    );
  return parts.join(" ") || "no shift";
}

/** File-name suffix: "pitch-up-3", "pitch-down-1.2". */
export function pitchSuffix(o: { semitones: number; cents: number }): string {
  const total = o.semitones + o.cents / 100;
  const amount = Number(Math.abs(total).toFixed(2));
  return `pitch-${total >= 0 ? "up" : "down"}-${String(amount)}`;
}

/** The equivalent ffmpeg filter (rubberband keeps the length the way this tool does). */
export function pitchFilter(o: { semitones: number; cents: number }): string {
  return `rubberband=pitch=${pitchRatio(o.semitones, o.cents).toFixed(6)}`;
}
