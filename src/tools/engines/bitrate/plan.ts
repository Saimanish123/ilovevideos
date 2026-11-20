/**
 * Change video bitrate (feature A3): the options and what a run writes, decided before it starts so
 * the panel's estimate, the worker and the ffmpeg command agree. Pure; safe to import on the page.
 *
 * The picture is re-encoded at the bitrate asked for, in the source's codec when this browser can
 * write it (a bitrate means something only for a given codec) and in H.264 otherwise. The frame
 * size and rate stay. The sound is copied, re-encoded at a chosen bitrate, or left out.
 */
import { z } from "zod";
import { formatBytes, shellQuote } from "@/lib/format";
import { type CodecTarget, codecContainer, codecLabel, codecTargets } from "../codec/plan";
import { videoBitrateForPreset } from "../compress/math";
import { encodedSize } from "../crop/math";
import { sourceName } from "../crop/plan";
import type { ContainerId } from "../mediabunny/shared";
import {
  encodedSoundBps,
  ffmpegSoundEncoder,
  type SoundEncoders,
  type VideoSoundCodec,
  writtenSoundCodec,
} from "../sound-codec";
import type { MediaInfo } from "../types";
import { soundPlan } from "../video-filter/plan";

export const audioChoices = [
  "copy",
  "64",
  "96",
  "128",
  "160",
  "192",
  "256",
  "320",
  "none",
] as const;
export type AudioChoice = (typeof audioChoices)[number];

/** Video bitrates the slider covers, kb/s. */
export const MIN_KBPS = 100;
export const MAX_KBPS = 100_000;

export const BitrateOptions = z.object({
  /** Video bitrate, kb/s (1 kb/s = 1000 bits per second). */
  videoKbps: z.number().int().min(MIN_KBPS).max(MAX_KBPS).default(2500),
  /** "copy" keeps the source's sound packets; a number re-encodes at that many kb/s; "none" drops it. */
  audio: z.enum(audioChoices).default("copy"),
  /** Variable lets the encoder spend more on busy scenes; constant holds every second to the rate. */
  mode: z.enum(["variable", "constant"]).default("variable"),
  /** The codec written: the source's when this browser can encode it, else H.264 (set by the page). */
  codec: z.enum(codecTargets).default("avc"),
});
export type BitrateOptions = z.infer<typeof BitrateOptions>;

/** The source's codec when it is one WebCodecs can write; H.264 otherwise. */
export const preferredCodec = (info: MediaInfo): CodecTarget =>
  (codecTargets as readonly string[]).includes(info.video?.codec ?? "")
    ? (info.video?.codec as CodecTarget)
    : "avc";

/** A round figure: two significant digits, in steps of 50 kb/s or more. */
export function niceKbps(kbps: number): number {
  if (!(kbps > 0)) return MIN_KBPS;
  const p = 10 ** Math.max(1, Math.floor(Math.log10(kbps)) - 1);
  const step = Math.max(50, p);
  return Math.min(MAX_KBPS, Math.max(MIN_KBPS, Math.round(kbps / step) * step));
}

/** The source's video bitrate in kb/s, when the inspector measured one. */
export const sourceKbps = (info: MediaInfo): number | undefined =>
  info.video?.bitrate && info.video.bitrate > 0 ? info.video.bitrate / 1000 : undefined;

/**
 * The default: the compress engine's "Balanced" density for this size and rate (a picture that
 * looks like the source on a phone or a laptop), but never more than 70% of what the source spends
 * (asking for more than the source has only makes the file bigger). Rounded.
 */
export function defaultKbps(info: MediaInfo): number {
  const v = info.video;
  if (!v) return 2500;
  const size = encodedSize(v);
  const balanced = videoBitrateForPreset("balanced", size.width, size.height, v.fps) / 1000;
  const src = sourceKbps(info);
  return niceKbps(src ? Math.min(balanced, src * 0.7) : balanced);
}

/** Slider end: three times the source or the "Best" density, whichever is more. */
export function sliderMaxKbps(info: MediaInfo): number {
  const v = info.video;
  const size = v ? encodedSize(v) : { width: 1920, height: 1080 };
  const best = videoBitrateForPreset("best", size.width, size.height, v?.fps ?? 30) / 1000;
  return niceKbps(Math.min(MAX_KBPS, Math.max(best * 2, (sourceKbps(info) ?? 0) * 3, 1000)));
}

export interface BitratePlan {
  codec: CodecTarget;
  to: ContainerId;
  size: { width: number; height: number };
  videoBps: number;
  /** What happens to the sound. */
  sound: "copy" | "encode" | "none" | "dropped";
  /** Sound bitrate written (copied: the source's, when known). */
  audioBps: number;
  /** The codec an encoded sound is written in (../video-filter/plan `soundCodec`). */
  audioCodec: VideoSoundCodec;
  bytes: number;
}

const AUDIO_DEFAULT = 128_000;

/** `can`: this browser's sound encoders (../sound-codec), which pick the codec of an encoded sound. */
export function planBitrate(
  info: MediaInfo,
  fileName: string,
  o: BitrateOptions,
  can: SoundEncoders,
): BitratePlan {
  const to = codecContainer(fileName, o.codec);
  const size = encodedSize(info.video ?? { width: 0, height: 0 }, o.codec);
  const audioCodec = writtenSoundCodec(to, can);
  const src = info.audio?.[0];
  let sound: BitratePlan["sound"];
  let audioBps = 0;
  if (!src) sound = "none";
  else if (o.audio === "none") sound = "dropped";
  else if (o.audio === "copy" && soundPlan(info, to) === "copy") {
    sound = "copy";
    audioBps = src.bitrate ?? AUDIO_DEFAULT;
  } else {
    sound = "encode";
    // 16-bit PCM has no bitrate to choose: its size is the rate × channels × 16.
    audioBps = encodedSoundBps(
      audioCodec,
      o.audio === "copy" ? AUDIO_DEFAULT : Number(o.audio) * 1000,
      src,
    );
  }
  const videoBps = o.videoKbps * 1000;
  // About 1% of container overhead (sample tables, headers).
  const bytes = Math.round((((videoBps + audioBps) * info.durationSec) / 8) * 1.01);
  return { codec: o.codec, to, size, videoBps, sound, audioBps, audioCodec, bytes };
}

export const planForPanel = (info: MediaInfo, o: BitrateOptions, can: SoundEncoders) =>
  planBitrate(info, sourceName(info), o, can);

/** "4,500 kb/s", "12.5 Mb/s". */
export function rateWords(kbps: number): string {
  if (kbps >= 10_000) return `${(kbps / 1000).toFixed(kbps >= 100_000 ? 0 : 1)} Mb/s`;
  return `${Math.round(kbps).toLocaleString("en-GB")} kb/s`;
}

export const codecName = (c: string) => codecLabel[c] ?? c.toUpperCase();

/** "Copy", "128 kb/s", "None". */
export const audioLabel = (a: AudioChoice) =>
  a === "copy" ? "Copy" : a === "none" ? "None" : `${a} kb/s`;

const ffmpegEncoders: Record<CodecTarget, string> = {
  avc: "libx264",
  hevc: "libx265 -tag:v hvc1",
  vp9: "libvpx-vp9",
  av1: "libaom-av1",
};

/** The same job for ffmpeg; constant rate as -minrate/-maxrate/-bufsize at the target. */
export function bitrateCommand(
  input: string,
  output: string,
  plan: BitratePlan,
  mode: BitrateOptions["mode"],
  vf: string,
): string {
  const k = Math.round(plan.videoBps / 1000);
  const rate =
    mode === "constant" ? `-b:v ${k}k -minrate ${k}k -maxrate ${k}k -bufsize ${k}k` : `-b:v ${k}k`;
  const a =
    plan.sound === "copy"
      ? "-c:a copy"
      : plan.sound === "encode"
        ? `-c:a ${ffmpegSoundEncoder(plan.audioCodec)}${plan.audioCodec === "pcm-s16" ? "" : ` -b:a ${Math.round(plan.audioBps / 1000)}k`}`
        : "-an";
  const filter = vf ? ` -vf "${vf}"` : "";
  const faststart = plan.to === "mp4" || plan.to === "mov" ? " -movflags +faststart" : "";
  return `ffmpeg -i ${shellQuote(input)}${filter} -c:v ${ffmpegEncoders[plan.codec]} ${rate} ${a}${faststart} ${shellQuote(output)}`;
}

/** The estimate for the status line: "about 18.2 MB". */
export const estimateWords = (plan: BitratePlan) => `about ${formatBytes(plan.bytes)}`;
