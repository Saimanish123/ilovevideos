/**
 * Colour transforms for the per-frame filter runner (filter and video-fade engines). Pure; shared by
 * the worker (WebGL or CPU per frame), the page preview (an SVG filter with the same numbers) and the
 * ffmpeg command, so what the preview shows is what the encoder writes. Unit-tested.
 *
 * A transform is a per-channel power curve applied first (`gamma`, 1 = unchanged; below 1 lifts the
 * midtones and keeps black and white where they are), then an affine RGB matrix with offsets, all on
 * 0–1 sRGB values, clamped at the end. Every look on the site is one of these: no LUTs, no curves
 * beyond a power, no film emulation.
 */

/** Rec. 709 luma weights, the ones CSS `grayscale()` and `saturate()` use. */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

export interface ColorTransform {
  /** Exponent per channel (r, g, b), applied first. */
  gamma: [number, number, number];
  /** Row-major 3×4: [rr rg rb r0, gr gg gb g0, br bg bb b0]; the fourth column is the offset. */
  matrix: number[];
}

export const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
export const IDENTITY: ColorTransform = { gamma: [1, 1, 1], matrix: [...IDENTITY_MATRIX] };

const EPS = 1e-6;

/** B ∘ A: apply A, then B. */
export function compose(a: number[], b: number[]): number[] {
  const out: number[] = new Array(12).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += (b[r * 4 + k] ?? 0) * (a[k * 4 + c] ?? 0);
      out[r * 4 + c] = s;
    }
    let off = b[r * 4 + 3] ?? 0;
    for (let k = 0; k < 3; k++) off += (b[r * 4 + k] ?? 0) * (a[k * 4 + 3] ?? 0);
    out[r * 4 + 3] = off;
  }
  return out;
}

/** Saturation: 0 is grey, 1 unchanged, 2 twice as colourful; luma (Rec. 709) is kept. */
export function saturation(s: number): number[] {
  const [lr, lg, lb] = LUMA;
  return [
    lr + (1 - lr) * s,
    lg - lg * s,
    lb - lb * s,
    0,
    lr - lr * s,
    lg + (1 - lg) * s,
    lb - lb * s,
    0,
    lr - lr * s,
    lg - lg * s,
    lb + (1 - lb) * s,
    0,
  ];
}

/** Contrast around mid grey: 1 unchanged, above 1 stronger, below 1 flatter. */
export function contrast(c: number): number[] {
  const o = 0.5 * (1 - c);
  return [c, 0, 0, o, 0, c, 0, o, 0, 0, c, o];
}

/** Black and white from channel weights (they should sum to 1 so white stays white). */
export function mono(weights: readonly [number, number, number]): number[] {
  const [r, g, b] = weights;
  return [r, g, b, 0, r, g, b, 0, r, g, b, 0];
}

/** Scales each channel and adds an offset: a white-balance shift. */
export function channels(
  scale: [number, number, number],
  offset: [number, number, number] = [0, 0, 0],
) {
  return [scale[0], 0, 0, offset[0], 0, scale[1], 0, offset[1], 0, 0, scale[2], offset[2]];
}

/** Lifts black to `lift` (0–1) and keeps white: faded blacks. */
export const liftBlacks = (lift: number) =>
  channels([1 - lift, 1 - lift, 1 - lift], [lift, lift, lift]);

/** Blends a matrix toward identity: 0 = identity, 1 = the matrix. */
export const mixMatrix = (m: number[], k: number) =>
  m.map((v, i) => (IDENTITY_MATRIX[i] ?? 0) + (v - (IDENTITY_MATRIX[i] ?? 0)) * k);

export const isIdentityMatrix = (m: number[]) =>
  m.every((v, i) => Math.abs(v - (IDENTITY_MATRIX[i] ?? 0)) < EPS);
export const isIdentityGamma = (g: readonly number[]) => g.every((v) => Math.abs(v - 1) < EPS);
export const isIdentity = (t: ColorTransform) =>
  isIdentityGamma(t.gamma) && isIdentityMatrix(t.matrix);

/**
 * Brightness as a midtone lift: −1 (darker) to 1 (brighter), 0 unchanged. A power curve, not an
 * offset, so black stays black and white stays white: +1 is an exponent of 0.5.
 */
export const brightnessGamma = (v: number) => 2 ** -Math.max(-1, Math.min(1, v));

export interface Adjustments {
  /** −1 to 1. */
  brightness: number;
  /** −1 to 1: 0.5 × to 1.5 × contrast. */
  contrast: number;
  /** −1 to 1: grey to twice as colourful. */
  saturation: number;
}

/** The transform for three sliders: brightness (power), then contrast, then saturation. */
export function adjustTransform(a: Adjustments): ColorTransform {
  const g = brightnessGamma(a.brightness);
  const m = compose(contrast(1 + a.contrast * 0.5), saturation(1 + a.saturation));
  return { gamma: [g, g, g], matrix: m };
}

/**
 * The transform after a fade: `amount` 1 shows the picture, 0 the fade colour (0–1 per channel).
 * Composed onto `base`, so a look and a fade are one pass.
 */
export function withFade(
  base: ColorTransform,
  amount: number,
  color: readonly [number, number, number],
): ColorTransform {
  const a = Math.max(0, Math.min(1, amount));
  if (a >= 1 - EPS) return base;
  const fade = channels([a, a, a], [color[0] * (1 - a), color[1] * (1 - a), color[2] * (1 - a)]);
  return { gamma: base.gamma, matrix: compose(base.matrix, fade) };
}

/** One pixel through the transform (0–1 in, 0–1 out). The CPU path and the tests use it. */
export function applyPixel(
  t: ColorTransform,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const x = [r ** t.gamma[0], g ** t.gamma[1], b ** t.gamma[2]];
  const m = t.matrix;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const v =
      (m[i * 4] ?? 0) * (x[0] ?? 0) +
      (m[i * 4 + 1] ?? 0) * (x[1] ?? 0) +
      (m[i * 4 + 2] ?? 0) * (x[2] ?? 0) +
      (m[i * 4 + 3] ?? 0);
    out[i] = Math.min(1, Math.max(0, v));
  }
  return out;
}

const n = (v: number) => {
  const r = Number(v.toFixed(4));
  return Object.is(r, -0) ? "0" : String(r);
};

/**
 * The same transform as an ffmpeg filter chain: `lutrgb` for the power curve, `colorchannelmixer`
 * for the matrix and a second `lutrgb` for the offsets. Empty when the transform does nothing.
 */
export function ffmpegColorFilter(t: ColorTransform): string {
  const parts: string[] = [];
  if (!isIdentityGamma(t.gamma)) {
    const [r, g, b] = t.gamma;
    parts.push(
      `lutrgb=r='pow(val/255,${n(r)})*255':g='pow(val/255,${n(g)})*255':b='pow(val/255,${n(b)})*255'`,
    );
  }
  const m = t.matrix;
  const linear = m.map((v, i) => (i % 4 === 3 ? 0 : v));
  if (!isIdentityMatrix(linear)) {
    const names = ["rr", "rg", "rb", "gr", "gg", "gb", "br", "bg", "bb"];
    const values = [0, 1, 2, 4, 5, 6, 8, 9, 10].map((i, k) => `${names[k]}=${n(m[i] ?? 0)}`);
    parts.push(`colorchannelmixer=${values.join(":")}`);
  }
  const offsets = [m[3] ?? 0, m[7] ?? 0, m[11] ?? 0];
  if (offsets.some((o) => Math.abs(o) > EPS)) {
    const [r, g, b] = offsets.map((o) => n(o * 255));
    parts.push(`lutrgb=r='clip(val+${r},0,255)':g='clip(val+${g},0,255)':b='clip(val+${b},0,255)'`);
  }
  return parts.join(",");
}

/** The 20 values of an SVG `feColorMatrix` (4×5, alpha kept) for the page preview. */
export function svgMatrixValues(m: number[]): string {
  const row = (i: number) => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2], 0, m[i * 4 + 3]];
  return [...row(0), ...row(1), ...row(2), 0, 0, 0, 1, 0].map((v) => n(v ?? 0)).join(" ");
}

/** "#rrggbb" → 0–1 channels; black for anything else. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return [0, 0, 0];
  const v = Number.parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
