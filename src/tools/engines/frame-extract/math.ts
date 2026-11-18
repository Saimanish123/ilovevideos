/** Pure helpers for the frame-extract engine. Unit-tested; no browser APIs. */
import { shellQuote } from "@/lib/format";

export const imageFormats = ["png", "jpg", "webp"] as const;
export type ImageFormat = (typeof imageFormats)[number];

export const imageMime: Record<ImageFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export const imageLabel: Record<ImageFormat, string> = { png: "PNG", jpg: "JPG", webp: "WebP" };

/** PNG is lossless; quality only applies to JPG and WebP. */
export const isLossy = (f: ImageFormat) => f !== "png";

/** Quality presets for lossy formats, as the 0–100 scale users know from image editors. */
export const qualityPresets = [
  { value: 92, label: "High" },
  { value: 80, label: "Medium" },
  { value: 60, label: "Low" },
] as const;
export const DEFAULT_QUALITY = 92;

const safeFps = (fps: number) => (fps > 0 && Number.isFinite(fps) ? fps : 30);

/** Presentation time of the last frame the file can show: frames start at 0, so it is one frame before the end. */
export function lastFrameTime(durationSec: number, fps: number): number {
  const f = safeFps(fps);
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) return 0;
  return Math.max(0, (Math.ceil(durationSec * f - 1e-6) - 1) / f);
}

/** Snaps a time to the nearest frame boundary and keeps it inside the clip. */
export function snapToFrame(t: number, fps: number, durationSec: number): number {
  const f = safeFps(fps);
  const last = lastFrameTime(durationSec, f);
  if (!Number.isFinite(t)) return 0;
  const snapped = Math.round(t * f) / f;
  return Math.min(last, Math.max(0, snapped));
}

/** "clip" at 12.34 s → "clip-0m12s34.png". Minutes unpadded, seconds and hundredths padded. */
export function frameFilename(base: string, t: number, format: ImageFormat): string {
  const cs = Math.max(0, Math.round(t * 100));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const hh = cs % 100;
  return `${base}-${m}m${String(s).padStart(2, "0")}s${String(hh).padStart(2, "0")}.${format}`;
}

/** ffmpeg's JPEG quality scale runs 2 (best) to 31 (worst); map the 0–100 scale onto it. */
export function ffmpegQscale(quality: number): number {
  const q = Math.min(100, Math.max(0, quality));
  return Math.round(2 + ((100 - q) / 100) * 29);
}

export function frameFfmpegCommand(
  inputName: string,
  outputName: string,
  t: number,
  format: ImageFormat,
  quality: number,
): string {
  const q = format === "jpg" ? ` -q:v ${ffmpegQscale(quality)}` : "";
  const webp = format === "webp" ? ` -quality ${Math.round(quality)}` : "";
  return `ffmpeg -ss ${t.toFixed(3)} -i ${shellQuote(inputName)} -frames:v 1${q}${webp} ${shellQuote(outputName)}`;
}
