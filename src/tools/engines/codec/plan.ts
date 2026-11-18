/**
 * What a codec change writes, decided before it runs: the container for the target codec, the
 * bitrate, and whether the sound is copied. Pure; shared by the worker engine and the panel.
 *
 * Bitrate: the compress engine's "Best quality" density for H.264, scaled by how much less the newer
 * codecs usually need for a similar picture, and never above what the source itself spends scaled
 * the same way (re-encoding cannot add detail, so a bigger file than that buys nothing). The scale
 * factors are this tool's working choice, not a measured equivalence; the page shows the estimate
 * and the result shows the real size.
 */
import { encodedSize } from "../crop/math";
import { reencodeBitrate, sourceName } from "../crop/plan";
import type { ContainerId } from "../mediabunny/shared";
import type { MediaInfo } from "../types";
import { type SoundPlan, soundPlan } from "../video-filter/plan";

export const codecTargets = ["avc", "hevc", "vp9", "av1"] as const;
export type CodecTarget = (typeof codecTargets)[number];

export const codecLabel: Record<string, string> = {
  avc: "H.264",
  hevc: "HEVC",
  vp9: "VP9",
  av1: "AV1",
  vp8: "VP8",
  prores: "ProRes",
};

/** Container names as the world writes them. */
export const containerLabel: Record<ContainerId, string> = {
  mp4: "MP4",
  mov: "MOV",
  webm: "WebM",
  mkv: "MKV",
};

/** What each target is for, in a few words. */
export const codecUse: Record<CodecTarget, string> = {
  avc: "Plays everywhere",
  hevc: "Smaller, Apple devices and TVs",
  vp9: "Smaller, for the web",
  av1: "Smallest, newer devices",
};

export const isCodecTarget = (v: unknown): v is CodecTarget =>
  typeof v === "string" && (codecTargets as readonly string[]).includes(v);

/**
 * The container: H.264 and HEVC keep MP4, MOV or MKV and write MP4 otherwise; VP9 is WebM (or MKV
 * from MKV); AV1 is MP4 (WebM from WebM, MKV from MKV), the container AV1 plays from on phones.
 */
export function codecContainer(fileName: string, codec: CodecTarget): ContainerId {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "mkv") return "mkv";
  if (codec === "vp9") return "webm";
  if (codec === "av1") return ext === "webm" ? "webm" : "mp4";
  return ext === "mov" ? "mov" : "mp4";
}

export function codecBitrate(info: MediaInfo, codec: CodecTarget): number {
  const v = info.video;
  if (!v) return 0;
  return reencodeBitrate({
    size: encodedSize({ width: v.width, height: v.height }, codec),
    fps: v.fps,
    codec,
    source: v,
  });
}

/** The size the new codec writes: an odd edge is cut for H.264 and HEVC (../crop/math `encodedSize`). */
export const codecSize = (info: MediaInfo, codec: CodecTarget) =>
  encodedSize(info.video ?? { width: 0, height: 0 }, codec);

export interface CodecPlan {
  to: ContainerId;
  /** Output size: the source's, less an odd edge for H.264 and HEVC. */
  size: { width: number; height: number };
  bitrate: number;
  sound: SoundPlan;
  /** Output name extension. */
  ext: string;
}

export function planCodec(info: MediaInfo, fileName: string, codec: CodecTarget): CodecPlan {
  const to = codecContainer(fileName, codec);
  return {
    to,
    size: codecSize(info, codec),
    bitrate: codecBitrate(info, codec),
    sound: soundPlan(info, to),
    ext: to,
  };
}

/** The same plan from the panel, which has no file name (the stage's `summary`). */
export const planFor = (info: MediaInfo, codec: CodecTarget) =>
  planCodec(info, sourceName(info), codec);

/** ffmpeg encoder names for the displayed command. */
export const ffmpegEncoder: Record<CodecTarget, string> = {
  avc: "libx264",
  hevc: "libx265 -tag:v hvc1",
  vp9: "libvpx-vp9",
  av1: "libaom-av1",
};

/** The source's codec is the target already (nothing to change). */
export const sameCodec = (info: MediaInfo, codec: CodecTarget) => info.video?.codec === codec;
