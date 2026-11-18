/** Pure helpers for the change-speed engine: atempo chains, durations, playback clamps. Unit-tested. */
import { type AudioFormatSpec, audioFormatById } from "@/content/formats/audio";
import { formatDuration, withUnit } from "@/lib/format";
import type { MediaInfo } from "../types";
import { sourceFormatId } from "../video-to-audio/math";

export const MIN_SPEED = 0.1;
export const MAX_SPEED = 8;
export const speedPresets = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 4] as const;
export type SpeedPreset = (typeof speedPresets)[number];

/** HTMLMediaElement.playbackRate range that browsers honour without throwing (Chrome: 0.0625–16). */
export const MIN_PLAYBACK_RATE = 0.0625;
export const MAX_PLAYBACK_RATE = 16;
export const clampPlaybackRate = (speed: number) =>
  Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, speed));

export const clampSpeed = (speed: number) =>
  Number.isFinite(speed) ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)) : 1;

/**
 * ffmpeg's `atempo` is only reliable between 0.5 and 2.0 per instance, so any other factor is a
 * chain of half/double steps followed by the remainder. 4 → [2, 2]; 0.1 → [0.5, 0.5, 0.5, 0.8].
 */
export function atempoChain(speed: number): number[] {
  const steps: number[] = [];
  let s = speed;
  while (s > 2) {
    steps.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    steps.push(0.5);
    s /= 0.5;
  }
  steps.push(Number(s.toFixed(6)));
  return steps;
}

export const atempoFilter = (speed: number) =>
  atempoChain(speed)
    .map((f) => `atempo=${f}`)
    .join(",");

/** Audio filter for the run: tempo with pitch kept, or resampled so pitch shifts with the speed. */
export function audioFilter(speed: number, keepPitch: boolean, sampleRate: number): string {
  if (keepPitch) return atempoFilter(speed);
  // asetrate shifts pitch and tempo together; aresample brings the stream back to its rate.
  return `asetrate=${Math.round(sampleRate * speed)},aresample=${sampleRate}`;
}

export const outputDuration = (durationSec: number, speed: number) => durationSec / speed;

/** "1.5 s" under a minute (tenths matter there), "m:ss" above. */
export function formatSpeedDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return withUnit("0.0", "s");
  if (seconds < 60) return withUnit(seconds.toFixed(1), "s");
  return formatDuration(seconds);
}

/** "2×" or "0.75×"; up to two decimals, trailing zeros dropped. */
export const formatSpeed = (speed: number) => `${Number(speed.toFixed(2)).toString()}×`;

/** Expected output frame count, for progress against ffmpeg's `frame=` log lines. */
export const expectedFrames = (durationSec: number, fps: number, speed: number) =>
  Math.max(1, Math.round(outputDuration(durationSec, speed) * (fps > 0 ? fps : 30)));

/**
 * An audio file (change audio speed): the sound alone, stretched with `atempo` or resampled, and
 * written back in its own format (AAC as M4A, WMA as MP3) at no less than its own bitrate.
 */
export function audioSpeedTarget(info: MediaInfo): {
  format: AudioFormatSpec;
  bitrateKbps?: number;
} {
  const format =
    audioFormatById.get(sourceFormatId(info)) ?? (audioFormatById.get("mp3") as AudioFormatSpec);
  const src = info.audio?.[0]?.bitrate;
  const kbps =
    src && src > 0
      ? Math.max(96, [128, 160, 192, 256, 320].find((k) => k >= src / 1000) ?? 320)
      : 192;
  return { format, bitrateKbps: format.lossless ? undefined : kbps };
}
