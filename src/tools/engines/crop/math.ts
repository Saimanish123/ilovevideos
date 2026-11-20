/**
 * Pure geometry for the crop and aspect-ratio engines. Unit-tested; no browser APIs.
 * All rectangles are in source display pixels (after any rotation flag is applied), the same space
 * mediabunny's `crop` and ffmpeg's `crop=` filter work in. Every output edge is even: H.264 with
 * 4:2:0 chroma needs even width and height, and even offsets keep the chroma planes aligned.
 */
import { shellQuote } from "@/lib/format";
import { ffmpegSoundEncoder } from "../sound-codec";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}

// The preset shapes live in ./ratio.ts so a page's first load can name them without this module.
export { type FixedRatioId, fixedRatioIds, type RatioId, ratioIds, ratioValue } from "./ratio";

/** Smallest crop edge, in source pixels. Below this the frame is not useful and handles overlap. */
export const MIN_EDGE = 16;

/** Nearest even integer, never below 2. */
export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** Nearest even integer at or below n (for sizes that must not exceed a bound), never below 2. */
export const evenFloor = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
/** Even position at or below n, never below 0 (offsets may be zero; sizes may not). */
export const evenDown = (n: number) => Math.max(0, Math.floor(n / 2) * 2);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/**
 * Codecs whose encoders take only even edges. H.264 and HEVC store 4:2:0 chroma at half size in
 * both directions; Chromium's `VideoEncoder.isConfigSupported` refuses H.264 at 641×361, 641×360 or
 * 640×361 and mediabunny refuses odd H.264 and HEVC itself. VP8, VP9 and AV1 encode odd sizes
 * (measured in Chromium 151), so a picture going to them keeps every pixel.
 */
export const needsEvenEdges = (codec: string) => codec === "avc" || codec === "hevc";

/**
 * The size a re-encode writes from a picture of `src` (ADR-0060): an odd edge loses its last column
 * or row for H.264 and HEVC. Nothing is scaled, so every kept pixel is the source's own and the
 * picture sits where the preview shows it; the crop tools' frame is bounded the same way.
 */
export function encodedSize(src: Size, codec = "avc"): Size {
  if (!needsEvenEdges(codec)) return { width: src.width, height: src.height };
  return { width: evenFloor(src.width), height: evenFloor(src.height) };
}

/** True when the re-encode cuts an odd edge (the output is one pixel narrower or shorter). */
export const cutsOddEdge = (src: Size, codec = "avc") => {
  const e = encodedSize(src, codec);
  return e.width !== src.width || e.height !== src.height;
};

/** ffmpeg's filter for the same cut ("crop=640:360:0:0"), or "" when the size is kept. */
export function evenCropFilter(src: Size, codec = "avc"): string {
  if (!cutsOddEdge(src, codec)) return "";
  const e = encodedSize(src, codec);
  return `crop=${e.width}:${e.height}:0:0`;
}

/** `filter` with the even cut in front, for a `-vf` chain. */
export const withEvenCrop = (src: Size, filter: string, codec = "avc") => {
  const cut = evenCropFilter(src, codec);
  return cut ? (filter ? `${cut},${filter}` : cut) : filter;
};

/** Which edge an even cut removes: "last column", "last row" or "last column and row". */
export function oddEdgeWords(src: Size): string {
  const w = src.width % 2 === 1;
  const h = src.height % 2 === 1;
  return w && h ? "last column and row" : w ? "last column" : h ? "last row" : "";
}

/** A filter graph whose output is labelled `[v]`, with the even cut as its last step. */
export function withEvenCropOut(src: Size, graph: string, codec = "avc"): string {
  const cut = evenCropFilter(src, codec);
  if (!cut || !graph.endsWith("[v]")) return graph;
  return `${graph.slice(0, -3)},${cut}[v]`;
}

/** "641×361 becomes 640×360: H.264 needs even edges." or "" when the size is kept. */
export function evenSizeNote(src: Size, codec = "avc"): string {
  if (!cutsOddEdge(src, codec)) return "";
  const e = encodedSize(src, codec);
  return `${src.width}×${src.height} becomes ${e.width}×${e.height}: ${codec === "hevc" ? "HEVC" : "H.264"} needs even edges.`;
}

export const fullRect = (src: Size): Rect => ({
  x: 0,
  y: 0,
  width: evenFloor(src.width),
  height: evenFloor(src.height),
});

/** True when the rectangle keeps the whole picture (nothing to crop). */
export function isFullFrame(r: Rect, src: Size): boolean {
  const f = fullRect(src);
  return r.x <= 0 && r.y <= 0 && r.width >= f.width && r.height >= f.height;
}

/** Snaps a rectangle to even values inside the source, keeping at least MIN_EDGE on each side. */
export function normalizeRect(r: Rect, src: Size): Rect {
  const maxW = evenFloor(src.width);
  const maxH = evenFloor(src.height);
  const width = clamp(even(r.width), Math.min(MIN_EDGE, maxW), maxW);
  const height = clamp(even(r.height), Math.min(MIN_EDGE, maxH), maxH);
  return {
    x: clamp(evenDown(r.x), 0, maxW - width),
    y: clamp(evenDown(r.y), 0, maxH - height),
    width,
    height,
  };
}

/**
 * The largest rectangle of the given shape that fits in the source, placed by `anchor` (0 = left or
 * top, 0.5 = centred, 1 = right or bottom) along the axis that has room to move.
 */
export function largestRect(src: Size, ratio: number, anchor = { x: 0.5, y: 0.5 }): Rect {
  const maxW = evenFloor(src.width);
  const maxH = evenFloor(src.height);
  let width = maxW;
  let height = evenFloor(maxW / ratio);
  if (height > maxH) {
    height = maxH;
    width = evenFloor(maxH * ratio);
  }
  return {
    x: evenDown((maxW - width) * clamp(anchor.x, 0, 1)),
    y: evenDown((maxH - height) * clamp(anchor.y, 0, 1)),
    width,
    height,
  };
}

/** The largest rectangle of `ratio` centred on the centre of `around`, clamped into the source. */
export function refitToRatio(around: Rect, src: Size, ratio: number): Rect {
  const r = largestRect(src, ratio);
  const cx = around.x + around.width / 2;
  const cy = around.y + around.height / 2;
  return {
    ...r,
    x: clamp(evenDown(cx - r.width / 2), 0, evenFloor(src.width) - r.width),
    y: clamp(evenDown(cy - r.height / 2), 0, evenFloor(src.height) - r.height),
  };
}

/** Position of a rectangle within its free travel, 0–1 per axis (0.5 when it cannot move). */
export function anchorOf(r: Rect, src: Size): { x: number; y: number } {
  const freeX = evenFloor(src.width) - r.width;
  const freeY = evenFloor(src.height) - r.height;
  return {
    x: freeX > 0 ? clamp(r.x / freeX, 0, 1) : 0.5,
    y: freeY > 0 ? clamp(r.y / freeY, 0, 1) : 0.5,
  };
}

export function moveRect(start: Rect, dx: number, dy: number, src: Size): Rect {
  return {
    ...start,
    x: clamp(evenDown(start.x + dx), 0, evenFloor(src.width) - start.width),
    y: clamp(evenDown(start.y + dy), 0, evenFloor(src.height) - start.height),
  };
}

/** Which part of the frame is being dragged. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const handles: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Resizes from a handle by a pointer delta measured from the start of the drag (not incremental, so
 * rounding never drifts). With a ratio lock, a corner keeps the opposite corner fixed and an edge
 * keeps the centre line of the other axis fixed.
 */
export function resizeRect(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  src: Size,
  ratio: number | null,
): Rect {
  const W = evenFloor(src.width);
  const H = evenFloor(src.height);
  const min = Math.min(MIN_EDGE, W, H);
  const left = start.x;
  const top = start.y;
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const hasW = handle.includes("w");
  const hasE = handle.includes("e");
  const hasN = handle.includes("n");
  const hasS = handle.includes("s");

  if (ratio === null) {
    let x0 = left;
    let x1 = right;
    let y0 = top;
    let y1 = bottom;
    if (hasW) x0 = clamp(left + dx, 0, right - min);
    if (hasE) x1 = clamp(right + dx, left + min, W);
    if (hasN) y0 = clamp(top + dy, 0, bottom - min);
    if (hasS) y1 = clamp(bottom + dy, top + min, H);
    // Round the moving edges only, so the fixed edges stay exactly where they were.
    const nx0 = hasW ? evenDown(x0) : x0;
    const ny0 = hasN ? evenDown(y0) : y0;
    const nx1 = hasE ? Math.min(W, nx0 + even(x1 - nx0)) : x1;
    const ny1 = hasS ? Math.min(H, ny0 + even(y1 - ny0)) : y1;
    return normalizeRect({ x: nx0, y: ny0, width: nx1 - nx0, height: ny1 - ny0 }, src);
  }

  const minW = Math.max(min, min * ratio);
  let width: number;
  let x: number;
  let y: number;
  if ((hasE || hasW) && (hasN || hasS)) {
    // Corner: follow whichever axis moved further (in width units), keep the opposite corner.
    const w1 = start.width + (hasE ? dx : -dx);
    const w2 = (start.height + (hasS ? dy : -dy)) * ratio;
    width = Math.abs(w1 - start.width) >= Math.abs(w2 - start.width) ? w1 : w2;
    const roomW = hasE ? W - left : right;
    const roomH = (hasS ? H - top : bottom) * ratio;
    width = clamp(width, minW, Math.min(roomW, roomH));
    const height = width / ratio;
    x = hasE ? left : right - width;
    y = hasS ? top : bottom - height;
  } else if (hasE || hasW) {
    const cy = top + start.height / 2;
    width = start.width + (hasE ? dx : -dx);
    const roomW = hasE ? W - left : right;
    const roomH = 2 * Math.min(cy, H - cy) * ratio;
    width = clamp(width, minW, Math.min(roomW, roomH));
    x = hasE ? left : right - width;
    y = cy - width / ratio / 2;
  } else {
    const cx = left + start.width / 2;
    const h = start.height + (hasS ? dy : -dy);
    const roomH = hasS ? H - top : bottom;
    const roomW = 2 * Math.min(cx, W - cx);
    width = clamp(h * ratio, minW, Math.min(roomH * ratio, roomW));
    x = cx - width / 2;
    y = hasS ? top : bottom - width / ratio;
  }
  const w = evenFloor(width);
  const h = evenFloor(w / ratio);
  // Keep the anchored side where it was after rounding.
  const nx = hasW ? right - w : hasE ? left : x + (width - w) / 2;
  const ny = hasN ? bottom - h : hasS ? top : y + (width / ratio - h) / 2;
  return {
    x: clamp(evenDown(nx), 0, W - w),
    y: clamp(evenDown(ny), 0, H - h),
    width: w,
    height: h,
  };
}

/** Grows or shrinks the rectangle around its centre by `factor`, keeping its shape. Keyboard +/−. */
export function scaleRect(r: Rect, factor: number, src: Size, ratio: number | null): Rect {
  const shape = ratio ?? r.width / r.height;
  const W = evenFloor(src.width);
  const H = evenFloor(src.height);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  let width = clamp(r.width * factor, Math.max(MIN_EDGE, MIN_EDGE * shape), Math.min(W, H * shape));
  width = evenFloor(width);
  const height = evenFloor(width / shape);
  return {
    x: clamp(evenDown(cx - width / 2), 0, W - width),
    y: clamp(evenDown(cy - height / 2), 0, H - height),
    width,
    height,
  };
}

/** Share of the source picture the crop keeps, 0–1. */
export const keptShare = (r: Rect, src: Size) =>
  src.width > 0 && src.height > 0 ? (r.width * r.height) / (src.width * src.height) : 1;

/** True when the source already has this shape (within 1%), so an aspect change would do nothing. */
export const hasRatio = (src: Size, ratio: number) =>
  src.height > 0 && Math.abs(src.width / src.height / ratio - 1) < 0.01;

export interface PadLayout {
  /** Output frame. */
  width: number;
  height: number;
  /** Where the scaled source sits inside the output frame. */
  inner: Rect;
}

/**
 * Fit (letterbox or pillarbox) to a shape. The output's long side equals the source's long side, so
 * the file never grows past the source resolution and stays within encoder limits; the source is
 * scaled down only when the new shape is narrower along its long side (a 1920×1080 clip in a 9:16
 * frame becomes 1080×608 inside 1080×1920).
 */
export function padLayout(src: Size, ratio: number): PadLayout {
  const long = evenFloor(Math.max(src.width, src.height));
  const width = ratio >= 1 ? long : evenFloor(long * ratio);
  const height = ratio >= 1 ? evenFloor(long / ratio) : long;
  const scale = Math.min(width / src.width, height / src.height, 1);
  const iw = Math.min(width, even(src.width * scale));
  const ih = Math.min(height, even(src.height * scale));
  return {
    width,
    height,
    inner: {
      x: evenDown((width - iw) / 2),
      y: evenDown((height - ih) / 2),
      width: iw,
      height: ih,
    },
  };
}

/**
 * The same layout shrunk so the frame is at most `cap` (a platform's size ceiling). Never enlarges.
 * Edges and offsets stay even.
 */
export function capLayout(layout: PadLayout, cap: Size): PadLayout {
  const k = Math.min(cap.width / layout.width, cap.height / layout.height, 1);
  if (k >= 1) return layout;
  const width = evenFloor(layout.width * k);
  const height = evenFloor(layout.height * k);
  const iw = Math.min(width, even(layout.inner.width * k));
  const ih = Math.min(height, even(layout.inner.height * k));
  return {
    width,
    height,
    inner: { x: evenDown((width - iw) / 2), y: evenDown((height - ih) / 2), width: iw, height: ih },
  };
}

/**
 * What fills the space around the picture: a named colour, any `#rrggbb` colour, or `blur` (the
 * picture itself, scaled to cover the frame, blurred and dimmed a little).
 */
export type PadColor = "black" | "white" | "blur" | `#${string}`;

export const isHexColor = (c: string): c is `#${string}` => /^#[0-9a-f]{6}$/i.test(c);

/** How much the blurred background is darkened, so the sharp picture stands out (0–1). */
export const BLUR_DIM = 0.2;

/** Box-blur radius for the blurred background: a fortieth of the frame's short side, at least 2. */
export const blurRadius = (frame: Size) =>
  Math.max(2, Math.round(Math.min(frame.width, frame.height) / 40));

/** ffmpeg `crop=` filter for a rectangle: w:h:x:y. */
export const cropFilter = (r: Rect) => `crop=${r.width}:${r.height}:${r.x}:${r.y}`;

/**
 * True when the picture goes into the frame at its own size less an odd edge (641×361 drawn as
 * 640×360): it is cut, not scaled, so every pixel stays the source's (`encodedSize`).
 */
export const innerCutsOddEdge = (inner: Size, src: Size) =>
  cutsOddEdge(src) &&
  inner.width === evenFloor(src.width) &&
  inner.height === evenFloor(src.height);

/** ffmpeg filter chain for a pad layout: scale the picture, then pad it onto the coloured frame. */
export function padFilter(layout: PadLayout, src: Size, color: PadColor): string {
  const { inner } = layout;
  const fit = innerCutsOddEdge(inner, src)
    ? `crop=${inner.width}:${inner.height}:0:0`
    : `scale=${inner.width}:${inner.height}`;
  if (color === "blur") {
    // The picture twice: once scaled to cover the frame, blurred and dimmed; once on top at its place.
    const r = blurRadius(layout);
    const k = (1 - BLUR_DIM).toFixed(2);
    return `split[bg][fg];[bg]scale=${layout.width}:${layout.height}:force_original_aspect_ratio=increase,crop=${layout.width}:${layout.height},boxblur=${r}:2,colorchannelmixer=rr=${k}:gg=${k}:bb=${k}[b];[fg]${fit}[f];[b][f]overlay=${inner.x}:${inner.y}`;
  }
  const scale = inner.width === src.width && inner.height === src.height ? "" : `${fit},`;
  const fill = isHexColor(color) ? `0x${color.slice(1).toUpperCase()}` : color;
  return `${scale}pad=${layout.width}:${layout.height}:${inner.x}:${inner.y}:color=${fill}`;
}

/** The command that reproduces a crop or pad run, as shown on the result card. */
export function geometryCommand(
  inputName: string,
  outputName: string,
  filter: string,
  videoKbps: number,
  copyAudio: boolean,
  /** Keep only the first `end` seconds. */
  end?: number,
  /** The codec an encoded sound is written in (../sound-codec `writtenSoundCodec`). */
  codec = "aac",
): string {
  const audio = copyAudio
    ? "-c:a copy"
    : `-c:a ${ffmpegSoundEncoder(codec)}${codec === "pcm-s16" ? "" : " -b:a 128k"}`;
  const t = end !== undefined ? ` -t ${end}` : "";
  // Filter graphs with labels or quotes need quoting in a shell.
  const vf = /[[\];'\s]/.test(filter) ? `"${filter}"` : filter;
  return `ffmpeg -i ${shellQuote(inputName)}${t} -vf ${vf} -c:v libx264 -b:v ${videoKbps}k -pix_fmt yuv420p ${audio} -movflags +faststart ${shellQuote(outputName)}`;
}
