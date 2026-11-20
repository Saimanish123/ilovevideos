/**
 * Text overlay options and the geometry every path shares (panel, preview frame, worker, ffmpeg).
 * Pure. The text reaches the engine as a PNG the page drew at its exact size in output pixels
 * (`mark`), like the watermark's: the page has the UI font, the worker only composites pixels.
 *
 * Position reuses the watermark's placement (nine anchors or a dragged spot, ../watermark/options),
 * with the block's size coming from the text rather than from a width share.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { withEvenCropOut } from "../crop/math";
import { EngineError } from "../errors";
import { fadeOverlayFilter, type TimedRange } from "../overlay/fade";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";
import { anchors, markRect, type Rect, type Size } from "../watermark/options";

export const textSizes = { small: 0.05, medium: 0.08, large: 0.12 } as const;
export const FADE_SEC = 0.5;

export const TextOverlayOptions = z.object({
  text: z.string().max(300).default(""),
  /** Line height of the text as a share of the picture's height. */
  size: z.number().min(0.02).max(0.3).default(textSizes.medium),
  style: z.enum(["shadow", "outline", "box"]).default("shadow"),
  color: z.enum(["white", "black"]).default("white"),
  anchor: z.enum([...anchors, "custom"]).default("bc"),
  fx: z.number().min(0).max(1).default(0.5),
  fy: z.number().min(0).max(1).default(1),
  /** Distance from the edge for the nine positions, as a share of the shorter side. */
  margin: z.number().min(0).max(0.25).default(0.06),
  /** When it shows (seconds); the whole video when absent. */
  range: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
  /** Fade in and out over this many seconds; 0 for a cut. */
  fade: z.number().min(0).max(3).default(FADE_SEC),
  /** The text as a PNG at its size in output pixels, drawn by the page. Required to run. */
  mark: z.instanceof(Blob).optional(),
  markWidth: z.number().int().positive().optional(),
  markHeight: z.number().int().positive().optional(),
  markKey: z.string().optional(),
});
export type TextOverlayOptions = z.infer<typeof TextOverlayOptions>;

/** Font size in output pixels for a picture: `size` is the line height share, text is 0.8 of it. */
export const fontPx = (o: Pick<TextOverlayOptions, "size">, video: Size) =>
  Math.max(8, Math.round(video.height * o.size * 0.8));

/** Where the text block goes, in picture pixels, from its drawn size. */
export function textRect(
  o: Pick<TextOverlayOptions, "anchor" | "fx" | "fy" | "margin">,
  block: Size,
  video: Size,
): Rect {
  const w = Math.max(2, Math.min(block.width, video.width));
  return markRect(
    {
      anchor: o.anchor,
      fx: o.fx,
      fy: o.fy,
      margin: o.margin,
      size: w / video.width,
      aspect: w / Math.max(1, block.height),
    },
    video,
  );
}

/** The range that applies: the whole video when absent or covering it. */
export function textRange(o: Pick<TextOverlayOptions, "range">, durationSec: number): TimedRange {
  const r = o.range;
  if (!r) return { start: 0, end: durationSec };
  const start = Math.max(0, Math.min(r.start, durationSec));
  return { start, end: Math.max(start, Math.min(r.end, durationSec)) };
}

/** Text alignment inside the block follows the column it is anchored to. */
export const alignOf = (o: Pick<TextOverlayOptions, "anchor">): "left" | "center" | "right" =>
  o.anchor === "custom"
    ? "center"
    : o.anchor[1] === "l"
      ? "left"
      : o.anchor[1] === "r"
        ? "right"
        : "center";

export function textCommand(
  videoName: string,
  outName: string,
  rect: Rect,
  o: TextOverlayOptions,
  durationSec: number,
  kbps: number,
  copyAudio: boolean,
  /** The source size; an odd edge is cut for H.264 after the overlay (../crop/math). */
  src?: Size,
  /** The codec an encoded sound is written in (../sound-codec `writtenSoundCodec`). */
  codec: VideoSoundCodec = "aac",
): string {
  const graph = fadeOverlayFilter(textRange(o, durationSec), o.fade, rect.x, rect.y, durationSec);
  const filter = src ? withEvenCropOut(src, graph) : graph;
  return `ffmpeg -i ${shellQuote(videoName)} -loop 1 -i text.png -filter_complex "${filter}" -map "[v]" -map '0:a?' -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p -c:a ${copyAudio ? "copy" : ffmpegSoundEncoder(codec)} ${shellQuote(outName)}`;
}

/** The text PNG the page drew, or the reason there is none. */
export const needText = (o: TextOverlayOptions): Blob => {
  if (!o.mark || !o.markWidth || !o.markHeight)
    throw new EngineError(
      "internal",
      "There is no text to add yet.",
      "Type the text, then try again.",
    );
  return o.mark;
};
