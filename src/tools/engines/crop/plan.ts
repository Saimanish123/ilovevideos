/**
 * What a crop or aspect-ratio run will produce, decided before it starts so the panel, the worker
 * engine and the ffmpeg runner agree. Pure; safe to import on the page (no mediabunny).
 */
import { containerFromFormatName } from "@/content/formats/containers";
import { videoBitrateForPreset } from "../compress/math";
import type { ContainerId } from "../mediabunny/shared";
import type { MediaInfo } from "../types";
import { cropFilter, type PadColor, type PadLayout, type Rect, type Size } from "./math";

/**
 * `scale` (crop only) resizes the kept window to a smaller frame, e.g. a platform's size cap; `end`
 * keeps only the first `end` seconds (a platform's length limit). Both are optional; crop-video uses
 * neither.
 */
export type GeometryPlan = (
  | { kind: "crop"; rect: Rect; scale?: Size }
  | { kind: "pad"; layout: PadLayout; color: PadColor }
) & { end?: number };

export const outputSize = (plan: GeometryPlan): Size =>
  plan.kind === "crop"
    ? (plan.scale ?? { width: plan.rect.width, height: plan.rect.height })
    : { width: plan.layout.width, height: plan.layout.height };

/** ffmpeg filter for a crop plan: the crop, then the scale when the plan has one. */
export const cropPlanFilter = (plan: Extract<GeometryPlan, { kind: "crop" }>) =>
  `${cropFilter(plan.rect)}${plan.scale ? `,scale=${plan.scale.width}:${plan.scale.height}` : ""}`;

/**
 * MP4, MOV and MKV keep their container (all three hold H.264). WebM cannot hold H.264, and VP9
 * software encoding is several times slower, so WebM input is written as MP4; the panel says so.
 * Files only ffmpeg can read are written as MP4 too.
 */
export function geometryContainer(fileName: string): ContainerId {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "mov") return "mov";
  if (ext === "mkv") return "mkv";
  return "mp4";
}

/** Whether the sound is copied bit for bit (true) or encoded to AAC (false) on the native path. */
export function audioCopied(info: MediaInfo, to: ContainerId): boolean {
  const a = info.audio?.[0];
  if (!a) return true;
  return to === "mkv" || a.codec === "aac";
}

/**
 * Relative bitrate for a similar picture (H.264 = 1). A working choice (ADR-0037), not a measured
 * equivalence; it scales the source's own bitrate into the codec a re-encode writes.
 */
export const CODEC_EFFICIENCY: Record<string, number> = {
  avc: 1,
  hevc: 0.6,
  vp9: 0.65,
  av1: 0.5,
  vp8: 1.1,
};

/** No re-encode plans less than this; below it even 360p falls apart. */
export const MIN_REENCODE_BITRATE = 200_000;

/**
 * Video bitrate for a re-encode: the compress engine's "Best quality" density at the output size
 * and rate, scaled for the codec, and never more than the source itself spends on the same share of
 * the picture, scaled the same way (ADR-0060). A re-encode cannot add detail, so spending more only
 * makes the file bigger: a 90 kbps VP9 clip filtered at the density alone came out nine times its
 * size. Without a known source bitrate the density stands.
 */
export function reencodeBitrate(o: {
  size: Size;
  fps: number | undefined;
  /** Target codec; H.264 when omitted. */
  codec?: string;
  /** The source picture: its size, codec and measured bitrate. */
  source?: { width: number; height: number; codec: string; bitrate?: number };
}): number {
  const k = CODEC_EFFICIENCY[o.codec ?? "avc"] ?? 1;
  const density = videoBitrateForPreset("best", o.size.width, o.size.height, o.fps ?? 30) * k;
  const src = o.source;
  let cap = Number.POSITIVE_INFINITY;
  if (src?.bitrate && src.bitrate > 0 && src.width > 0 && src.height > 0) {
    // The share of the source's picture the output shows (a crop keeps less; bars cost next to nothing).
    const share = Math.min(1, (o.size.width * o.size.height) / (src.width * src.height));
    cap = (src.bitrate * share * k) / (CODEC_EFFICIENCY[src.codec] ?? 1);
  }
  return Math.round(Math.max(Math.min(MIN_REENCODE_BITRATE, density), Math.min(density, cap)));
}

/**
 * H.264 bitrate for the output: "Best quality" density, so a crop looks like its source, capped by
 * the source's own bitrate when `source` is given (`reencodeBitrate`).
 */
export function geometryBitrate(
  size: Size,
  fps: number | undefined,
  source?: MediaInfo["video"],
): number {
  return reencodeBitrate({ size, fps, source });
}

/** True when only ffmpeg.wasm can read this file (AVI, WMV, FLV, ...); the run goes to the page runner. */
export function needsFfmpeg(info: MediaInfo, fileName: string): boolean {
  // ffmpeg.wasm also decodes pictures this browser cannot (ProRes; HEVC in Chrome without platform
  // support), which a native run would drop, keeping only the sound.
  return (
    containerFromFormatName(info.container, fileName)?.read === "ffmpeg" ||
    info.video?.decodable === false
  );
}

/**
 * A stand-in file name with the source's real extension, for panel lines that run without the file
 * name (the stage's `summary`): "QuickTime" → "file.mov", ffmpeg's "asf" → "file.wmv".
 */
export function sourceName(info: MediaInfo): string {
  const guess = `file.${info.container.toLowerCase()}`;
  const c = containerFromFormatName(info.container, guess);
  return `file.${c?.extensions[0] ?? info.container.toLowerCase()}`;
}

/** The output container differs from the source's (WebM, MPEG-TS, AVI, ... are written as MP4). */
export function changesContainer(fileName: string, info: MediaInfo): boolean {
  if (needsFfmpeg(info, fileName)) return true;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return geometryContainer(fileName) === "mp4" && ext !== "mp4" && ext !== "m4v";
}
