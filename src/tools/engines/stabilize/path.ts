/**
 * From the motion between neighbouring frames to the warp that steadies each one: the camera's
 * path (every frame placed relative to the first), smoothed with a Gaussian, then held inside the
 * picture so the steadied frame never shows an empty edge (zoom to fill) or left as it is (borders).
 * Pure; shared by the engine and the unit tests.
 *
 * A path entry maps a centred point of frame k to frame 0. The warp for frame k maps a centred
 * output point q to the point of frame k to show there: p = W·(q / zoom), where W = C⁻¹ ∘ S (the
 * camera's real placement undone, the smoothed one applied).
 */
import { compose, IDENTITY, invert, type Motion } from "./motion";

interface Params {
  x: number;
  y: number;
  /** Turn, radians. */
  th: number;
  /** Log of the scale. */
  ls: number;
}

const toParams = (m: Motion): Params => ({
  x: m.tx,
  y: m.ty,
  th: Math.atan2(m.b, m.a),
  ls: Math.log(Math.hypot(m.a, m.b)),
});

const fromParams = (p: Params): Motion => {
  const s = Math.exp(p.ls);
  return { a: s * Math.cos(p.th), b: s * Math.sin(p.th), tx: p.x, ty: p.y };
};

/** Each frame placed relative to the first: C₀ = identity, Cₖ = Cₖ₋₁ ∘ Mₖ (Mₖ maps k to k − 1). */
export function cameraPath(motions: Motion[]): Motion[] {
  const path: Motion[] = [];
  let c = IDENTITY;
  for (let k = 0; k < motions.length; k++) {
    if (k > 0) c = compose(c, motions[k] as Motion);
    path.push(c);
  }
  return path;
}

/**
 * Gaussian smoothing of one series with odd reflection at both ends (x₋ⱼ = 2x₀ − xⱼ), so a steady
 * pan stays a steady pan up to the first and last frame instead of easing to a stop.
 */
export function smoothSeries(v: number[], sigma: number): number[] {
  const n = v.length;
  if (n === 0 || sigma <= 0) return v.slice();
  const r = Math.max(1, Math.ceil(3 * sigma));
  const kernel: number[] = [];
  for (let j = -r; j <= r; j++) kernel.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  const at = (i: number): number => {
    if (n === 1) return v[0] as number;
    if (i < 0) {
      const m = Math.min(-i, n - 1);
      return 2 * (v[0] as number) - (v[m] as number);
    }
    if (i >= n) {
      const m = Math.max(2 * (n - 1) - i, 0);
      return 2 * (v[n - 1] as number) - (v[m] as number);
    }
    return v[i] as number;
  };
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let w = 0;
    for (let j = -r; j <= r; j++) {
      const k = kernel[j + r] as number;
      s += k * at(i + j);
      w += k;
    }
    out[i] = s / w;
  }
  return out;
}

function smoothParams(p: Params[], sigma: number): Params[] {
  const xs = smoothSeries(
    p.map((q) => q.x),
    sigma,
  );
  const ys = smoothSeries(
    p.map((q) => q.y),
    sigma,
  );
  const ths = smoothSeries(
    p.map((q) => q.th),
    sigma,
  );
  const lss = smoothSeries(
    p.map((q) => q.ls),
    sigma,
  );
  return p.map((_, i) => ({
    x: xs[i] as number,
    y: ys[i] as number,
    th: ths[i] as number,
    ls: lss[i] as number,
  }));
}

/**
 * The smallest zoom at which the warped frame covers the whole output: every output corner, taken
 * through `w` after dividing by the zoom, must land inside the source (centred, half sizes `hw`,
 * `hh`). Infinity when no zoom can (the warp shifts the centre off the picture).
 */
export function zoomNeeded(w: Motion, hw: number, hh: number): number {
  let z = 1;
  for (const [qx, qy] of [
    [-hw, -hh],
    [hw, -hh],
    [-hw, hh],
    [hw, hh],
  ] as const) {
    // p = A·q / z + t, with A·q:
    const ax = w.a * qx - w.b * qy;
    const ay = w.b * qx + w.a * qy;
    for (const [aq, t, half] of [
      [ax, w.tx, hw],
      [ay, w.ty, hh],
    ] as const) {
      if (aq > 0) {
        const room = half - t;
        if (room <= 0) return Number.POSITIVE_INFINITY;
        z = Math.max(z, aq / room);
      } else if (aq < 0) {
        const room = half + t;
        if (room <= 0) return Number.POSITIVE_INFINITY;
        z = Math.max(z, -aq / room);
      }
    }
  }
  return z;
}

export interface PathPlan {
  /** Per frame: output point (centred, divided by `zoom`) → source point (centred). */
  warps: Motion[];
  /** The zoom applied to every frame (1 with borders: the uncovered edges show). */
  zoom: number;
  /** Share of frames whose correction had to be cut back to stay inside the picture. */
  limited: number;
}

export interface PathOptions {
  /** Smoothing width, in frames (the Gaussian's sigma). */
  sigma: number;
  /**
   * The most the correction may uncover, as the zoom that would hide it: the steadied path is held
   * so no frame needs more. With `fill` the picture is enlarged by what the path needs (up to this);
   * without, it keeps its size and the uncovered edges show as borders.
   */
  maxZoom: number;
  fill: boolean;
  /** Half the analysed picture's width and height (centred coordinates). */
  hw: number;
  hh: number;
}

const blend = (c: Params, s: Params, t: number): Params => ({
  x: c.x + (s.x - c.x) * t,
  y: c.y + (s.y - c.y) * t,
  th: c.th + (s.th - c.th) * t,
  ls: c.ls + (s.ls - c.ls) * t,
});

const warpOf = (camera: Motion, smooth: Params): Motion =>
  compose(invert(camera), fromParams(smooth));

/**
 * The largest share t (0–1) of the smoothing that keeps frame k covered at `zoom`: t = 1 is the
 * smooth path, t = 0 the camera's own (no correction, always covered).
 */
function coveredShare(camera: Motion, c: Params, s: Params, zoom: number, o: PathOptions): number {
  if (zoomNeeded(warpOf(camera, s), o.hw, o.hh) <= zoom) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (zoomNeeded(warpOf(camera, blend(c, s, mid)), o.hw, o.hh) <= zoom) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function planPath(motions: Motion[], o: PathOptions): PathPlan {
  const camera = cameraPath(motions);
  const c = camera.map(toParams);
  let s = smoothParams(c, o.sigma);
  // The zoom the path is held to: what the smooth path needs, up to the limit.
  let need = 1;
  for (let i = 0; i < camera.length; i++)
    need = Math.max(need, zoomNeeded(warpOf(camera[i] as Motion, s[i] as Params), o.hw, o.hh));
  const zoom = Math.min(o.maxZoom, need);
  // Where the smooth path asks for more, pull it towards the camera's, then smooth the pulled path
  // again (a narrower window) so the pull is spread over neighbouring frames, a few times over.
  for (let round = 0; round < 4; round++) {
    const pulled = c.map((ci, i) => {
      const si = s[i] as Params;
      const t = coveredShare(camera[i] as Motion, ci, si, zoom, o);
      return t >= 1 ? si : blend(ci, si, t);
    });
    s = smoothParams(pulled, Math.max(1, o.sigma / 3));
  }
  // Last, a hard limit without smoothing: no frame shows an edge.
  let limited = 0;
  const warps = camera.map((m, i) => {
    const ci = c[i] as Params;
    const si = s[i] as Params;
    const t = coveredShare(m, ci, si, zoom, o);
    if (t < 0.999) limited++;
    return warpOf(m, t >= 1 ? si : blend(ci, si, t));
  });
  return { warps, zoom: o.fill ? zoom : 1, limited: camera.length ? limited / camera.length : 0 };
}
