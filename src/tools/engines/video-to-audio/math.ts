/** Pure helpers for the video → audio engine: size estimates and output names. Unit-tested. */
import {
  type AudioFormatId,
  type AudioFormatSpec,
  normalizeAudioCodec,
} from "@/content/formats/audio";
import { baseName } from "@/lib/format";
import type { MediaInfo } from "../types";

export interface AudioTrackFacts {
  channels: number;
  sampleRate: number;
  /** Source bitrate in bits per second when the inspector measured it. */
  bitrate?: number;
}

/**
 * Estimated output size in bytes, or undefined when nothing honest can be said (a copy whose
 * bitrate was not measured). FLAC lands near 55–60% of PCM for typical material; we say "about".
 */
export function estimateAudioBytes(
  target: AudioFormatSpec,
  durationSec: number,
  track: AudioTrackFacts | undefined,
  opts: { copy: boolean; bitrateKbps?: number },
): number | undefined {
  if (!(durationSec > 0) || !track) return undefined;
  if (opts.copy) {
    return track.bitrate && track.bitrate > 0 ? (track.bitrate * durationSec) / 8 : undefined;
  }
  if (target.id === "wav") return track.sampleRate * track.channels * 2 * durationSec;
  if (target.id === "flac") return track.sampleRate * track.channels * 2 * durationSec * 0.58;
  if (!opts.bitrateKbps) return undefined;
  return (opts.bitrateKbps * 1000 * durationSec) / 8;
}

/** `clip.mp4` → `clip.mp3`; a trimmed range appends the times so the source name is kept intact. */
export function audioOutputName(
  inputName: string,
  extension: string,
  range?: { start: number; end: number },
): string {
  const base = baseName(inputName) || "audio";
  if (!range) return `${base}.${extension}`;
  const tag = (t: number) => t.toFixed(1).replace(".", "-");
  return `${base}-${tag(range.start)}s-${tag(range.end)}s.${extension}`;
}

/** Clamps a requested range to the media and returns undefined when it spans the whole file. */
export function effectiveRange(
  durationSec: number,
  range: { range: boolean; start: number; end: number },
): { start: number; end: number } | undefined {
  if (!range.range) return undefined;
  const start = Math.max(0, Math.min(range.start, durationSec));
  const end = Math.max(start, Math.min(range.end, durationSec));
  if (end - start <= 0) return undefined;
  if (start <= 0 && durationSec > 0 && Math.abs(end - durationSec) < 0.005) return undefined;
  return { start, end };
}

/**
 * The output format a file already is, for the pages that keep it (trim audio, stereo to mono,
 * sample rate): AAC is M4A, big-endian PCM is AIFF, WMA becomes MP3 (nothing here writes WMA).
 */
export function sourceFormatId(info: MediaInfo): AudioFormatId {
  const codec = normalizeAudioCodec(info.audio?.[0]?.codec);
  if (codec === "aac") return "m4a";
  if (codec === "flac") return "flac";
  if (codec === "vorbis") return "ogg";
  if (codec === "opus") return "opus";
  if (codec?.startsWith("pcm")) return /be$/.test(codec) ? "aiff" : "wav";
  return "mp3";
}
