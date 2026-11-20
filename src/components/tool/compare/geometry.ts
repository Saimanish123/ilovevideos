/**
 * Pure layout math for comparing a source with its result on the preview (compare/picture-compare).
 * Everything is in CSS pixels of the preview box, whose origin is its top-left corner. Both videos
 * fill the box with `object-fit: contain`, so a picture sits centred in it; a zoom or a slot is a
 * transform about the box centre (`translate(x, y) scale(scale)`, `transform-origin: center`).
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A transform about the box centre: translate by (x, y), then scale. Identity is { 1, 0, 0 }. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY: View = { scale: 1, x: 0, y: 0 };

/** Where a picture of `media` size sits inside `slot` when contained and centred. */
export function fit(slot: Rect, media: Size): Rect {
  if (media.width <= 0 || media.height <= 0 || slot.width <= 0 || slot.height <= 0)
    return { left: slot.left, top: slot.top, width: 0, height: 0 };
  const s = Math.min(slot.width / media.width, slot.height / media.height);
  const width = media.width * s;
  const height = media.height * s;
  return {
    left: slot.left + (slot.width - width) / 2,
    top: slot.top + (slot.height - height) / 2,
    width,
    height,
  };
}

/** The box itself as a rect. */
export const boxRect = (box: Size): Rect => ({
  left: 0,
  top: 0,
  width: box.width,
  height: box.height,
});

/**
 * Whether two pictures can share one frame for a wipe: the same shape within 1 %. A crop, a new
 * aspect ratio or a quarter turn changes the shape, and a wipe across two framings misleads.
 */
export function sameShape(a: Size, b: Size): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / rb <= 0.01;
}

/**
 * Two slots for a side-by-side compare: left and right, or top and bottom, whichever shows the
 * smaller of the two pictures larger (a portrait crop of a landscape video goes side by side; two
 * wide pictures on a phone stack). `gap` separates them. Before first, after second.
 */
export function sideBySide(
  box: Size,
  before: Size,
  after: Size,
  gap: number,
): { before: Rect; after: Rect; direction: "row" | "column" } {
  const halfW = Math.max(0, (box.width - gap) / 2);
  const halfH = Math.max(0, (box.height - gap) / 2);
  const row = {
    before: fit({ left: 0, top: 0, width: halfW, height: box.height }, before),
    after: fit({ left: halfW + gap, top: 0, width: halfW, height: box.height }, after),
  };
  const column = {
    before: fit({ left: 0, top: 0, width: box.width, height: halfH }, before),
    after: fit({ left: 0, top: halfH + gap, width: box.width, height: halfH }, after),
  };
  const area = (r: Rect) => r.width * r.height;
  const worst = (p: { before: Rect; after: Rect }) => Math.min(area(p.before), area(p.after));
  return worst(column) > worst(row) * 1.0001
    ? { ...column, direction: "column" }
    : { ...row, direction: "row" };
}

/**
 * The transform that moves an element filling the box, whose picture sits at `from`, so that the
 * picture lands on `to` (same shape). Used to place the result in its side-by-side slot without
 * touching layout.
 */
export function placeInto(box: Size, from: Rect, to: Rect): View {
  if (from.width <= 0) return IDENTITY;
  return {
    scale: to.width / from.width,
    x: to.left + to.width / 2 - box.width / 2,
    y: to.top + to.height / 2 - box.height / 2,
  };
}

/** The picture's rect after a view transform (the box centre is the origin). */
export function transformed(box: Size, content: Rect, view: View): Rect {
  const cx = box.width / 2;
  const cy = box.height / 2;
  return {
    left: cx + view.x + (content.left - cx) * view.scale,
    top: cy + view.y + (content.top - cy) * view.scale,
    width: content.width * view.scale,
    height: content.height * view.scale,
  };
}

/** Keeps a zoomed picture covering the box where it is larger than the box, centred where not. */
export function clampView(box: Size, content: Rect, view: View): View {
  const w = content.width * view.scale;
  const h = content.height * view.scale;
  const limit = (size: number, boxSize: number, v: number) => {
    if (size <= boxSize) return 0;
    const m = (size - boxSize) / 2;
    return Math.min(m, Math.max(-m, v));
  };
  return { scale: view.scale, x: limit(w, box.width, view.x), y: limit(h, box.height, view.y) };
}

/**
 * Zooms to `scale` keeping the picture point under `at` (box pixels) where it was, then clamps.
 * The picture is centred in the box before zooming, so the unzoomed view is the identity.
 */
export function zoomAt(box: Size, content: Rect, scale: number, at: { x: number; y: number }) {
  const cx = box.width / 2;
  const cy = box.height / 2;
  return clampView(box, content, {
    scale,
    x: (at.x - cx) * (1 - scale),
    y: (at.y - cy) * (1 - scale),
  });
}

/** The part of the (transformed) picture the box shows. */
export function visible(box: Size, content: Rect, view: View): Rect {
  const r = transformed(box, content, view);
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(box.width, r.left + r.width);
  const bottom = Math.min(box.height, r.top + r.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * The `clip-path: inset()` right edge, in the element's own pixels, that shows an element filling
 * the box (under the same view transform) only left of the box x coordinate `line`.
 */
export function clipRight(box: Size, view: View, line: number): number {
  const cx = box.width / 2;
  const local = cx + (line - cx - view.x) / view.scale;
  return Math.min(box.width, Math.max(0, box.width - local));
}

/** The zoom that shows one video pixel per CSS pixel, or 1 when the picture already fits at that. */
export function actualPixels(content: Rect, media: Size): number {
  if (content.width <= 0) return 1;
  return Math.max(1, media.width / content.width);
}

/** CSS for a view transform. */
export const viewTransform = (v: View) =>
  v.scale === 1 && v.x === 0 && v.y === 0
    ? ""
    : `translate(${v.x.toFixed(2)}px, ${v.y.toFixed(2)}px) scale(${v.scale.toFixed(4)})`;
