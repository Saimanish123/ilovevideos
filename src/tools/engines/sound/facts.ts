/**
 * Pure facts of the sound tools' results, shared by the worker (./job) and the page runner
 * (./page): the result line, the codec wording and the equivalent ffmpeg command. No mediabunny, so
 * the page runner stays light.
 */
import { shellQuote, withUnit } from "@/lib/format";
import { codecName } from "../convert-video/plan";
import { formatLevel, type LoudnessResult } from "./dsp/loudness";
import { ffmpegSoundArgs, type SoundTarget } from "./target";

/** Facts the page runner needs from a `wav` pass to finish the job. */
export interface SoundFacts {
  before?: { integrated: number; truePeak: number };
  gainDb?: number;
  limitedDb: number;
  seconds: number;
  otherTracks: number;
  sampleRate: number;
  channels: number;
  /** The ffmpeg `-af` filter, for the command the page states. */
  filter: string;
  /** The job's own result line (silence removal), used instead of the loudness line. */
  meta?: string;
  /** The file-name suffix the job uses, e.g. "cut". */
  suffix?: string;
  /** What the job did, stated in place of the loudness ("+3 semitones"); see `resultMeta`. */
  describe?: string;
  /** The job brought the result back to the source's loudness (`resultMeta` `kept`). */
  kept?: KeptLoudness;
}

export const channelsName = (n: number) =>
  n === 1 ? "mono" : n === 2 ? "stereo" : withUnit(n, "channels");

/** "AAC 192 kbps", "PCM 24-bit", "FLAC". */
export function codecFact(codec: string, kbps?: number): string {
  const name = codec.startsWith("pcm")
    ? `PCM ${/f32/.test(codec) ? "32\u2011bit float" : `${/(\d+)/.exec(codec)?.[1] ?? 16}\u2011bit`}`
    : (codecName(codec) ?? codec.toUpperCase());
  return kbps ? `${name} ${withUnit(kbps, "kbps")}` : name;
}

/** The command a user would type for the same result. */
export function soundCommand(
  inputName: string,
  outputName: string,
  filter: string,
  target: SoundTarget,
): string {
  const af = filter ? ` -af "${filter}"` : "";
  const video = target.kind === "video" ? " -map 0:v:0 -map 0:a:0" : " -map 0:a:0";
  return `ffmpeg -i ${shellQuote(inputName)}${video}${af} ${ffmpegSoundArgs(target).join(" ")} ${shellQuote(outputName)}`;
}

/** What a job that keeps the source's loudness applied: its gain and the most it may add (dB). */
export interface KeptLoudness {
  gainDb: number;
  maxGainDb: number;
}

function keptWords(
  k: KeptLoudness,
  before: number,
  after: number,
  level: string,
): string | undefined {
  if (Number.isFinite(after) && Math.abs(after - before) <= 0.5)
    return `loudness kept at ${formatLevel(after, "LUFS")}`;
  if (!Number.isFinite(after)) return `nothing loud enough left to raise · ${level}`;
  if (k.gainDb >= k.maxGainDb - 0.05)
    return `loudness raised ${withUnit(k.maxGainDb, "dB")}, the most it adds · ${level}`;
  return undefined;
}

/** The result line: measured loudness and peak of the output, then how it was written. */
export function resultMeta(r: {
  before?: LoudnessResult | { integrated: number; truePeak: number };
  after: LoudnessResult | { integrated: number; truePeak: number };
  limitedDb: number;
  codec: string;
  layout: string;
  picture: boolean;
  otherTracks: number;
  /**
   * What the job did, in place of the measured loudness and peak, for a job that is not about
   * level (a pitch shift: "+3 semitones").
   */
  describe?: string;
  /**
   * The job meant to keep the source's loudness (noise removal): when the output measures within
   * 0.5 dB of the source, the line says "loudness kept at −21.8 LUFS"; when the gain it may add ran
   * out, it says so with both numbers; when nothing was left to raise, that too.
   */
  kept?: KeptLoudness;
}): string {
  const level = r.before
    ? `${formatLevel(r.before.integrated, "LUFS")} → ${formatLevel(r.after.integrated, "LUFS")}`
    : formatLevel(r.after.integrated, "LUFS");
  const kept =
    r.kept && r.before
      ? keptWords(r.kept, r.before.integrated, r.after.integrated, level)
      : undefined;
  return [
    r.describe ?? (kept || `Measured: ${level}`),
    r.describe ? "" : `true peak ${formatLevel(r.after.truePeak, "dBTP")}`,
    r.limitedDb >= 0.1
      ? `peaks limited by up to ${formatLevel(r.limitedDb, "dB").replace("+", "")}`
      : "",
    `${r.codec}, ${r.layout}`,
    r.picture ? "picture copied" : "",
    r.otherTracks > 0
      ? `${r.otherTracks === 1 ? "1 other sound track" : `${r.otherTracks} other sound tracks`} left out`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
