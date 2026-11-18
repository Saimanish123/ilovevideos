/**
 * Frame scores for the sharpest-frame tool (ADR-0094). Pure; no browser APIs; unit-tested.
 *
 * Sharpness is the variance of the Laplacian of the brightness, measured after averaging 2×2
 * blocks: the average keeps edges (which motion blur and focus blur soften) and removes most
 * single-pixel sensor noise, which would otherwise score as "detail".
 */

/** Brightness (BT.601 weights) of RGBA pixels, averaged over 2×2 blocks. */
export function halfLuma(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): { y: Float32Array; w: number; h: number } {
  const w = width >> 1;
  const h = height >> 1;
  const y = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const p = ((2 * j + dy) * width + 2 * i + dx) * 4;
          s += 0.299 * (rgba[p] ?? 0) + 0.587 * (rgba[p + 1] ?? 0) + 0.114 * (rgba[p + 2] ?? 0);
        }
      y[j * w + i] = s / 4;
    }
  }
  return { y, w, h };
}

/** Variance of the 4-neighbour Laplacian over the interior. Higher is sharper. */
export function laplacianVariance(y: Float32Array, w: number, h: number): number {
  let n = 0;
  let sum = 0;
  let sq = 0;
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const c = j * w + i;
      const l =
        (y[c - 1] ?? 0) + (y[c + 1] ?? 0) + (y[c - w] ?? 0) + (y[c + w] ?? 0) - 4 * (y[c] ?? 0);
      sum += l;
      sq += l * l;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}

/** Sharpness of an RGBA frame. */
export function sharpness(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const { y, w, h } = halfLuma(rgba, width, height);
  return laplacianVariance(y, w, h);
}

/** Median of a list (0 when empty). */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Timestamps to score in [start, end): every frame, or an even sample when there are more than `max`. */
export function scoreTimes(start: number, end: number, fps: number, max: number): number[] {
  const f = fps > 0 && Number.isFinite(fps) ? fps : 30;
  const frames = Math.max(1, Math.round((end - start) * f));
  const n = Math.min(frames, max);
  const step = frames / n;
  return Array.from({ length: n }, (_, i) => start + Math.floor(i * step) / f);
}

/** Size for scoring: the long edge capped at `cap`, even, aspect kept. Full size when smaller. */
export function analysisSize(
  width: number,
  height: number,
  cap = 640,
): { width: number; height: number } {
  const long = Math.max(width, height);
  const k = long > cap ? cap / long : 1;
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * Exposure fitness, 0–1, from BT.601 brightness: highest near mid-grey (118 of 255), lowered by the
 * share of crushed (< 16) or blown (> 239) pixels. A black frame from a fade scores 0.
 */
export function exposure(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const n = width * height;
  if (n === 0) return 0;
  let sum = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const y = 0.299 * (rgba[p] ?? 0) + 0.587 * (rgba[p + 1] ?? 0) + 0.114 * (rgba[p + 2] ?? 0);
    sum += y;
    if (y < 16 || y > 239) clipped++;
  }
  const mean = sum / n;
  return Math.max(0, Math.min(1, 1 - Math.abs(mean - 118) / 118 - 2 * (clipped / n) * 0.5));
}

/** A 16×9 brightness thumbnail, for telling scenes apart. */
export function signature(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const sig = new Float32Array(16 * 9);
  const count = new Float32Array(16 * 9);
  for (let y = 0; y < height; y++) {
    const cy = Math.min(8, Math.floor((y * 9) / height));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(15, Math.floor((x * 16) / width));
      const p = (y * width + x) * 4;
      sig[cy * 16 + cx] =
        (sig[cy * 16 + cx] ?? 0) +
        0.299 * (rgba[p] ?? 0) +
        0.587 * (rgba[p + 1] ?? 0) +
        0.114 * (rgba[p + 2] ?? 0);
      count[cy * 16 + cx] = (count[cy * 16 + cx] ?? 0) + 1;
    }
  }
  for (let i = 0; i < sig.length; i++) sig[i] = (sig[i] ?? 0) / Math.max(1, count[i] ?? 1);
  return sig;
}

/** Mean absolute difference of two signatures, 0–1. */
export function distance(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return d / a.length / 255;
}

export interface Candidate {
  t: number;
  sharpness: number;
  exposure: number;
  sig: Float32Array;
}

/** Two candidates closer than this (mean brightness difference of their 16×9 signatures) are one scene. */
export const SAME_SCENE = 0.06;

/**
 * Thumbnail suggestions: score = exposure × √(sharpness ÷ median sharpness), so a well-lit sharp frame
 * wins and a dark or blurred one sinks; then the best are taken greedily, skipping any within
 * SAME_SCENE of one already taken, so no two suggestions are near-duplicates. Returned in time order.
 */
export function suggest(candidates: Candidate[], count: number): (Candidate & { score: number })[] {
  const mid = median(candidates.map((c) => c.sharpness)) || 1;
  const scored = candidates
    .map((c) => ({ ...c, score: c.exposure * Math.sqrt(c.sharpness / mid) }))
    .sort((a, b) => b.score - a.score);
  const picked: (Candidate & { score: number })[] = [];
  for (const c of scored) {
    if (picked.length >= count) break;
    if (c.score <= 0) break;
    if (picked.some((p) => distance(p.sig, c.sig) < SAME_SCENE)) continue;
    picked.push(c);
  }
  return picked.sort((a, b) => a.t - b.t);
}

/** Times to sample for suggestions: `n` spread over the video, avoiding the very first and last 2%. */
export function suggestionTimes(duration: number, n: number): number[] {
  if (!(duration > 0)) return [0];
  const a = duration * 0.02;
  const b = duration * 0.98;
  return Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);
}
