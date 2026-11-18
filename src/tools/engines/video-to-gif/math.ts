/** Pure option math for the video-to-GIF engine. Unit-tested; no browser APIs. */

export type WidthPreset = "original" | 720 | 480 | 360 | 240;
export const widthPresets: WidthPreset[] = ["original", 720, 480, 360, 240];
export type GifQuality = "fast" | "best";

export const MIN_FPS = 5;
export const MAX_FPS = 30;
export const DEFAULT_FPS = 12;
/** GIFs are short by nature; the default range is capped here, the user can extend it. */
export const DEFAULT_MAX_SECONDS = 15;
/** GIF palettes hold at most 256 colours per frame. */
export const MAX_COLORS = 256;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size for a width preset. Never upscales; keeps aspect ratio; even dimensions. */
export function gifDimensions(
  srcWidth: number,
  srcHeight: number,
  preset: WidthPreset,
): { width: number; height: number } {
  const w = srcWidth > 0 ? srcWidth : 640;
  const h = srcHeight > 0 ? srcHeight : 360;
  if (preset === "original" || preset >= w) return { width: even(w), height: even(h) };
  return { width: even(preset), height: even((h * preset) / w) };
}

/** The range a new file opens with: from the start, at most DEFAULT_MAX_SECONDS. */
export function defaultRange(durationSec: number, cap = DEFAULT_MAX_SECONDS) {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : cap;
  return { start: 0, end: Math.min(d, cap) };
}

export function frameCount(start: number, end: number, fps: number): number {
  const len = Math.max(0, end - start);
  return Math.max(1, Math.round(len * fps));
}

/** Presentation timestamps sampled at the target frame rate, inside [start, end). */
export function frameTimestamps(start: number, end: number, fps: number): number[] {
  const n = frameCount(start, end, fps);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = start + i / fps;
  return out;
}

/**
 * GIF stores frame delays in hundredths of a second, so 1/fps rarely fits: at 12 fps a constant
 * delay is 8 or 9 cs and the GIF runs 4 % fast or 8 % slow. Each frame instead gets the hundredths
 * between its own start and the next one's, rounded on the running total (8, 9, 8, 8, 9, 8, ...), so
 * N frames last exactly round(N × 100 / fps) cs, as ffmpeg's GIF muxer does. Browsers treat delays
 * under 2 cs as 10 cs, so 2 cs (50 fps) is the floor.
 */
export function frameDelaysCs(count: number, fps: number): number[] {
  const safe = fps > 0 && Number.isFinite(fps) ? fps : DEFAULT_FPS;
  const at = (i: number) => Math.round((i * 100) / safe);
  return Array.from({ length: Math.max(0, count) }, (_, i) => Math.max(2, at(i + 1) - at(i)));
}

/** Frame rate the GIF plays at on average: the chosen one, unless above the 50 fps floor. */
export function effectiveFps(fps: number): number {
  const safe = fps > 0 && Number.isFinite(fps) ? fps : DEFAULT_FPS;
  return Math.min(safe, 50);
}

/**
 * Bytes per pixel per frame, measured on 2026-10-08 for 24 frames at 480×270 from five sources
 * (flat test pattern, detailed test pattern, noisy pattern, fractal zoom, noisy gradients): fast
 * (gifenc, palette per frame, no dither) 0.11 / 0.28 / 0.11 / 0.34 / 1.08, median 0.28; best (ffmpeg
 * palettegen + sierra2_4a dither) 0.14 / 0.67 / 0.61 / 0.56 / 1.22, median 0.61. Content moves the
 * size tenfold, so these medians are only the fallback: a measured sample frame
 * (`sampleGifBytesPerPixel`, within 10 % of the fast result on all five) is used when the page has one.
 */
export const GIF_BYTES_PER_PIXEL = { fast: 0.3, best: 0.6 } as const;
/** Best over fast on the same sources: 1.26 / 2.43 / 5.7 / 1.66 / 1.13, median 1.7. */
export const BEST_OVER_FAST = 1.7;

/**
 * Size estimate: frames × pixels × bytes per pixel, plus each frame's local palette (768 bytes) and
 * descriptors. `sampledPerPixel` is a fast-mode measurement of one frame of this video.
 */
export function estimateGifBytes(
  width: number,
  height: number,
  frames: number,
  quality: GifQuality,
  sampledPerPixel?: number,
): number {
  const measured = sampledPerPixel !== undefined && sampledPerPixel > 0;
  const perPixel = measured
    ? sampledPerPixel * (quality === "best" ? BEST_OVER_FAST : 1)
    : GIF_BYTES_PER_PIXEL[quality];
  const perFrameOverhead = MAX_COLORS * 3 + 40;
  return Math.round(frames * (width * height * perPixel + perFrameOverhead) + 1024);
}
