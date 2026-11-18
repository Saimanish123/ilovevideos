/**
 * The burn-in looks for add subtitles: the page's choices turned into the `CueStyle` the canvas
 * renderer draws with (../overlay/text), on the page's preview and in the worker alike, and the
 * nearest libass `force_style` for files only ffmpeg reads. Pure.
 *
 * - Classic: the plain look players use (white, black outline, 6% from the bottom). With no
 *   overrides it is exactly `plainCueStyle`, so burn-ins made before the looks existed are unchanged.
 * - Boxed: regular weight on a translucent dark box behind each line, no outline.
 * - Bold social: bold, larger, a heavy outline, lines kept short, placed above the part of a
 *   vertical feed the app covers. Meta's ads guide for Reels asks for the bottom 35% and 6% at each
 *   side to stay free of text (src/content/platforms/frames.ts, checked 2026-09-30); landscape video
 *   gets the lower third.
 */
import { framePlatforms } from "@/content/platforms/frames";
import { type CueStyle, FONT_STACK, plainCueStyle, type TextSize } from "../overlay/text";
import type { AddSubtitlesOptions } from "./options";

export type Look = AddSubtitlesOptions["look"];
type O = Pick<
  AddSubtitlesOptions,
  "look" | "size" | "fontShare" | "position" | "color" | "boxOpacity" | "lineWidth"
>;
interface Size {
  width: number;
  height: number;
}

/** Font size as a share of √(width × height) per look and size step. */
export const lookSizes: Record<Look, Record<TextSize, number>> = {
  classic: { small: 0.032, medium: 0.04, large: 0.05 },
  boxed: { small: 0.032, medium: 0.04, large: 0.05 },
  social: { small: 0.05, medium: 0.062, large: 0.075 },
};

const reels = framePlatforms["instagram-reels"].safeZone;
const portrait = (v: Size) => v.height > v.width;

/** Where the bottom of the text sits by default, as a share of the height. */
export function lookPosition(look: Look, v: Size): number {
  if (look !== "social") return 0.94;
  return portrait(v) ? 1 - (reels?.bottom ?? 0.35) : 0.85;
}

export const lookBox = (look: Look) => (look === "boxed" ? 0.6 : 0);

/** Lines wrap at this share of the width by default. */
export function lookLineWidth(look: Look, v: Size): number {
  if (look !== "social") return 0.9;
  return portrait(v) ? 1 - 2 * (reels?.sides ?? 0.06) : 0.8;
}

export const fontShareOf = (o: Pick<O, "look" | "size" | "fontShare">) =>
  o.fontShare ?? lookSizes[o.look][o.size];

export const textPx = (o: Pick<O, "look" | "size" | "fontShare">, v: Size) =>
  Math.max(12, Math.round(Math.sqrt(v.width * v.height) * fontShareOf(o)));

/** True when nothing differs from the plain look (the renderer then runs exactly as before). */
export const isPlain = (o: O) =>
  o.look === "classic" &&
  o.fontShare === undefined &&
  o.position === undefined &&
  o.color.toLowerCase() === "#ffffff" &&
  (o.boxOpacity ?? 0) === 0 &&
  o.lineWidth === undefined;

function relLuminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Dark text gets a light outline and box; light text a dark one. */
export const darkText = (color: string) => relLuminance(color) < 0.3;

/** The style the renderer draws with, for a picture of size `v`. */
export function cueStyle(o: O, v: Size, family = FONT_STACK): CueStyle {
  const plain = plainCueStyle(v.width, v.height, o.size);
  if (isPlain(o)) return { ...plain, family };
  const px = textPx(o, v);
  const dark = darkText(o.color);
  const outline =
    o.look === "boxed"
      ? 0
      : o.look === "social"
        ? Math.max(3, Math.round(px * 0.12))
        : Math.max(2, Math.round(px * 0.09));
  const box = o.boxOpacity ?? lookBox(o.look);
  const margin = Math.round(v.height * 0.06);
  return {
    px,
    weight: o.look === "social" ? 700 : 400,
    color: o.color,
    outline,
    outlineColor: dark ? "rgb(255 255 255)" : "rgb(0 0 0)",
    box: box > 0 ? (dark ? `rgb(255 255 255 / ${box})` : `rgb(0 0 0 / ${box})`) : undefined,
    maxWidth: v.width * (o.lineWidth ?? lookLineWidth(o.look, v)) - outline * 2,
    bottom: Math.round(v.height * (o.position ?? lookPosition(o.look, v))),
    top: margin,
    gap: Math.round(px * 0.2),
    family,
  };
}

/** Height of the position band on the preview: two lines of text with their outline, in pixels. */
export const bandHeight = (style: Pick<CueStyle, "px" | "outline">) =>
  Math.round(style.px * 1.25 * 2 + style.outline * 4);

/**
 * The highest the bottom of the text may go, as a share of the height from the top: two lines must
 * fit above it. One limit for the band on the picture and the number field under More options.
 */
export const highestPosition = (style: Pick<CueStyle, "px" | "outline">, height: number) =>
  Math.max(0.1, Math.min(0.9, bandHeight(style) / Math.max(1, height) + 0.02));

/** ASS colour &HAABBGGRR from #rrggbb and an opacity (ASS alpha 00 is opaque). */
const assColour = (hex: string, opacity = 1) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const h2 = (x: number) => x.toString(16).toUpperCase().padStart(2, "0");
  const a = Math.round((1 - opacity) * 255);
  return `&H${h2(a)}${h2(n & 255)}${h2((n >> 8) & 255)}${h2((n >> 16) & 255)}`;
};

/**
 * The nearest libass `force_style` for a styled burn-in of a file only ffmpeg reads (sizes on the
 * 384×288 script our ASS writer makes): font size, colour, bold, outline or a box, wrap margins and the bottom
 * margin. libass draws one box around the whole event rather than one per line.
 */
export function assForceStyle(o: O, v: Size): string {
  // Our ASS writer sets PlayResX 384 and PlayResY 288: sizes and vertical margins scale with the
  // height (288), side margins with the width (384).
  const h = 288;
  const w = 384;
  const px = Math.round(
    (Math.sqrt(v.width * v.height) * fontShareOf(o) * h) / Math.max(1, v.height),
  );
  const box = o.boxOpacity ?? lookBox(o.look);
  const dark = darkText(o.color);
  const back = dark ? "#ffffff" : "#000000";
  const marginV = Math.round(h * (1 - (o.position ?? lookPosition(o.look, v))));
  const side = Math.round((w * (1 - (o.lineWidth ?? lookLineWidth(o.look, v)))) / 2);
  return [
    "FontName=Geist",
    `Fontsize=${px}`,
    `PrimaryColour=${assColour(o.color)}`,
    `Bold=${o.look === "social" ? 1 : 0}`,
    box > 0 ? "BorderStyle=3" : "BorderStyle=1",
    box > 0 ? `BackColour=${assColour(back, box)}` : `OutlineColour=${assColour(back)}`,
    box > 0 ? `OutlineColour=${assColour(back, box)}` : `Outline=${o.look === "social" ? 3 : 2}`,
    "Shadow=0",
    `MarginV=${marginV}`,
    `MarginL=${side}`,
    `MarginR=${side}`,
  ].join(",");
}
