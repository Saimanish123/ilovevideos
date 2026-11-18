/**
 * Pure helpers for add / replace audio: which input is the picture and which the sound, where the
 * new audio sits on the video's timeline, and the gain applied to it at any moment (volume and the
 * fade-out). Shared by the engine and the placement timeline. Unit-tested; no DOM, no mediabunny.
 */
import { containerFromFormatName } from "@/content/formats/containers";
import type { ContainerId } from "../mediabunny/shared";
import type { MediaInfo } from "../types";

export interface AddAudioPlacementOptions {
  /** Seconds into the video where the new audio starts. */
  offset: number;
  /** Seconds cut from the start of the new audio. */
  skip: number;
  /** Repeat the new audio until the video ends. */
  loop: boolean;
  /** Seconds of fade-out when the video's end cuts the new audio; 0 turns it off. */
  fadeOut: number;
}

export interface Placement {
  /** Output time where the new audio starts and stops. */
  start: number;
  end: number;
  /** Length of one pass of the new audio after `skip`. */
  passLength: number;
  /** True when the video's end cuts the new audio before its own end (or a loop is cut). */
  cut: boolean;
  /** Seconds of fade actually applied (0 when nothing is cut or the fade is off). */
  fade: number;
  /** How many times the audio plays, including partial passes. */
  passes: number;
}

/** A 10 ms ramp where the audio starts mid-waveform (after a skip or a loop seam), so it does not click. */
export const EDGE_RAMP_SEC = 0.01;

/**
 * Picks the picture and the sound from the two inputs, in either order. The picture is the first
 * input with a video track; the sound is the other input (its audio track; a second video lends
 * its sound). Undefined roles mean the pair cannot run.
 */
export function pickRoles<T extends { info: MediaInfo }>(
  inputs: readonly T[],
): { video?: T; audio?: T } {
  const video = inputs.find((i) => !!i.info.video);
  const audio = inputs.find((i) => i !== video);
  return { video, audio };
}

export function placement(
  videoDuration: number,
  audioDuration: number,
  o: AddAudioPlacementOptions,
): Placement {
  const passLength = Math.max(0, audioDuration - o.skip);
  const start = Math.min(Math.max(0, o.offset), videoDuration);
  const room = Math.max(0, videoDuration - start);
  const natural = start + passLength;
  const end = o.loop && passLength > 0 ? videoDuration : Math.min(videoDuration, natural);
  const cut = passLength > 0 && (o.loop ? true : natural > videoDuration + 1e-3);
  const length = end - start;
  const fade = cut && o.fadeOut > 0 ? Math.min(o.fadeOut, length) : 0;
  const passes = passLength > 0 ? (o.loop ? room / passLength : Math.min(1, room / passLength)) : 0;
  return { start, end, passLength, cut, fade, passes };
}

/** Position inside the new audio file (seconds) that plays at output time `t`, or undefined when silent. */
export function sourceTime(t: number, p: Placement, skip: number): number | undefined {
  if (t < p.start || t >= p.end || p.passLength <= 0) return undefined;
  return skip + ((t - p.start) % p.passLength);
}

/** Gain of the new audio at output time `t`: volume × fade-out × short edge ramps. */
export function gainAt(t: number, p: Placement, volume: number, skip: number): number {
  if (t < p.start || t >= p.end) return 0;
  let g = volume;
  if (p.fade > 0 && t > p.end - p.fade) g *= Math.max(0, (p.end - t) / p.fade);
  // Starting mid-file (a skip) or at each loop seam: ramp in over 10 ms.
  const intoPass = p.passLength > 0 ? (t - p.start) % p.passLength : 0;
  const seam = skip > 0 || (t - p.start >= p.passLength && p.passLength > 0);
  if (seam && intoPass < EDGE_RAMP_SEC) g *= intoPass / EDGE_RAMP_SEC;
  return g;
}

/**
 * Soft limiter for the mix: unchanged below 0.9, then eased towards 1 so two loud tracks summed do
 * not clip harshly. Equivalent in spirit to ffmpeg's `alimiter` with a 0.9 threshold.
 */
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= 0.9) return x;
  return Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

export type Balance = "new" | "even" | "original";

/**
 * Mix presets: which sound is in front. Gains are linear; "even" leaves headroom so two full-level
 * tracks rarely reach the soft limiter.
 */
export const balanceGains: Record<Balance, { added: number; original: number }> = {
  new: { added: 1, original: 0.3 },
  even: { added: 0.7, original: 0.7 },
  original: { added: 0.3, original: 1 },
};

/** "0:00.00–0:30.00" style facts for the timeline and summary, seconds rounded to hundredths. */
export const round2 = (t: number) => Math.round(t * 100) / 100;

/** Output container: the video's own when it can be written natively, else MP4 (MKV for VP8/VP9). */
export function outputContainer(input: { file: File; info?: MediaInfo }): ContainerId {
  const id = containerFromFormatName(input.info?.container ?? "", input.file.name)?.id;
  if (id === "mp4" || id === "mov" || id === "webm" || id === "mkv") return id;
  const v = input.info?.video?.codec;
  return v === "vp8" || v === "vp9" ? "mkv" : "mp4";
}

/** Whether the new audio needs no change at all (replace, no offset, skip, loop, fade or gain). */
export function audioUnchanged(
  o: AddAudioPlacementOptions & { mode: "replace" | "mix"; volume: number },
  cut: boolean,
): boolean {
  return (
    o.mode === "replace" &&
    o.offset === 0 &&
    o.skip === 0 &&
    !o.loop &&
    Math.abs(o.volume - 1) < 1e-6 &&
    (o.fadeOut === 0 || !cut)
  );
}
