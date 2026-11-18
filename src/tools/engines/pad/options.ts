/**
 * Border options and the layout they resolve to. Pure; shared by the worker engine, the ffmpeg
 * runner and the panel. A border is the aspect-ratio engine's pad without a target shape: the same
 * geometry runner (../crop/native, ADR-0015) draws the picture onto a larger (or same-size) frame.
 */
import { z } from "zod";
import { formatDimensions } from "@/lib/format";
import {
  cutsOddEdge,
  even,
  evenDown,
  evenFloor,
  oddEdgeWords,
  type PadColor,
  type PadLayout,
  type Size,
} from "../crop/math";
import type { GeometryPlan } from "../crop/plan";
import type { MediaInfo } from "../types";

export const borderColors = ["white", "black"] as const;

export const PadOptions = z.object({
  /** Border on each edge as a share of the picture's short side (0.05 = 5%). */
  size: z.number().min(0.005).max(0.25).default(0.05),
  /** Exact border on each edge in pixels; overrides `size` when set. */
  px: z.number().int().min(2).max(2000).optional(),
  /** "white", "black" or "#rrggbb". */
  color: z
    .string()
    .regex(/^(white|black|#[0-9a-fA-F]{6})$/)
    .default("white"),
  /** Keep the frame size (the picture shrinks inside the border) instead of growing the frame. */
  keepSize: z.boolean().default(false),
});
export type PadOptions = z.infer<typeof PadOptions>;

export const borderPresets = [
  { value: "0.02", label: "Thin", size: 0.02 },
  { value: "0.05", label: "Medium", size: 0.05 },
  { value: "0.1", label: "Thick", size: 0.1 },
] as const;

/** Border width in pixels on each edge for this picture (even, at least 2). */
export function borderPx(o: Pick<PadOptions, "size" | "px">, src: Size): number {
  const short = Math.min(src.width, src.height);
  return even(o.px ?? Math.round(o.size * short));
}

/**
 * The output frame and where the picture sits in it. Growing: the frame is the picture plus the
 * border on every edge. Keeping the size: the frame stays the picture's size and the picture is
 * scaled down, keeping its shape, to leave at least the border on every edge.
 */
export function borderLayout(o: PadOptions, src: Size): PadLayout {
  const b = borderPx(o, src);
  const w = evenFloor(src.width);
  const h = evenFloor(src.height);
  if (!o.keepSize) {
    return { width: w + 2 * b, height: h + 2 * b, inner: { x: b, y: b, width: w, height: h } };
  }
  const k = Math.min((w - 2 * b) / w, (h - 2 * b) / h);
  const iw = Math.max(2, evenFloor(w * k));
  const ih = Math.max(2, evenFloor(h * k));
  return {
    width: w,
    height: h,
    inner: { x: evenDown((w - iw) / 2), y: evenDown((h - ih) / 2), width: iw, height: ih },
  };
}

/** A border that leaves no picture inside the frame is not a border. */
export const borderTooThick = (o: PadOptions, src: Size) =>
  o.keepSize && borderPx(o, src) * 2 >= Math.min(src.width, src.height) - 16;

/** "white", "black" or the hex code, for the result line. */
export const colorName = (c: string) => (c === "white" || c === "black" ? c : c.toUpperCase());

export function borderPlan(o: PadOptions, info: MediaInfo): GeometryPlan {
  const v = info.video ?? { width: 0, height: 0 };
  return { kind: "pad", layout: borderLayout(o, v), color: o.color as PadColor };
}

/** "640×360 (641×361 less its odd edge)" when H.264 cut the source, else "641×361"-style size. */
function frameWords(src: Size, frame: Size): string {
  const f = formatDimensions(frame.width, frame.height);
  return cutsOddEdge(src)
    ? `${f} (${formatDimensions(src.width, src.height)} less its ${oddEdgeWords(src)})`
    : f;
}

/**
 * The result line's description. "Frame size kept" only when it was: an odd source keeps an even
 * frame one pixel narrower or shorter, and the line says which.
 */
export function borderWhat(o: PadOptions, info: MediaInfo): string {
  const v = info.video ?? { width: 0, height: 0 };
  const what = `${borderPx(o, v)} px ${colorName(o.color)} border`;
  if (!o.keepSize) return what;
  if (!cutsOddEdge(v)) return `${what}, frame size kept`;
  const l = borderLayout(o, v);
  return `${what}, frame kept at ${formatDimensions(l.width, l.height)}: H.264 needs even edges`;
}

/**
 * The plan sentence's first half, for the panel: what happens to the frame and the picture, with
 * the real output size. An odd source is cut by one pixel, never scaled (../crop/math `encodedSize`).
 */
export function borderHow(o: PadOptions, src: Size): string {
  const l = borderLayout(o, src);
  const inner = formatDimensions(l.inner.width, l.inner.height);
  const cut = cutsOddEdge(src);
  if (o.keepSize)
    return cut
      ? `The frame becomes ${frameWords(src, l)}, since H.264 needs even edges, and the picture is scaled to ${inner} inside it`
      : `The frame stays ${formatDimensions(src.width, src.height)} and the picture is scaled to ${inner} inside it`;
  return cut
    ? `The frame grows from ${formatDimensions(src.width, src.height)} to ${formatDimensions(l.width, l.height)}, around the picture less its ${oddEdgeWords(src)} (${inner}), since H.264 needs even edges`
    : `The frame grows from ${formatDimensions(src.width, src.height)} to ${formatDimensions(l.width, l.height)}`;
}

/** The result's detail sentence: what happened to the picture, true for odd sources too. */
export function borderDetail(o: PadOptions, src: Size): string {
  const cut = cutsOddEdge(src);
  if (o.keepSize)
    return cut
      ? `The frame is ${frameWords(src, borderLayout(o, src))}: H.264 needs even edges. The picture is a little smaller inside it.`
      : "The frame kept its size; the picture is a little smaller inside it.";
  return cut
    ? `The picture is unscaled inside a larger frame, less its ${oddEdgeWords(src)}: H.264 needs even edges.`
    : "The picture is untouched inside a larger frame.";
}
