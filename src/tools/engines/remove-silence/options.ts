/**
 * Remove silence / jump cut (C7): options and the pure cut plan, shared by the panel's timeline and
 * the engine, so the cuts shown before running are the cuts made. Pure: no DOM, no mediabunny.
 */
import { z } from "zod";
import { formatDuration, shellQuote } from "@/lib/format";
import {
  keptSpans,
  removedSeconds,
  type Span,
  silenceCuts,
  suggestThreshold,
} from "../sound/dsp/silence";

export const RemoveSilenceOptions = z.object({
  /** dBFS under which a moment counts as silent; null picks it from the recording's noise floor. */
  thresholdDb: z.number().min(-70).max(-10).nullable().default(null),
  /** Seconds a pause must last to be cut. */
  minSilence: z.number().min(0.1).max(5).default(0.5),
  /** Seconds of each pause kept on both sides, so words are not clipped. */
  padding: z.number().min(0).max(1).default(0.15),
  /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
  output: z.enum(["auto", "wav"]).default("auto"),
});
export type RemoveSilenceOptions = z.infer<typeof RemoveSilenceOptions>;

export interface CutPlan {
  thresholdDb: number;
  cuts: Span[];
  kept: Span[];
  removed: number;
  /** Length after the cuts, seconds. */
  after: number;
}

export function planCuts(o: RemoveSilenceOptions, levels: Float32Array, duration: number): CutPlan {
  const thresholdDb = o.thresholdDb ?? suggestThreshold(levels);
  const cuts = silenceCuts(
    levels,
    { thresholdDb, minSilence: o.minSilence, padding: o.padding },
    duration,
  );
  const removed = removedSeconds(cuts);
  return { thresholdDb, cuts, kept: keptSpans(cuts, duration), removed, after: duration - removed };
}

/** "12 pauses cut · 0:43 removed · 3:12 → 2:29" */
export function cutFacts(plan: CutPlan, duration: number): string {
  const n = plan.cuts.length;
  return `${n} ${n === 1 ? "pause" : "pauses"} cut · ${formatDuration(plan.removed)} removed · ${formatDuration(duration)} → ${formatDuration(plan.after)}`;
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
