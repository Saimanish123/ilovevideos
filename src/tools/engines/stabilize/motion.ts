/**
 * Global motion between two frames: the similarity (shift, turn, scale) that maps the newer frame
 * onto the older one, found by direct alignment of their brightness. Gauss-Newton on every pixel
 * (every second one at the finest level), coarse to fine over an image pyramid, with Tukey weights
 * so a subject that moves on its own counts for little. Pure: typed arrays in, numbers out; runs in
 * the engine worker and in unit tests.
 *
 * Coordinates are centred on the picture: (0, 0) is its middle, x right, y down, in pixels of the
 * analysis size. A `Motion` maps a point p of frame k to the point of frame k − 1 showing the same
 * thing: p' = s·R(θ)·p + (tx, ty), written as a = s·cos θ, b = s·sin θ.
 */

export interface Motion {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Motion = { a: 1, b: 0, tx: 0, ty: 0 };

/** A grey picture: `data` holds `width`×`height` brightness values, row by row. */
export interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

/** Halves a picture by averaging 2×2 blocks (a dropped odd edge is fine for alignment). */
export function halve(g: Gray): Gray {
  const w = g.width >> 1;
  const h = g.height >> 1;
  const out = new Float32Array(w * h);
  const src = g.data;
  for (let y = 0; y < h; y++) {
    const r0 = 2 * y * g.width;
    const r1 = r0 + g.width;
    for (let x = 0; x < w; x++) {
      const i = 2 * x;
      out[y * w + x] =
        ((src[r0 + i] ?? 0) +
          (src[r0 + i + 1] ?? 0) +
          (src[r1 + i] ?? 0) +
          (src[r1 + i + 1] ?? 0)) /
        4;
    }
  }
  return { data: out, width: w, height: h };
}

/** Levels from full size down, stopping before the short side drops under 24 px. */
export function pyramid(g: Gray, maxLevels = 5): Gray[] {
  const levels = [g];
  while (levels.length < maxLevels) {
    const last = levels[levels.length - 1] as Gray;
    if (Math.min(last.width, last.height) < 48) break;
    levels.push(halve(last));
  }
  return levels;
}

/** Bilinear sample at (x, y) in pixel coordinates (0 at the first pixel's centre); NaN outside. */
function sample(g: Gray, x: number, y: number): number {
  if (!(x >= 0 && y >= 0 && x < g.width - 1 && y < g.height - 1)) return Number.NaN;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * g.width + x0;
  const d = g.data;
  const top = (d[i] as number) * (1 - fx) + (d[i + 1] as number) * fx;
  const bottom = (d[i + g.width] as number) * (1 - fx) + (d[i + g.width + 1] as number) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Solves the 4×4 system `h · d = g` (symmetric, positive) by Gaussian elimination; null when singular. */
function solve4(h: Float64Array, g: Float64Array): Float64Array | null {
  const m = new Float64Array(20);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) m[r * 5 + c] = h[r * 4 + c] as number;
    m[r * 5 + 4] = g[r] as number;
  }
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++)
      if (Math.abs(m[r * 5 + c] as number) > Math.abs(m[p * 5 + c] as number)) p = r;
    if (Math.abs(m[p * 5 + c] as number) < 1e-9) return null;
    if (p !== c)
      for (let k = 0; k < 5; k++) {
        const t = m[c * 5 + k] as number;
        m[c * 5 + k] = m[p * 5 + k] as number;
        m[p * 5 + k] = t;
      }
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = (m[r * 5 + c] as number) / (m[c * 5 + c] as number);
      if (f === 0) continue;
      for (let k = c; k < 5; k++)
        m[r * 5 + k] = (m[r * 5 + k] as number) - f * (m[c * 5 + k] as number);
    }
  }
  const d = new Float64Array(4);
  for (let r = 0; r < 4; r++) d[r] = (m[r * 5 + 4] as number) / (m[r * 5 + r] as number);
  return d;
}

export interface Estimate {
  motion: Motion;
  /**
   * How well the frames line up after the motion: the share of sampled pixels that count (Tukey
   * weight above zero). Under about 0.3 the frames do not show the same scene (a cut, a flash).
   */
  agreement: number;
}

/**
 * The motion from `cur` (frame k) to `prev` (frame k − 1), both given as pyramids of the same
 * sizes. `guess` starts the search (the previous pair's motion follows a pan); the coarsest level
 * covers shifts of several times its own size, so fast pans are found too.
 */
export function estimateMotion(prev: Gray[], cur: Gray[], guess: Motion = IDENTITY): Estimate {
  const levels = Math.min(prev.length, cur.length);
  const top = levels - 1;
  let { a, b } = guess;
  let tx = guess.tx / 2 ** top;
  let ty = guess.ty / 2 ** top;
  let agreement = 0;
  const h = new Float64Array(16);
  const g = new Float64Array(4);
  for (let l = top; l >= 0; l--) {
    const P = prev[l] as Gray;
    const C = cur[l] as Gray;
    const cx = (C.width - 1) / 2;
    const cy = (C.height - 1) / 2;
    const px = (P.width - 1) / 2;
    const py = (P.height - 1) / 2;
    const step = C.width * C.height > 40_000 ? 2 : 1;
    const margin = 2;
    const iterations = l === 0 ? 8 : 12;
    let scale = 0;
    for (let it = 0; it < iterations; it++) {
      // Residuals first, for the robust scale (median absolute residual).
      const rs: number[] = [];
      for (let y = margin; y < C.height - margin; y += step) {
        const yc = y - cy;
        for (let x = margin; x < C.width - margin; x += step) {
          const xc = x - cx;
          const X = a * xc - b * yc + tx + px;
          const Y = b * xc + a * yc + ty + py;
          const v = sample(P, X, Y);
          if (Number.isNaN(v)) continue;
          rs.push(Math.abs((C.data[y * C.width + x] as number) - v));
        }
      }
      if (rs.length < 64) break;
      const sorted = Float32Array.from(rs).sort();
      // At least 2 levels: below that, encoder noise alone would be called motion.
      scale = Math.max(2, 1.4826 * (sorted[sorted.length >> 1] as number));
      const c = 4.685 * scale;
      h.fill(0);
      g.fill(0);
      let used = 0;
      let total = 0;
      for (let y = margin; y < C.height - margin; y += step) {
        const yc = y - cy;
        for (let x = margin; x < C.width - margin; x += step) {
          const xc = x - cx;
          const X = a * xc - b * yc + tx + px;
          const Y = b * xc + a * yc + ty + py;
          const v = sample(P, X, Y);
          if (Number.isNaN(v)) continue;
          const gx = (sample(P, X + 1, Y) - sample(P, X - 1, Y)) / 2;
          const gy = (sample(P, X, Y + 1) - sample(P, X, Y - 1)) / 2;
          if (Number.isNaN(gx) || Number.isNaN(gy)) continue;
          total++;
          const r = (C.data[y * C.width + x] as number) - v;
          const u = r / c;
          if (u >= 1 || u <= -1) continue;
          const w = (1 - u * u) ** 2;
          used++;
          // ∂(X, Y)/∂(a, b, tx, ty) dotted with the gradient.
          const j0 = gx * xc + gy * yc;
          const j1 = -gx * yc + gy * xc;
          const j = [j0, j1, gx, gy];
          for (let i = 0; i < 4; i++) {
            const ji = j[i] as number;
            g[i] = (g[i] as number) + w * ji * r;
            for (let k = i; k < 4; k++)
              h[i * 4 + k] = (h[i * 4 + k] as number) + w * ji * (j[k] as number);
          }
        }
      }
      for (let i = 0; i < 4; i++) for (let k = 0; k < i; k++) h[i * 4 + k] = h[k * 4 + i] as number;
      agreement = total > 0 ? used / total : 0;
      const d = solve4(h, g);
      if (!d) break;
      a += d[0] as number;
      b += d[1] as number;
      tx += d[2] as number;
      ty += d[3] as number;
      const move = Math.abs(d[2] as number) + Math.abs(d[3] as number);
      const turn = (Math.abs(d[0] as number) + Math.abs(d[1] as number)) * Math.max(cx, cy);
      if (move + turn < 0.01) break;
    }
    if (l > 0) {
      tx *= 2;
      ty *= 2;
    }
  }
  return { motion: { a, b, tx, ty }, agreement };
}

/** p ↦ m1(m2(p)). */
export function compose(m1: Motion, m2: Motion): Motion {
  return {
    a: m1.a * m2.a - m1.b * m2.b,
    b: m1.a * m2.b + m1.b * m2.a,
    tx: m1.a * m2.tx - m1.b * m2.ty + m1.tx,
    ty: m1.b * m2.tx + m1.a * m2.ty + m1.ty,
  };
}

export function invert(m: Motion): Motion {
  const d = m.a * m.a + m.b * m.b;
  const a = m.a / d;
  const b = -m.b / d;
  return { a, b, tx: -(a * m.tx - b * m.ty), ty: -(b * m.tx + a * m.ty) };
}

export function apply(m: Motion, x: number, y: number): [number, number] {
  return [m.a * x - m.b * y + m.tx, m.b * x + m.a * y + m.ty];
}

/** A motion found at one size, in the pixels of another (`k` = new size ÷ analysis size). */
export const rescale = (m: Motion, k: number): Motion => ({ ...m, tx: m.tx * k, ty: m.ty * k });

/**
 * Whether a found motion is believable between neighbouring frames: under a quarter of the picture
 * of shift, 8° of turn, 15% of scale, and most pixels agreeing. Otherwise the pair is treated as
 * still (a cut, a flash, a blank frame) and the path does not jump.
 */
export function plausible(e: Estimate, width: number, height: number): boolean {
  const { a, b, tx, ty } = e.motion;
  const s = Math.hypot(a, b);
  const turn = Math.abs(Math.atan2(b, a));
  return (
    Number.isFinite(s) &&
    e.agreement >= 0.3 &&
    Math.abs(tx) < width / 4 &&
    Math.abs(ty) < height / 4 &&
    turn < (8 * Math.PI) / 180 &&
    s > 0.85 &&
    s < 1.15
  );
}
