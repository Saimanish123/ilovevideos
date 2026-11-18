/**
 * Options of the ringtone maker, what it writes, and the part it suggests. Pure: the panel imports
 * this without the engine.
 */
import { z } from "zod";
import { type AudioFormatSpec, audioFormatById } from "@/content/formats/audio";
import { baseName } from "@/lib/format";

/** Length of the part chosen on opening a file, seconds (not a platform limit; see the page prose). */
export const DEFAULT_RINGTONE_SEC = 30;
/** Loudness of "Make it louder": the music preset of the volume tools (ADR-0040). */
export const RINGTONE_LUFS = -14;
export const RINGTONE_CEILING_DB = -1;
export const RINGTONE_KBPS = 192;

export const RingtoneOptions = z
  .object({
    /** The part to keep, page seconds. */
    start: z.number().min(0).default(0),
    end: z.number().min(0).default(DEFAULT_RINGTONE_SEC),
    fadeIn: z.number().min(0).max(10).default(0.5),
    fadeOut: z.number().min(0).max(10).default(2),
    /** Bring the part to −14 LUFS with peaks under −1 dBTP. */
    normalize: z.boolean().default(false),
    phone: z.enum(["iphone", "android"]).default("iphone"),
    /** Android only. */
    androidFormat: z.enum(["mp3", "ogg"]).default("mp3"),
    /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
    output: z.enum(["auto", "wav"]).default("auto"),
    /** UI only: the part still follows the suggestion (the user has not moved it). */
    suggested: z.boolean().optional(),
  })
  .refine((o) => o.end - o.start >= 1, { message: "Choose at least one second" });
export type RingtoneOptions = z.infer<typeof RingtoneOptions>;

/** The format written: AAC in MPEG-4 named .m4r for iPhone; MP3 or Ogg Vorbis for Android. */
export function ringtoneFormat(o: Pick<RingtoneOptions, "phone" | "androidFormat">): {
  spec: AudioFormatSpec;
  extension: string;
  label: string;
} {
  if (o.phone === "iphone")
    return {
      spec: audioFormatById.get("m4a") as AudioFormatSpec,
      extension: "m4r",
      label: "M4R (AAC)",
    };
  const spec = audioFormatById.get(o.androidFormat) as AudioFormatSpec;
  return { spec, extension: spec.extension, label: o.androidFormat === "mp3" ? "MP3" : "OGG" };
}

export const ringtoneName = (source: string, extension: string) =>
  `${baseName(source) || "ringtone"}-ringtone.${extension}`;

/**
 * The part a ringtone should start from with zero interaction: the loudest stretch of `length`
 * seconds (most songs are loudest in a chorus), from 10 ms levels in dBFS. Its start moves back to
 * the quietest moment in the second before it, so the part tends to begin on a phrase rather than
 * mid-note. The whole file when it is shorter than `length`.
 */
export function suggestPart(
  levels: Float32Array,
  duration: number,
  length = DEFAULT_RINGTONE_SEC,
): { start: number; end: number } {
  if (duration <= length || levels.length === 0) return { start: 0, end: duration };
  const win = Math.round(length * 100);
  const power = Float64Array.from(levels, (db) => (Number.isFinite(db) ? 10 ** (db / 10) : 0));
  let sum = 0;
  for (let i = 0; i < Math.min(win, power.length); i++) sum += power[i] as number;
  let best = sum;
  let at = 0;
  for (let i = win; i < power.length; i++) {
    sum += (power[i] as number) - (power[i - win] as number);
    if (sum > best * 1.0001) {
      best = sum;
      at = i - win + 1;
    }
  }
  let start = at;
  let quietest = Number.POSITIVE_INFINITY;
  for (let i = Math.max(0, at - 100); i <= at; i++) {
    const v = levels[i] as number;
    if (v < quietest) {
      quietest = v;
      start = i;
    }
  }
  // Tenths of a second: what the fields show is what the part is.
  const s = Math.round(Math.min(start / 100, Math.max(0, duration - length)) * 10) / 10;
  return { start: s, end: Math.min(duration, Math.round((s + length) * 10) / 10) };
}

/** The selection held inside the file and at least one second long. */
export function fitPart(o: { start: number; end: number }, duration: number) {
  const end = Math.min(duration, Math.max(o.end, 0));
  const start = Math.max(0, Math.min(o.start, end - 1));
  return { start, end: Math.max(end, Math.min(duration, start + 1)) };
}
