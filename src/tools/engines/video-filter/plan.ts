/**
 * What a picture re-encode writes, decided before it runs so the panel, the worker and the ffmpeg
 * runner agree: the container, the H.264 bitrate and what happens to the sound. Pure; safe to import
 * on the page. Used by every engine that changes each frame but not the frame's size or timing
 * alone (filter, video-fade, framerate, border).
 */
import { containerById } from "@/content/formats/containers";
import { formatBytes, formatDimensions } from "@/lib/format";
import { encodedSize, evenSizeNote, type Size } from "../crop/math";
import { geometryContainer, needsFfmpeg, reencodeBitrate, sourceName } from "../crop/plan";
import type { ContainerId } from "../mediabunny/shared";
import {
  encodedSoundBps,
  type SoundEncoders,
  soundCodecName,
  writtenSoundCodec,
} from "../sound-codec";
import type { MediaInfo } from "../types";

export { geometryContainer as pictureContainer, needsFfmpeg, sourceName };

export type SoundPlan =
  /** The sound packets are copied as they are (no quality change). */
  | "copy"
  /** Encoded once: AAC in MP4, MOV and MKV, Opus in WebM (without AAC, `writtenSoundCodec`). */
  | "encode"
  /** There is no sound track. */
  | "none";

/**
 * Sound the output container holds in a form players expect is copied; anything else is encoded.
 * MP4 and MOV copy AAC (and MP3 in MP4); Opus or FLAC in MP4 play in too few places, so they are
 * encoded to AAC like the converter's "plays everywhere" choice (ADR-0023). MKV copies anything the
 * capability table lists for it.
 */
export function soundPlan(info: MediaInfo, to: ContainerId): SoundPlan {
  const a = info.audio?.[0];
  if (!a) return "none";
  const playable: Record<ContainerId, string[]> = {
    mp4: ["aac", "mp3"],
    mov: ["aac"],
    webm: ["opus", "vorbis"],
    mkv: containerById.get("mkv")?.audioCodecs ?? [],
  };
  return playable[to].includes(a.codec) ? "copy" : "encode";
}

/**
 * The size an H.264 picture re-encode writes: the source's, less an odd edge (641×361 becomes
 * 640×360; ../crop/math `encodedSize`). The panel, the worker and the ffmpeg runner all use this.
 */
export const pictureSize = (info: MediaInfo) => encodedSize(info.video ?? { width: 0, height: 0 });

/** "641×361 becomes 640×360: H.264 needs even edges." for the plan and the result, or "". */
export const pictureSizeNote = (info: MediaInfo) => (info.video ? evenSizeNote(info.video) : "");

/**
 * The output size for a result line: "640×360", or "641×361 → 640×360 (H.264 needs even edges)"
 * when an odd edge was cut, so the result never claims a size the file does not have.
 */
export function sizeWords(src: Size, out: Size, codec = "avc"): string {
  const o = formatDimensions(out.width, out.height);
  if (src.width === out.width && src.height === out.height) return o;
  return `${formatDimensions(src.width, src.height)} → ${o} (${codec === "hevc" ? "HEVC" : "H.264"} needs even edges)`;
}

/**
 * Bitrate for a re-encoded picture: the compress engine's "Best quality" density at the output size
 * and `fps`, capped by the source's own bitrate (../crop/plan `reencodeBitrate`).
 */
export const pictureBitrate = (info: MediaInfo, fps = info.video?.fps) =>
  reencodeBitrate({ size: pictureSize(info), fps, source: info.video });

/** The codec a ready line names for an encoded sound: AAC on the ffmpeg.wasm path, else `writtenSoundCodec`. */
export const lineSoundCodec = (info: MediaInfo, to: ContainerId, can: SoundEncoders): string =>
  needsFfmpeg(info, sourceName(info)) ? "aac" : writtenSoundCodec(to, can);

/**
 * One sentence about the sound, for summaries and verdicts. `codec`: what an encode writes
 * (`writtenSoundCodec`, or AAC on the ffmpeg.wasm path).
 */
export function soundLine(plan: SoundPlan, faded = false, codec: string = "aac"): string {
  if (plan === "none") return "There is no sound track.";
  const to = `${codec === "pcm-s16" ? "written as" : "encoded to"} ${soundCodecName(codec)}`;
  if (faded) return `The sound fades with the picture and is ${to}.`;
  return plan === "copy" ? "The sound is copied as it is." : `The sound is ${to}.`;
}

/**
 * Ready-state estimate of a picture re-encode over the whole clip, in bytes. `can` is this browser's
 * sound encoders (../sound-codec): an encoded sound counts at 128 kb/s, or at its PCM rate.
 */
export function pictureEstimate(
  info: MediaInfo,
  size: { width: number; height: number },
  can: SoundEncoders,
  fps = info.video?.fps,
  durationSec = info.durationSec,
): { bytes: number; label: string } {
  const to = geometryContainer(sourceName(info));
  const plan = soundPlan(info, to);
  const track = info.audio?.[0];
  const audio =
    plan === "none"
      ? 0
      : plan === "copy"
        ? (track?.bitrate ?? 128_000)
        : encodedSoundBps(lineSoundCodec(info, to, can), 128_000, track);
  const video = reencodeBitrate({ size: encodedSize(size), fps, source: info.video });
  const bytes = Math.round(((video + audio) * durationSec) / 8);
  return { bytes, label: `about ${formatBytes(bytes)}` };
}

/** " Saved as MP4." when the source's container is not kept (WebM, MPEG-TS, AVI...). */
export function containerNote(info: MediaInfo): string {
  const name = sourceName(info);
  if (needsFfmpeg(info, name)) return " Saved as MP4.";
  const ext = name.split(".").pop() ?? "";
  return geometryContainer(name) === "mp4" && ext !== "mp4" && ext !== "m4v"
    ? " Saved as MP4."
    : "";
}
