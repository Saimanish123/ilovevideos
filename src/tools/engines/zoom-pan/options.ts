/**
 * Zoom and pan: options, the rectangle at any moment and the ffmpeg command, shared by the picture
 * overlay, the live preview, the timeline and the engine so all of them show and write the same
 * rectangle (the ADR-0035 pattern). Pure; safe to import on the page.
 *
 * A key frame is a moment, a zoom factor (1 = the whole picture) and the centre of the view as a
 * share of the picture. The view always has the picture's own shape, so nothing is stretched and
 * the output keeps the source's size. Between two key frames the zoom changes at an even rate on a
 * logarithmic scale (each second multiplies it by the same factor, which reads as steady motion; a
 * straight line on the factor itself would seem to slow down as it closes in) and the centre moves
 * in a straight line. "Smooth" eases both in and out (smoothstep); "Linear" keeps them constant.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";

export const MAX_ZOOM = 8;
export const MAX_KEYS = 30;
export const DEFAULT_END_ZOOM = 1.5;

export const ZoomKey = z.object({
  /** Page time, seconds from the file's start. */
  t: z.number().min(0),
  /** Centre of the view, 0–1 across and down the picture. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(1).max(MAX_ZOOM),
});
export type ZoomKey = z.infer<typeof ZoomKey>;

export const ZoomOptions = z.object({
  keys: z.array(ZoomKey).min(1, "Add a key frame first.").max(MAX_KEYS),
  ease: z.enum(["smooth", "linear"]).default("smooth"),
  /** Page-only: what the preview shows (the frame with the view drawn on it, or the result). */
  view: z.enum(["frame", "result"]).optional(),
});
export type ZoomOptions = z.infer<typeof ZoomOptions>;

export interface Size {
  width: number;
  height: number;
}
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const sortKeys = (keys: readonly ZoomKey[]) => [...keys].sort((a, b) => a.t - b.t);

const smoothstep = (u: number) => u * u * (3 - 2 * u);

/** The centre kept far enough from the edges that a view of this zoom stays inside the picture. */
export function clampKey(k: ZoomKey): ZoomKey {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, k.zoom));
  const half = 0.5 / zoom;
  return {
    t: Math.max(0, k.t),
    zoom,
    x: Math.min(1 - half, Math.max(half, k.x)),
    y: Math.min(1 - half, Math.max(half, k.y)),
  };
}

/** Zoom and centre at page time `t` (before the first key and after the last, they hold). */
export function viewAt(
  keys: readonly ZoomKey[],
  t: number,
  ease: ZoomOptions["ease"],
): { zoom: number; x: number; y: number } {
  const ks = sortKeys(keys);
  const first = ks[0];
  if (!first) return { zoom: 1, x: 0.5, y: 0.5 };
  if (t <= first.t || ks.length === 1) return clampKey(first);
  for (let i = 1; i < ks.length; i++) {
    const b = ks[i] as ZoomKey;
    if (t > b.t) continue;
    const a = ks[i - 1] as ZoomKey;
    const span = b.t - a.t;
    const u = span > 1e-9 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1;
    const e = ease === "smooth" ? smoothstep(u) : u;
    const ca = clampKey(a);
    const cb = clampKey(b);
    const zoom = Math.exp(Math.log(ca.zoom) + (Math.log(cb.zoom) - Math.log(ca.zoom)) * e);
    return clampKey({ t, zoom, x: ca.x + (cb.x - ca.x) * e, y: ca.y + (cb.y - ca.y) * e });
  }
  return clampKey(ks[ks.length - 1] as ZoomKey);
}

/** The view at `t` as a rectangle of the picture, in its pixels (fractional; drawn with filtering). */
export function rectAt(
  keys: readonly ZoomKey[],
  t: number,
  ease: ZoomOptions["ease"],
  size: Size,
): ViewRect {
  const v = viewAt(keys, t, ease);
  const width = size.width / v.zoom;
  const height = size.height / v.zoom;
  return { x: v.x * size.width - width / 2, y: v.y * size.height - height / 2, width, height };
}

/** A key frame's rectangle, and back: for the frame drawn on the preview. */
export function keyRect(k: ZoomKey, size: Size): ViewRect {
  const c = clampKey(k);
  const width = size.width / c.zoom;
  const height = size.height / c.zoom;
  return { x: c.x * size.width - width / 2, y: c.y * size.height - height / 2, width, height };
}
export function keyFromRect(t: number, r: ViewRect, size: Size): ZoomKey {
  const zoom = size.width / Math.max(1, r.width);
  return clampKey({
    t,
    zoom,
    x: (r.x + r.width / 2) / size.width,
    y: (r.y + r.height / 2) / size.height,
  });
}

/** The deepest zoom over the whole clip (at a key frame, since the zoom between them is monotone). */
export const deepestZoom = (keys: readonly ZoomKey[]) =>
  keys.reduce((m, k) => Math.max(m, clampKey(k).zoom), 1);

/** Source lines left at a zoom: what the output shows of the picture's own detail. */
export const linesOfDetail = (height: number, zoom: number) => Math.round(height / zoom);

/** True when nothing moves: every key at 1× (the output would equal the source). */
export const zoomIsNoop = (keys: readonly ZoomKey[]) =>
  keys.every((k) => Math.abs(clampKey(k).zoom - 1) < 1e-3);

const num = (n: number) => Number(n.toFixed(4)).toString();

/**
 * One ffmpeg expression in `t` for a key-framed value: holds before the first and after the last
 * key, and in between moves from key to key as `viewAt` does (log scale for the zoom).
 */
function piecewise(
  ks: readonly ZoomKey[],
  value: (k: ZoomKey) => number,
  ease: ZoomOptions["ease"],
  log: boolean,
): string {
  const f = (k: ZoomKey) => (log ? Math.log(value(k)) : value(k));
  const wrap = (e: string) => (log ? `exp(${e})` : e);
  const last = ks[ks.length - 1] as ZoomKey;
  let expr = wrap(num(f(last)));
  for (let i = ks.length - 1; i >= 1; i--) {
    const a = ks[i - 1] as ZoomKey;
    const b = ks[i] as ZoomKey;
    const span = Math.max(1e-6, b.t - a.t);
    const u = `clip((t-${num(a.t)})/${num(span)},0,1)`;
    const e = ease === "smooth" ? `(${u}*${u}*(3-2*${u}))` : u;
    const seg = wrap(`${num(f(a))}+${num(f(b) - f(a))}*${e}`);
    expr = `if(lt(t,${num(b.t)}),${seg},${expr})`;
  }
  const first = ks[0] as ZoomKey;
  return ks.length > 1 ? `if(lt(t,${num(first.t)}),${wrap(num(f(first)))},${expr})` : expr;
}

/**
 * The command that makes the same picture: each frame scaled up by the zoom at its time (`eval=frame`)
 * and cut back to the source's size around the centre. Sound copied.
 */
export function zoomCommand(o: {
  input: string;
  output: string;
  keys: readonly ZoomKey[];
  ease: ZoomOptions["ease"];
  size: Size;
  kbps: number;
  sound: "copy" | "encode" | "none";
}): string {
  const ks = sortKeys(o.keys).map(clampKey);
  const zExpr = piecewise(ks, (k) => k.zoom, o.ease, true);
  const xExpr = piecewise(ks, (k) => k.x, o.ease, false);
  const yExpr = piecewise(ks, (k) => k.y, o.ease, false);
  const { width: W, height: H } = o.size;
  // crop's iw and ih keep the first frame's size when scale changes it per frame, so the scaled
  // size is written out from the zoom expression instead.
  const vf = `scale=w='${W}*${zExpr}':h='${H}*${zExpr}':eval=frame:flags=lanczos,crop=${W}:${H}:x='clip(${W}*${zExpr}*${xExpr}-${W}/2,0,${W}*${zExpr}-${W})':y='clip(${H}*${zExpr}*${yExpr}-${H}/2,0,${H}*${zExpr}-${H})'`;
  const a = o.sound === "none" ? "-an" : o.sound === "copy" ? "-c:a copy" : "-c:a aac -b:a 128k";
  return `ffmpeg -i ${shellQuote(o.input)} -vf "${vf}" -c:v libx264 -b:v ${o.kbps}k -pix_fmt yuv420p ${a} -movflags +faststart ${shellQuote(o.output)}`;
}
