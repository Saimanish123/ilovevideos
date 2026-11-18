/**
 * Video to image sequence: which frames are taken, how the files are named, and what it costs.
 * Pure; shared by the panel (count, estimate, ticks on the timeline), the worker engine and tests.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import {
  DEFAULT_QUALITY,
  ffmpegQscale,
  type ImageFormat,
  imageFormats,
} from "../frame-extract/math";

/** Most images one run writes: they are held in memory until they are zipped. */
export const MAX_IMAGES = 2000;
/** Stop before the images take more memory than this (bytes). */
export const MAX_BYTES = 1_500_000_000;

export const VideoToFramesOptions = z.object({
  /** Take a frame every `step` seconds, or every `step`-th decoded frame. */
  every: z.enum(["seconds", "frames"]).default("seconds"),
  step: z.number().positive().default(1),
  /** Part of the video to take frames from; the whole video when absent. */
  range: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
  format: z.enum(imageFormats).default("jpg"),
  quality: z.number().min(1).max(100).default(DEFAULT_QUALITY),
  /** Scale down to at most this width (never up); the source's width when absent. */
  maxWidth: z.number().int().positive().optional(),
});
export type VideoToFramesOptions = z.infer<typeof VideoToFramesOptions>;

const safeFps = (fps: number) => (fps > 0 && Number.isFinite(fps) ? fps : 30);

export function rangeOf(o: Pick<VideoToFramesOptions, "range">, durationSec: number) {
  const start = Math.max(0, Math.min(o.range?.start ?? 0, durationSec));
  const end = Math.max(start, Math.min(o.range?.end ?? durationSec, durationSec));
  return { start, end };
}

/** Times of the frames taken in seconds mode: start, start + step, … before the end. */
export function secondTimes(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  if (!(step > 0)) return out;
  // Integer steps from the start, so 0.1 × 30 does not drift to 2.9999.
  for (let i = 0; ; i++) {
    const t = Math.round((start + i * step) * 1e6) / 1e6;
    if (t >= end - 1e-6 || out.length > MAX_IMAGES) break;
    out.push(t);
  }
  return out;
}

/** How many images a run writes (frames mode counts the frames the rate says are in the range). */
export function imageCount(o: VideoToFramesOptions, durationSec: number, fps: number): number {
  const { start, end } = rangeOf(o, durationSec);
  if (o.every === "seconds") return secondTimes(start, end, o.step).length;
  const frames = Math.max(0, Math.round((end - start) * safeFps(fps)));
  return Math.ceil(frames / Math.max(1, Math.round(o.step)));
}

/** Times to mark on the timeline (seconds mode exact; frames mode from the frame rate). */
export function markTimes(o: VideoToFramesOptions, durationSec: number, fps: number): number[] {
  const { start, end } = rangeOf(o, durationSec);
  if (o.every === "seconds") return secondTimes(start, end, o.step);
  return secondTimes(start, end, Math.max(1, Math.round(o.step)) / safeFps(fps));
}

/** Output size: the display size, or scaled down to `maxWidth` with even sides and the same shape. */
export function outputSize(
  video: { width: number; height: number },
  maxWidth: number | undefined,
): { width: number; height: number } {
  if (!maxWidth || maxWidth >= video.width) return { width: video.width, height: video.height };
  const width = Math.max(2, Math.round(maxWidth / 2) * 2);
  const height = Math.max(2, Math.round((video.height * width) / video.width / 2) * 2);
  return { width, height };
}

/** "clip-0001.jpg": one number per image, zero-padded so the files sort in order everywhere. */
export function sequenceName(base: string, n: number, count: number, format: ImageFormat): string {
  const digits = Math.max(4, String(count).length);
  return `${base}-${String(n).padStart(digits, "0")}.${format}`;
}

/** The same job with ffmpeg: the fps or select filter, optional scale, numbered output. */
export function framesCommand(
  name: string,
  base: string,
  o: VideoToFramesOptions,
  durationSec: number,
  size: { width: number; height: number },
  source: { width: number },
): string {
  const { start, end } = rangeOf(o, durationSec);
  const cut = start > 0 || end < durationSec;
  const seek = cut ? `-ss ${start.toFixed(3)} ` : "";
  const length = cut ? ` -t ${(end - start).toFixed(3)}` : "";
  const pick =
    o.every === "seconds"
      ? `fps=1/${Number(o.step.toFixed(3))}`
      : Math.round(o.step) === 1
        ? ""
        : `select='not(mod(n\\,${Math.round(o.step)}))'`;
  const scale = size.width < source.width ? `scale=${size.width}:-2` : "";
  const vf = [pick, scale].filter(Boolean).join(",");
  const q =
    o.format === "jpg"
      ? ` -q:v ${ffmpegQscale(o.quality)}`
      : o.format === "webp"
        ? ` -quality ${Math.round(o.quality)}`
        : "";
  const vsync = o.every === "frames" && Math.round(o.step) > 1 ? " -fps_mode vfr" : "";
  return `ffmpeg ${seek}-i ${shellQuote(name)}${length}${vf ? ` -vf "${vf}"` : ""}${vsync}${q} ${shellQuote(`${base}-%04d.${o.format}`)}`;
}
