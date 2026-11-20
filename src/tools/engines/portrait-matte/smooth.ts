/**
 * Steadies the person mask over time, on the model's small grid (pure, unit-tested, shared by the
 * preview and the engine). MediaPipe's SegmentationSmoothingCalculator idea: a pixel the model is
 * sure about (near 0 or 1) keeps its new value, so a moving person is never dragged behind; a pixel
 * it is unsure about (near 0.5, the flickering edge) leans on its neighbours in time. MediaPipe can
 * only look back, at the previous steadied mask; a file is known ahead, so the engine also looks at
 * the next frame's mask, which centres the blend on the frame instead of trailing it.
 */

/** MediaPipe's polynomial for the squared uncertainty of a probability p, as a function of (p − ½)². */
const C1 = 5.68842;
const C2 = -0.748699;
const C3 = -57.8051;
const C4 = 291.309;
const C5 = -624.717;

/** 1 at p = 0.5 (no idea), 0 at p = 0 or 1 (sure). */
export function uncertainty(p: number): number {
  const t = p - 0.5;
  const x = t * t;
  return 1 - Math.min(1, Math.max(0, x * (C1 + x * (C2 + x * (C3 + x * (C4 + x * C5))))));
}

/** How far an unsure pixel moves to its neighbours in time (MediaPipe's selfie graph uses 0.9). */
export const COMBINE = 0.9;

/**
 * Steadies `current` in place: each pixel moves towards `previous` (the last steadied mask) and,
 * when given, `next` (the next raw mask), by its own uncertainty times `ratio`.
 */
export function steady(
  current: Float32Array,
  previous: Float32Array | undefined,
  next: Float32Array | undefined,
  ratio = COMBINE,
): Float32Array {
  if (!previous && !next) return current;
  const n = current.length;
  for (let i = 0; i < n; i++) {
    const p = current[i] ?? 0;
    const a = previous?.[i];
    const b = next?.[i];
    const near = a !== undefined && b !== undefined ? (a + b) / 2 : (a ?? b ?? p);
    current[i] = p + (near - p) * uncertainty(p) * ratio;
  }
  return current;
}

/** The mask as bytes for a texture (0 to 255). */
export function toBytes(
  mask: Float32Array,
  out: Uint8Array = new Uint8Array(mask.length),
): Uint8Array {
  for (let i = 0; i < mask.length; i++)
    out[i] = Math.round(Math.min(1, Math.max(0, mask[i] ?? 0)) * 255);
  return out;
}

/**
 * Mean change of a mask sequence between frames, within `band` (1 where measured): the flicker
 * measure of the tests (0 for a still mask). Masks are 0 to 1 values of equal length.
 */
export function flicker(masks: ArrayLike<number>[], band?: ArrayLike<number>): number {
  let sum = 0;
  let n = 0;
  for (let f = 1; f < masks.length; f++) {
    const a = masks[f - 1];
    const b = masks[f];
    if (!a || !b) continue;
    for (let i = 0; i < b.length; i++) {
      if (band && !band[i]) continue;
      sum += Math.abs((b[i] ?? 0) - (a[i] ?? 0));
      n++;
    }
  }
  return n ? sum / n : 0;
}
