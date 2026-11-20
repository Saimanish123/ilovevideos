/**
 * Remove silence / jump cut (C7): options and the pure cut plan, shared by the panel's timeline and
 * the engine, so the cuts shown before running are the cuts made. Pure: no DOM, no mediabunny.
 */
import { z } from "zod";
import { formatDuration, shellQuote, withUnit } from "@/lib/format";
import {
  cutsFromPauses,
  keptSpans,
  removedSeconds,
  type Span,
  silenceCuts,
  suggestThreshold,
} from "../sound/dsp/silence";
import { speechPauses, speechShare } from "../sound/dsp/speech";

/**
 * Below this share of 32 ms frames called speech, a file is not treated as speech (music, a tone,
 * room tone): finding pauses "by speech" would cut nearly everything, so loudness is used instead.
 */
export const MIN_SPEECH_SHARE = 0.1;

/** Whether a speech reading is there and has enough speech to find pauses by (the one rule). */
export const speechUsable = (speech: Float32Array | undefined): boolean =>
  !!speech && speech.length > 0 && speechShare(speech) >= MIN_SPEECH_SHARE;

export const RemoveSilenceOptions = z.object({
  /**
   * What a pause is: no speech (Silero VAD, ADR-0110), or quieter than the threshold. Speech is
   * the default: with background noise or music it finds the pauses a level cannot.
   */
  detect: z.enum(["speech", "level"]).default("speech"),
  /** dBFS under which a moment counts as silent; null picks it from the recording's noise floor. */
  thresholdDb: z.number().min(-70).max(-10).nullable().default(null),
  /** Seconds a pause must last to be cut. */
  minSilence: z.number().min(0.1).max(5).default(0.5),
  /** Seconds of each pause kept on both sides, so words are not clipped. */
  padding: z.number().min(0).max(1).default(0.15),
  /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
  output: z.enum(["auto", "wav"]).default("auto"),
  /**
   * Internal, for the ready line only: what the panel's reading heard ("little" when the file has
   * too little speech and is cut by loudness, "none" when no reading came back). The engine reads
   * the file again itself.
   */
  heard: z.enum(["speech", "little", "none"]).optional(),
});
export type RemoveSilenceOptions = z.infer<typeof RemoveSilenceOptions>;

export interface CutPlan {
  /** How the pauses were found (speech falls back to level when the file has too little speech). */
  detect: "speech" | "level";
  /** Speech was asked for but the file has too little of it, so loudness was used. */
  fellBack?: boolean;
  thresholdDb: number;
  cuts: Span[];
  kept: Span[];
  removed: number;
  /** Length after the cuts, seconds. */
  after: number;
}

/**
 * The cuts for these options. `speech` is the per-32 ms speech probability (../sound/dsp/speech);
 * without it, or with too little speech in the file, pauses are found by level.
 */
export function planCuts(
  o: RemoveSilenceOptions,
  levels: Float32Array,
  duration: number,
  speech?: Float32Array,
): CutPlan {
  const thresholdDb = o.thresholdDb ?? suggestThreshold(levels);
  const bySpeech = o.detect === "speech" && !!speech && speechUsable(speech);
  const cuts = bySpeech
    ? cutsFromPauses(
        speechPauses(speech, { minSilence: o.minSilence }, duration),
        o.padding,
        duration,
      )
    : silenceCuts(levels, { thresholdDb, minSilence: o.minSilence, padding: o.padding }, duration);
  const removed = removedSeconds(cuts);
  return {
    detect: bySpeech ? "speech" : "level",
    // Speech was read and there was too little of it (without a reading, it is simply by level).
    ...(o.detect === "speech" && !bySpeech && speech && speech.length > 0
      ? { fellBack: true }
      : {}),
    thresholdDb,
    cuts,
    kept: keptSpans(cuts, duration),
    removed,
    after: duration - removed,
  };
}

/** Time removed: tenths of a second under 10 s ("0.2 s", "4.7 s"), m:ss above ("1:12"). */
export function removedWords(seconds: number): string {
  return seconds < 9.95 ? withUnit(seconds.toFixed(1), "s") : formatDuration(seconds);
}

/** "found by speech", "found by loudness", "too little speech, found by loudness". */
export function detectWords(plan: Pick<CutPlan, "detect" | "fellBack">): string {
  return plan.fellBack
    ? "too little speech, found by loudness"
    : plan.detect === "speech"
      ? "found by speech"
      : "found by loudness";
}

/** "12 pauses cut · found by speech · 0:43 removed · 3:12 → 2:29", "… · 1.4 s removed · …" */
export function cutFacts(plan: CutPlan, duration: number): string {
  const n = plan.cuts.length;
  return `${n} ${n === 1 ? "pause" : "pauses"} cut · ${detectWords(plan)} · ${removedWords(plan.removed)} removed · ${formatDuration(duration)} → ${formatDuration(plan.after)}`;
}

/**
 * The equivalent ffmpeg command: keep the spans with `aselect`/`select` and re-time them. It cuts
 * where this tool cut; the ramps at each join are the one thing ffmpeg's select does not add.
 */
export function silenceCommand(
  inputName: string,
  outputName: string,
  plan: CutPlan,
  video: boolean,
): string {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  const expr = plan.kept.map((k) => `between(t,${r(k.start)},${r(k.end)})`).join("+");
  const a = `aselect='${expr}',asetpts=N/SR/TB`;
  const v = `select='${expr}',setpts=N/FRAME_RATE/TB`;
  return video
    ? `ffmpeg -i ${shellQuote(inputName)} -vf "${v}" -af "${a}" -c:v libx264 -crf 18 -c:a aac -b:a 192k ${shellQuote(outputName)}`
    : `ffmpeg -i ${shellQuote(inputName)} -af "${a}" ${shellQuote(outputName)}`;
}
