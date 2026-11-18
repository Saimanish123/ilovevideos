/**
 * Options and plan of merge audio: how the files are joined and what the result is written as,
 * decided before it runs so the panel, the page runner and the worker agree. Pure: no DOM, no
 * mediabunny.
 */
import { z } from "zod";
import {
  type AudioFormatSpec,
  audioFormatById,
  audioSourceForFile,
  normalizeAudioCodec,
} from "@/content/formats/audio";
import { baseName, formatDuration } from "@/lib/format";
import type { MediaInfo } from "../types";

export const MAX_FILES = 50;
export const MAX_JOIN_SEC = 10;
export const JOIN_KBPS = 192;
/** Loudness all files are brought to when matching: the median of theirs (see `loudnessGains`). */
export const MATCH_CEILING_DB = -1;

export const joinFormats = ["auto", "mp3", "m4a", "wav", "flac"] as const;

export const JoinAudioOptions = z.object({
  /** End to end, with a silence between, or overlapping with a crossfade. */
  join: z.enum(["butt", "gap", "crossfade"]).default("butt"),
  gapSec: z.number().min(0.1).max(MAX_JOIN_SEC).default(1),
  crossfadeSec: z.number().min(0.1).max(MAX_JOIN_SEC).default(3),
  /** Bring every file to the same integrated loudness (the median), peaks under −1 dBTP. */
  matchLoudness: z.boolean().default(false),
  /** "auto": the first file's format (MP3, M4A, WAV or FLAC; anything else becomes MP3). */
  format: z.enum(joinFormats).default("auto"),
  /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
  output: z.enum(["auto", "wav"]).default("auto"),
});
export type JoinAudioOptions = z.infer<typeof JoinAudioOptions>;

export interface JoinInput {
  name: string;
  info: MediaInfo;
}

export interface JoinPlan {
  format: AudioFormatSpec;
  /** MP3s joined frame for frame (no decoding); otherwise every file is decoded and encoded once. */
  copy: boolean;
  /** Why a frame copy is not possible, when all files are MP3 and the format stays MP3. */
  copyBlocked?: string;
  sampleRate: number;
  channels: number;
  /** Seconds the result will last. */
  seconds: number;
  /** The crossfade actually used (shortened to half the shortest file). */
  crossfadeSec: number;
  /** Lossless output (WAV, FLAC) at this bit depth. */
  bits?: 16 | 24;
}

const fmt = (id: AudioFormatSpec["id"]) => audioFormatById.get(id) as AudioFormatSpec;

/** The format a file's sound is in, as one of the four this tool writes. */
function formatOf(i: JoinInput): AudioFormatSpec["id"] {
  const codec = normalizeAudioCodec(i.info.audio?.[0]?.codec);
  const src = audioSourceForFile(i.name)?.id;
  if (codec === "mp3") return "mp3";
  if (codec === "aac") return "m4a";
  if (codec === "flac") return "flac";
  if (codec?.startsWith("pcm") || src === "wav" || src === "aiff") return "wav";
  return "mp3";
}

const bitsOf = (i: JoinInput): 16 | 24 => {
  const c = normalizeAudioCodec(i.info.audio?.[0]?.codec) ?? "";
  return /24|32|f32|f64/.test(c) ? 24 : 16;
};

export function planJoin(inputs: JoinInput[], o: JoinAudioOptions): JoinPlan {
  const first = inputs[0];
  const id = o.format === "auto" ? (first ? formatOf(first) : "mp3") : o.format;
  const format = fmt(id);
  const a0 = first?.info.audio?.[0];
  const sampleRate = a0?.sampleRate ?? 44_100;
  const channels = Math.min(2, Math.max(1, ...inputs.map((i) => i.info.audio?.[0]?.channels ?? 1)));
  const durations = inputs.map((i) => i.info.durationSec || 0);
  const shortest = Math.min(...durations);
  const crossfadeSec =
    o.join === "crossfade" ? Math.max(0, Math.min(o.crossfadeSec, shortest / 2)) : 0;
  const joins = Math.max(0, inputs.length - 1);
  const seconds =
    durations.reduce((s, d) => s + d, 0) +
    (o.join === "gap" ? joins * o.gapSec : 0) -
    joins * crossfadeSec;
  let copyBlocked: string | undefined;
  const allMp3 = inputs.every((i) => normalizeAudioCodec(i.info.audio?.[0]?.codec) === "mp3");
  if (allMp3 && id === "mp3") {
    if (o.join !== "butt")
      copyBlocked =
        o.join === "gap"
          ? "A gap is added by re-encoding."
          : "A crossfade is mixed by re-encoding.";
    else if (o.matchLoudness)
      copyBlocked = "Matching loudness changes the sound, so it is re-encoded.";
    else {
      for (const [k, i] of inputs.entries()) {
        const a = i.info.audio?.[0];
        if (!a) continue;
        if (a.sampleRate !== sampleRate) {
          copyBlocked = `File ${k + 1} is ${a.sampleRate / 1000} kHz and file 1 is ${sampleRate / 1000} kHz, so they are re-encoded.`;
          break;
        }
        if ((a.channels === 1) !== (a0?.channels === 1)) {
          copyBlocked = `File ${k + 1} is ${a.channels === 1 ? "mono" : "stereo"} and file 1 is not, so they are re-encoded.`;
          break;
        }
      }
    }
  }
  return {
    format,
    copy: allMp3 && id === "mp3" && copyBlocked === undefined && inputs.length > 0,
    copyBlocked,
    sampleRate,
    channels,
    seconds: Math.max(0, seconds),
    crossfadeSec,
    bits: format.lossless ? (inputs.some((i) => bitsOf(i) === 24) ? 24 : 16) : undefined,
  };
}

/** Gains (dB) that bring each file to the median of their integrated loudness. */
export function loudnessGains(lufs: number[]): number[] {
  const finite = lufs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return lufs.map(() => 0);
  const mid = finite.length / 2;
  const median =
    finite.length % 2
      ? (finite[Math.floor(mid)] as number)
      : ((finite[mid - 1] as number) + (finite[mid] as number)) / 2;
  return lufs.map((v) => (Number.isFinite(v) ? median - v : 0));
}

/** Equal-power crossfade gains at position `x` (0 → 1) of the overlap: [outgoing, incoming]. */
export const crossfadeGains = (x: number): [number, number] => {
  const t = Math.min(1, Math.max(0, x));
  return [Math.cos((t * Math.PI) / 2), Math.sin((t * Math.PI) / 2)];
};

export const joinedName = (first: string, ext: string) =>
  `${baseName(first) || "audio"}-merged.${ext}`;

/** The equivalent ffmpeg command. */
export function joinCommand(
  names: string[],
  out: string,
  o: JoinAudioOptions,
  plan: JoinPlan,
): string {
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  if (plan.copy) {
    const list = names.map((n) => `file ${q(n)}`).join("\\n");
    return `printf "${list}\\n" > list.txt && ffmpeg -f concat -safe 0 -i list.txt -c copy ${q(out)}`;
  }
  const inputs = names.map((n) => `-i ${q(n)}`).join(" ");
  const prep = names.map(
    (_, i) =>
      `[${i}:a]aresample=${plan.sampleRate}:resampler=soxr,aformat=channel_layouts=${plan.channels === 1 ? "mono" : "stereo"}${o.join === "gap" && i < names.length - 1 ? `,apad=pad_dur=${o.gapSec}` : ""}[a${i}]`,
  );
  let graph: string;
  if (o.join === "crossfade" && names.length > 1) {
    const steps: string[] = [];
    let prev = "a0";
    for (let i = 1; i < names.length; i++) {
      const next = i === names.length - 1 ? "out" : `x${i}`;
      steps.push(`[${prev}][a${i}]acrossfade=d=${plan.crossfadeSec}:c1=qsin:c2=qsin[${next}]`);
      prev = next;
    }
    graph = [...prep, ...steps].join(";");
  } else {
    graph = `${prep.join(";")};${names.map((_, i) => `[a${i}]`).join("")}concat=n=${names.length}:v=0:a=1[out]`;
  }
  const codec =
    plan.format.id === "wav"
      ? plan.bits === 24
        ? "pcm_s24le"
        : "pcm_s16le"
      : plan.format.id === "flac"
        ? "flac"
        : `${plan.format.encode.ffmpeg} -b:a ${JOIN_KBPS}k`;
  return `ffmpeg ${inputs} -filter_complex "${graph}" -map "[out]" -c:a ${codec} ${q(out)}`;
}

/** "3 files, 12:04" */
export const joinFacts = (count: number, seconds: number) =>
  `${count} ${count === 1 ? "file" : "files"}, ${formatDuration(seconds)}`;
