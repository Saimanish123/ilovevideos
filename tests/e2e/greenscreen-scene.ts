/**
 * A synthetic green-screen shot with a known answer, for measuring the green screen tool against
 * local FFmpeg. Pure and deterministic: every frame is a function of its time.
 *
 * - The subject: a "head" (an oval) and "shoulders" (a rounded block) in skin, blue and grey
 *   tones, swaying left and right, with soft edges 3 to 5 px wide and a fringe of thin strands
 *   (hair) at half cover above the head.
 * - The screen: green (60, 170, 70) under uneven light, from 62% of that on the left and top to
 *   112% on the right, with camera noise (±6 levels).
 * - Spill: near the subject's edges its colour takes up to 25% of the screen's green.
 * - The backdrop: a warm gradient with a few bright and dark shapes.
 *
 * `greenFrame(t)` is what the camera saw; `truthFrame(t)` is the same subject, without spill,
 * composited over the backdrop by its true cover. A keyer is as good as its result is close to the
 * truth.
 */

export const W = 640;
export const H = 360;
export const FPS = 30;
export const SECONDS = 3;
export const SCREEN: readonly [number, number, number] = [60, 170, 70];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Deterministic noise in −1..1 for a pixel and frame. */
function noise(x: number, y: number, f: number) {
  let h = (x * 374761393 + y * 668265263 + f * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 0xffff) / 0xffff) * 2 - 1;
}

/** True cover (0..1) of the subject at pixel centre (x, y) at time t. */
export function cover(x: number, y: number, t: number): number {
  const cx = W / 2 + 70 * Math.sin(t * 1.7);
  // Head: an oval 140×170, edge 4 px.
  const hx = (x - cx) / 70;
  const hy = (y - 140) / 85;
  const head = clamp01(((1 - Math.hypot(hx, hy)) * 70) / 4 + 0.5);
  // Shoulders: a block from y 230 down, 300 wide, rounded, edge 5 px.
  const bx = Math.abs(x - cx) - 150;
  const by = 250 - y;
  const d = Math.max(bx, by) > 0 ? Math.hypot(Math.max(bx, 0), Math.max(by, 0)) : Math.max(bx, by);
  const body = clamp01(-(d - 20) / 5 + 0.5);
  // Strands: thin lines at half cover over the top of the head.
  const inBand = y > 40 && y < 70 && Math.abs(x - cx) < 55;
  const strand = inBand && (x + Math.round(y * 0.4)) % 9 === 0 ? 0.5 : 0;
  return Math.max(head, body, strand);
}

/** The subject's own colour at a pixel (no spill). */
function subject(x: number, y: number, t: number): [number, number, number] {
  const cx = W / 2 + 70 * Math.sin(t * 1.7);
  if (y < 225) {
    // Skin with shading, darker hair band on top.
    if (y < 75) return [70, 52, 40];
    const k = 0.85 + 0.15 * Math.cos((x - cx) / 60);
    return [205 * k, 150 * k, 120 * k];
  }
  // Shirt: blue on one side, grey on the other, with a white collar.
  if (y < 245 && Math.abs(x - cx) < 40) return [235, 235, 230];
  return x < cx ? [50, 70, 150] : [128, 128, 132];
}

/** The screen's colour at a pixel, under uneven light. */
function screen(x: number, y: number): [number, number, number] {
  const k = Math.min(1.12, 0.62 + 0.5 * (x / W) + 0.1 * (y / H));
  return [SCREEN[0] * k, SCREEN[1] * k, SCREEN[2] * k];
}

/** The backdrop the subject is put on. */
export function backdrop(x: number, y: number): [number, number, number] {
  const u = x / W;
  const v = y / H;
  let r = 230 - 120 * v;
  let g = 150 + 60 * u - 60 * v;
  let b = 80 + 120 * u * v;
  // A sun, a dark hill and a window.
  if (Math.hypot(x - 520, y - 70) < 40) [r, g, b] = [255, 240, 200];
  if (y > 300 - 40 * Math.sin(u * 3)) [r, g, b] = [40, 50, 40];
  if (x > 40 && x < 120 && y > 60 && y < 160) [r, g, b] = [200, 220, 240];
  return [r, g, b];
}

const px = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** RGB24 bytes of the camera frame at time t (frame index f for the noise). */
export function greenFrame(t: number, f = Math.round(t * FPS)): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = cover(x + 0.5, y + 0.5, t);
      const s = screen(x, y);
      const c = subject(x, y, t);
      // Spill: edges pick up the screen's green, most where the cover is partial.
      const spill = 0.25 * Math.min(1, 4 * a * (1 - a) + (a < 1 ? 0.3 : 0));
      const n = 6 * noise(x, y, f);
      for (let i = 0; i < 3; i++) {
        const fg = (c[i] as number) * (1 - spill) + (s[i] as number) * spill;
        out[(y * W + x) * 3 + i] = px(fg * a + (s[i] as number) * (1 - a) + n);
      }
    }
  return out;
}

/** RGB24 bytes of the right answer at time t: the subject over the backdrop by its cover. */
export function truthFrame(t: number): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = cover(x + 0.5, y + 0.5, t);
      const c = subject(x, y, t);
      const bg = backdrop(x, y);
      for (let i = 0; i < 3; i++)
        out[(y * W + x) * 3 + i] = px((c[i] as number) * a + (bg[i] as number) * (1 - a));
    }
  return out;
}

/** RGB24 bytes of the backdrop. */
export function backdropFrame(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const bg = backdrop(x, y);
      for (let i = 0; i < 3; i++) out[(y * W + x) * 3 + i] = px(bg[i] as number);
    }
  return out;
}

/** Pixels whose true cover is partial or near an edge (within 3 px of a cover change). */
export function edgeMask(t: number): Uint8Array {
  const m = new Uint8Array(W * H);
  const a = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = cover(x + 0.5, y + 0.5, t);
  for (let y = 3; y < H - 3; y++)
    for (let x = 3; x < W - 3; x++) {
      const v = a[y * W + x] as number;
      if (v > 0.02 && v < 0.98) {
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) m[(y + dy) * W + x + dx] = 1;
      }
    }
  return m;
}
