/**
 * Black bars: letterbox (top and bottom), pillarbox (left and right) or both, found from frames
 * sampled through the video. Pure; the page reads the frames (./bars-read) and the crop frame starts
 * on the answer. Unit-tested.
 *
 * A row or column belongs to a bar when almost none of its pixels are brighter than near black
 * (`DARK`: compressed black and analogue noise sit under it). Per frame, each edge's bar is the run
 * of such rows or columns from the edge in. A frame that is dark nearly everywhere (a fade, a night
 * scene) says nothing and is skipped. Across frames, the bar is the size most frames agree on: dark
 * scenes only make a bar look larger and subtitles smaller, each by varying amounts, while a real
 * bar has the same size in every frame: the bar is the size most frames agree on. Frames
 * whose content reaches into that bar (burned-in subtitles, a channel logo) are counted and named,
 * so the page can offer to keep that strip.
 */
import { even, evenDown, normalizeRect, type Rect, type Size } from "./math";

/** Brightness (0–255) at or under which a pixel counts as black. */
export const DARK = 32;
/** A row or column is content when more than this share of its pixels is brighter than `DARK`. */
export const CONTENT_SHARE = 0.01;
/** A frame is skipped when its content box is under this share of the picture in either direction. */
const MIN_CONTENT = 0.2;
/** A line next to the bar is bleed when its mean brightness is under this share of the picture's. */
const BLEED = 0.35;
/** Bars thinner than this (pixels, at the source size) are noise and treated as none. */
export const MIN_BAR = 4;

export interface Edges {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const EDGES = ["top", "bottom", "left", "right"] as const;
export type Edge = (typeof EDGES)[number];

/** One frame's bars, in pixels of the frame given; null when the frame is too dark to tell. */
export function frameBars(rgba: Uint8ClampedArray, width: number, height: number): Edges | null {
  const rowBright = new Uint32Array(height);
  const colBright = new Uint32Array(width);
  const rowSum = new Float64Array(height);
  const colSum = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    let n = 0;
    let sum = 0;
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      const l = 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
      sum += l;
      colSum[x] = (colSum[x] as number) + l;
      if (l > DARK) {
        n++;
        colBright[x] = (colBright[x] as number) + 1;
      }
    }
    rowBright[y] = n;
    rowSum[y] = sum;
  }
  const rowContent = (y: number) => (rowBright[y] as number) > CONTENT_SHARE * width;
  const colContent = (x: number) => (colBright[x] as number) > CONTENT_SHARE * height;
  /**
   * The bar's edge, `run` lines in from the side, moved past up to two lines of bleed: lines the
   * decoder or the canvas mixed with the picture next to them (WebKit draws the last bar row of
   * sample-letterbox at a fifth of the picture's brightness), dark next to the picture 3 lines in.
   */
  const settle = (run: number, mean: (k: number) => number, size: number) => {
    let k = run;
    for (let i = 0; i < 2 && k + 3 < size; i++) {
      const m = mean(k);
      if (m < 2 * DARK && m < BLEED * mean(k + 3)) k++;
      else break;
    }
    return k;
  };
  const rowMean = (y: number) => (rowSum[y] as number) / width;
  const colMean = (x: number) => (colSum[x] as number) / height;
  let top = 0;
  while (top < height && !rowContent(top)) top++;
  let bottom = 0;
  while (bottom < height - top && !rowContent(height - 1 - bottom)) bottom++;
  let left = 0;
  while (left < width && !colContent(left)) left++;
  let right = 0;
  while (right < width - left && !colContent(width - 1 - right)) right++;
  if (top > 0) top = settle(top, rowMean, height);
  if (bottom > 0) bottom = settle(bottom, (k) => rowMean(height - 1 - k), height);
  if (left > 0) left = settle(left, colMean, width);
  if (right > 0) right = settle(right, (k) => colMean(width - 1 - k), width);
  if (height - top - bottom < MIN_CONTENT * height || width - left - right < MIN_CONTENT * width)
    return null;
  return { top, bottom, left, right };
}

export interface BarsResult {
  /** The bars, in source pixels (even, so the crop keeps even offsets). All zero: none found. */
  bars: Edges;
  /** Frames that could be read and were bright enough to tell. */
  frames: number;
  /** Frames sampled in all. */
  sampled: number;
  /**
   * Edges where some frames show content inside the bar (subtitles, a logo): how far in that
   * content reaches (source pixels from the edge, even) and at which sampled times.
   */
  intrusions: Partial<Record<Edge, { keep: number; times: number[] }>>;
}

/**
 * Combines frames' bars (each scaled to source pixels) into one answer. For each edge: the size
 * most frames agree on, then any frame whose own bar is clearly smaller is an intrusion into it.
 */
export function combineBars(frames: { t: number; bars: Edges | null }[], source: Size): BarsResult {
  const readable = frames.filter((f): f is { t: number; bars: Edges } => f.bars !== null);
  const bars: Edges = { top: 0, bottom: 0, left: 0, right: 0 };
  const intrusions: BarsResult["intrusions"] = {};
  if (readable.length === 0) return { bars, frames: 0, sampled: frames.length, intrusions };
  for (const edge of EDGES) {
    // Real bars have one size in every frame; dark scenes read larger and subtitles smaller, each
    // by varying amounts. So the bar is the size most frames agree on within 2 px (ties: smaller).
    const values = readable.map((f) => f.bars[edge]);
    let agreed = 0;
    let best = -1;
    for (const v of values) {
      const n = values.filter((w) => Math.abs(w - v) <= 2).length;
      if (n > best || (n === best && v < agreed)) {
        best = n;
        agreed = Math.min(...values.filter((w) => Math.abs(w - v) <= 2));
      }
    }
    const limit = edge === "top" || edge === "bottom" ? source.height : source.width;
    let bar = agreed < MIN_BAR ? 0 : evenDown(Math.min(agreed, limit * 0.45));
    // Round towards keeping picture: an odd bar gives up its last row to the content side.
    if (bar % 2 === 1) bar -= 1;
    bars[edge] = bar;
    const inside = readable.filter((f) => f.bars[edge] < bar - MIN_BAR);
    if (bar > 0 && inside.length > 0) {
      const reach = Math.min(...inside.map((f) => f.bars[edge]));
      intrusions[edge] = { keep: evenDown(reach), times: inside.map((f) => f.t) };
    }
  }
  return { bars, frames: readable.length, sampled: frames.length, intrusions };
}

/** Scales a frame's bars from the analysed size to the source's (rounded outwards to whole pixels). */
export function scaleBars(b: Edges, from: Size, to: Size): Edges {
  const kx = to.width / from.width;
  const ky = to.height / from.height;
  return {
    top: Math.floor(b.top * ky),
    bottom: Math.floor(b.bottom * ky),
    left: Math.floor(b.left * kx),
    right: Math.floor(b.right * kx),
  };
}

export const hasBars = (b: Edges) => b.top + b.bottom + b.left + b.right > 0;

/** The crop that removes `bars` (optionally keeping some edges' intruding strip), even-sized. */
export function barsRect(bars: Edges, src: Size, keep: Partial<Record<Edge, number>> = {}): Rect {
  const e = (edge: Edge) => Math.min(bars[edge], keep[edge] ?? bars[edge]);
  const x = e("left");
  const y = e("top");
  return normalizeRect(
    {
      x,
      y,
      width: even(src.width - x - e("right")),
      height: even(src.height - y - e("bottom")),
    },
    src,
  );
}

/** "letterbox", "pillarbox" or "letterbox and pillarbox" for the bars found. */
export function barsKind(b: Edges): string {
  const lb = b.top + b.bottom > 0;
  const pb = b.left + b.right > 0;
  return lb && pb ? "bars on all sides" : lb ? "letterbox bars" : pb ? "pillarbox bars" : "no bars";
}

/** Times through the video to sample: `n` evenly between 5% and 95% (fades sit at the ends). */
export function sampleTimes(duration: number, n = 24): number[] {
  if (!(duration > 0)) return [0];
  if (n <= 1) return [duration / 2];
  return Array.from({ length: n }, (_, i) => duration * (0.05 + (0.9 * i) / (n - 1)));
}

export const edgeNames: Record<Edge, string> = {
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
};
