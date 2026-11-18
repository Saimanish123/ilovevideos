/**
 * Pure option math for video → animated WebP, APNG and AVIF. The range, frame timing and output size
 * follow the GIF engine (`../video-to-gif/math`), so the three pages and the GIF page cut the same
 * frames. Unit-tested; no browser APIs.
 */

export type AnimatedFormat = "webp" | "apng" | "avif";
export const animatedFormats = ["webp", "apng", "avif"] as const;
export type AnimatedQuality = "small" | "balanced" | "high";
export const animatedQualities = ["small", "balanced", "high"] as const;

export const FORMAT_NAME: Record<AnimatedFormat, string> = {
  webp: "WebP",
  apng: "APNG",
  avif: "AVIF",
};
export const FORMAT_EXT: Record<AnimatedFormat, string> = {
  webp: "webp",
  apng: "png",
  avif: "avif",
};
export const FORMAT_MIME: Record<AnimatedFormat, string> = {
  webp: "image/webp",
  apng: "image/apng",
  avif: "image/avif",
};

/** Frame rates offered. These formats time frames in milliseconds or exact fractions, so 24 and 25 are exact. */
export const animatedFpsChoices = [10, 12, 15, 20, 24, 30] as const;
export const MIN_FPS = 5;
export const MAX_FPS = 30;

/**
 * Defaults per format, chosen from the measurements in DECISIONS.md ADR-0093: AV1 codes motion, so
 * more frames cost little; APNG stores every changed pixel losslessly, so it starts lower.
 */
export const DEFAULT_FPS: Record<AnimatedFormat, number> = { webp: 15, apng: 12, avif: 24 };

/** libwebp quality (0–1) for a canvas WebP frame. */
export const WEBP_QUALITY: Record<AnimatedQuality, number> = {
  small: 0.6,
  balanced: 0.75,
  high: 0.9,
};

/**
 * AV1 bits per pixel per frame (variable bitrate). Measured on six clips at 480×270 and 15 fps
 * (ADR-0093): 0.12 gives 36 to 49 dB luma PSNR against the lossless frames, at 1/25 to 1/40 of the
 * GIF of the same frames.
 */
export const AV1_BITS_PER_PIXEL: Record<AnimatedQuality, number> = {
  small: 0.06,
  balanced: 0.12,
  high: 0.24,
};
/** VP8 key frames (WebP where the canvas cannot encode it): bits per pixel per frame. */
export const VP8_BITS_PER_PIXEL: Record<AnimatedQuality, number> = {
  small: 0.12,
  balanced: 0.2,
  high: 0.4,
};

/**
 * A lossy frame only updates the rectangle where some pixel moved by more than this (on any of R, G
 * and B, 0–255) from what is already on screen; smaller changes are below what the encoder keeps.
 */
export const CHANGE_THRESHOLD = 6;

/**
 * Bounding box of the pixels whose R, G or B differs by more than `threshold` between two RGBA
 * frames, with x and y rounded down to even (WebP frame offsets are stored halved). Undefined when
 * nothing changed by that much.
 */
export function changedRectRgba(
  shown: Uint8Array | Uint8ClampedArray,
  next: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): { x: number; y: number; w: number; h: number } | undefined {
  let x0 = width;
  let y0 = -1;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = base + x * 4;
      if (
        Math.abs((shown[i] ?? 0) - (next[i] ?? 0)) > threshold ||
        Math.abs((shown[i + 1] ?? 0) - (next[i + 1] ?? 0)) > threshold ||
        Math.abs((shown[i + 2] ?? 0) - (next[i + 2] ?? 0)) > threshold
      ) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y0 < 0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return undefined;
  const ex = x0 - (x0 % 2);
  const ey = y0 - (y0 % 2);
  return { x: ex, y: ey, w: x1 - ex + 1, h: y1 - ey + 1 };
}

/** Copies a rectangle of `src` into `dst` (both RGBA, `width` wide). */
export function copyRect(
  src: Uint8Array | Uint8ClampedArray,
  dst: Uint8Array | Uint8ClampedArray,
  width: number,
  r: { x: number; y: number; w: number; h: number },
) {
  for (let y = r.y; y < r.y + r.h; y++) {
    const at = (y * width + r.x) * 4;
    dst.set(src.subarray(at, at + r.w * 4), at);
  }
}

/**
 * Bytes per pixel per frame when nothing of this video was measured: the median of six clips at
 * 480×270 and 15 fps (ADR-0093). WebP balanced read 0.0014 (a still screen with a moving cursor) to
 * 0.59 (pure noise), median 0.046; APNG 0.002 to 2.97, median 0.9. The page measures one frame of
 * the video itself when it can (`sampledPerPixel`), which tracks the content far better.
 */
export const BYTES_PER_PIXEL_FRAME: Record<"webp" | "apng", Record<AnimatedQuality, number>> = {
  webp: { small: 0.04, balanced: 0.046, high: 0.11 },
  apng: { small: 0.9, balanced: 0.9, high: 0.9 },
};

/**
 * Size estimate. AVIF is the encoder's bitrate target (still content comes in under it). WebP and
 * APNG are frames × pixels × bytes per pixel, from `sampledPerPixel` (one frame of this video encoded
 * the way the engine encodes a whole frame) when the page has it: an upper bound for footage where
 * only part of the picture moves, since later frames store only what changed.
 */
export function estimateAnimatedBytes(
  format: AnimatedFormat,
  quality: AnimatedQuality,
  width: number,
  height: number,
  frames: number,
  sampledPerPixel?: number,
): number {
  if (format === "avif")
    return Math.round((AV1_BITS_PER_PIXEL[quality] / 8) * width * height * frames + 1024);
  const perPixel =
    sampledPerPixel && sampledPerPixel > 0
      ? sampledPerPixel
      : BYTES_PER_PIXEL_FRAME[format][quality];
  return Math.round(frames * width * height * perPixel + 1024);
}

/**
 * RGBA → I420, BT.601 limited range (what a WebP decoder assumes of VP8, WebP container spec), the
 * chroma of each 2×2 block averaged. Even sizes only (the output size always is).
 */
export function rgbaToI420(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const cw = width >> 1;
  const ch = height >> 1;
  const out = new Uint8Array(width * height + 2 * cw * ch);
  const u0 = width * height;
  const v0 = u0 + cw * ch;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i] ?? 0;
      const g = rgba[i + 1] ?? 0;
      const b = rgba[i + 2] ?? 0;
      out[y * width + x] = Math.round(16 + 0.256788 * r + 0.504129 * g + 0.097906 * b);
    }
  }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const i = ((2 * y + dy) * width + 2 * x + dx) * 4;
        r += rgba[i] ?? 0;
        g += rgba[i + 1] ?? 0;
        b += rgba[i + 2] ?? 0;
      }
      r /= 4;
      g /= 4;
      b /= 4;
      out[u0 + y * cw + x] = Math.round(128 - 0.148223 * r - 0.290993 * g + 0.439216 * b);
      out[v0 + y * cw + x] = Math.round(128 + 0.439216 * r - 0.367788 * g - 0.071427 * b);
    }
  }
  return out;
}
