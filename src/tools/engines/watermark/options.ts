/**
 * Watermark options and the geometry every path shares: where the mark sits and how big it is, in
 * pixels of the picture as it plays. Pure; used by the panel, the preview overlay, the worker engine
 * and the ffmpeg runner, so all four agree to the pixel.
 *
 * The mark reaches the engine as a PNG already drawn at its final size (`mark`): the page rasterises
 * the logo (PNG, JPEG, WebP or SVG) or the typed text with its own fonts, so the worker needs no SVG
 * decoder or font and the ffmpeg path gets the same pixels.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { EngineError } from "../errors";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";

export const anchors = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
export type Anchor = (typeof anchors)[number];

export const anchorNames: Record<Anchor, string> = {
  tl: "Top left",
  tc: "Top centre",
  tr: "Top right",
  ml: "Middle left",
  mc: "Centre",
  mr: "Middle right",
  bl: "Bottom left",
  bc: "Bottom centre",
  br: "Bottom right",
};

export const WatermarkOptions = z.object({
  kind: z.enum(["image", "text"]).default("image"),
  /** The picked logo, kept for re-drawing at another size. Page only; the engine uses `mark`. */
  image: z
    .object({
      name: z.string(),
      blob: z.instanceof(Blob),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  text: z.string().max(100).default(""),
  textColor: z.enum(["white", "black"]).default("white"),
  /** The mark as a PNG, drawn by the page at `markWidth`×`markHeight`. Required to run. */
  mark: z.instanceof(Blob).optional(),
  markWidth: z.number().int().positive().optional(),
  markHeight: z.number().int().positive().optional(),
  /** What `mark` was drawn from and at which size; the panel redraws when it no longer matches. */
  markKey: z.string().optional(),
  /** Width ÷ height of the mark (the logo's own shape, or the measured text). */
  aspect: z.number().positive().default(1),
  /** One of nine positions, or where it was dragged to. */
  anchor: z.enum([...anchors, "custom"]).default("br"),
  /** Custom position: the mark's left and top as a share of the free space (0 = left/top edge). */
  fx: z.number().min(0).max(1).default(1),
  fy: z.number().min(0).max(1).default(1),
  /** Mark width as a share of the picture's width. */
  size: z.number().min(0.02).max(1).default(0.15),
  opacity: z.number().min(0.05).max(1).default(0.8),
  /** Distance from the edge for the nine positions, as a share of the picture's shorter side. */
  margin: z.number().min(0).max(0.25).default(0.03),
  /** Show it only between these times (seconds); the whole video when absent. */
  range: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
});
export type WatermarkOptions = z.infer<typeof WatermarkOptions>;

export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Size {
  x: number;
  y: number;
}

/** The mark's size in picture pixels: `size` × the picture width, the height from its shape, never larger than the picture. */
export function markSize(o: Pick<WatermarkOptions, "size" | "aspect">, video: Size): Size {
  let width = Math.max(2, Math.round(video.width * o.size));
  let height = Math.max(2, Math.round(width / o.aspect));
  if (height > video.height) {
    height = video.height;
    width = Math.max(2, Math.round(height * o.aspect));
  }
  return { width: Math.min(width, video.width), height };
}

export const marginPx = (o: Pick<WatermarkOptions, "margin">, video: Size) =>
  Math.round(Math.min(video.width, video.height) * o.margin);

/** Where the mark goes, in picture pixels, clamped inside the picture. */
export function markRect(
  o: Pick<WatermarkOptions, "size" | "aspect" | "anchor" | "fx" | "fy" | "margin">,
  video: Size,
): Rect {
  const { width, height } = markSize(o, video);
  const freeX = Math.max(0, video.width - width);
  const freeY = Math.max(0, video.height - height);
  let x: number;
  let y: number;
  if (o.anchor === "custom") {
    x = Math.round(o.fx * freeX);
    y = Math.round(o.fy * freeY);
  } else {
    const m = marginPx(o, video);
    const col = o.anchor[1];
    const row = o.anchor[0];
    x = col === "l" ? m : col === "r" ? freeX - m : Math.round(freeX / 2);
    y = row === "t" ? m : row === "b" ? freeY - m : Math.round(freeY / 2);
  }
  return {
    x: Math.min(freeX, Math.max(0, x)),
    y: Math.min(freeY, Math.max(0, y)),
    width,
    height,
  };
}

/** The custom position that keeps a mark where `rect` put it (after a drag, or when switching from an anchor). */
export function toFractions(rect: Rect, video: Size): { fx: number; fy: number } {
  const freeX = video.width - rect.width;
  const freeY = video.height - rect.height;
  return {
    fx: freeX > 0 ? Math.min(1, Math.max(0, rect.x / freeX)) : 0,
    fy: freeY > 0 ? Math.min(1, Math.max(0, rect.y / freeY)) : 0,
  };
}

/** The range that actually applies, or undefined for the whole video. */
export function effectiveRange(o: Pick<WatermarkOptions, "range">, durationSec: number) {
  const r = o.range;
  if (!r) return undefined;
  const start = Math.max(0, Math.min(r.start, durationSec));
  const end = Math.max(start, Math.min(r.end, durationSec));
  if (start <= 0 && end >= durationSec) return undefined;
  return { start, end };
}

/** True when the mark shows at `t` seconds. */
export const showsAt = (range: { start: number; end: number } | undefined, t: number) =>
  !range || (t >= range.start && t < range.end);

/**
 * ffmpeg's filter graph for the same picture: the PNG scaled to the mark's size, its alpha
 * multiplied by the opacity, overlaid at the position, only within the range when there is one.
 */
export function overlayFilter(rect: Rect, opacity: number, range?: { start: number; end: number }) {
  const enable = range
    ? `:enable='between(t,${range.start.toFixed(3)},${range.end.toFixed(3)})'`
    : "";
  return `[1:v]scale=${rect.width}:${rect.height},format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)}[m];[0:v][m]overlay=${rect.x}:${rect.y}${enable}[v]`;
}

export function watermarkCommand(
  videoName: string,
  markName: string,
  outName: string,
  filter: string,
  kbps: number,
  copyAudio: boolean,
  /** The codec an encoded sound is written in (../sound-codec `writtenSoundCodec`). */
  codec: VideoSoundCodec = "aac",
) {
  return `ffmpeg -i ${shellQuote(videoName)} -i ${shellQuote(markName)} -filter_complex "${filter}" -map "[v]" -map '0:a?' -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p -c:a ${copyAudio ? "copy" : ffmpegSoundEncoder(codec)} ${shellQuote(outName)}`;
}

/** Where the mark is, in words, for the summary and the result. */
export function placeName(o: Pick<WatermarkOptions, "anchor">): string {
  return o.anchor === "custom" ? "where you placed it" : anchorNames[o.anchor].toLowerCase();
}

/** The mark PNG the page drew, or the reason there is none. */
export function needMark(o: WatermarkOptions): Blob {
  if (!o.mark)
    throw new EngineError(
      "internal",
      o.kind === "text" ? "There is no text to add yet." : "No logo was added.",
      o.kind === "text"
        ? "Type the watermark text, then try again."
        : "Add a PNG or SVG logo, then try again.",
    );
  return o.mark;
}
