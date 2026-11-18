/** Aspect-ratio options and the geometry plan they resolve to. Pure; shared by the worker engine, the ffmpeg runner and the panel. */
import { z } from "zod";
import {
  capLayout,
  evenFloor,
  hasRatio,
  largestRect,
  padLayout,
  type Rect,
  type Size,
} from "../crop/math";
import type { GeometryPlan } from "../crop/plan";
import { type AspectRatioId, aspectNumber, aspectRatioIds } from "./ratios";

export { type AspectRatioId, aspectNumber, aspectRatioIds };

export const AspectRatioOptions = z.object({
  ratio: z.enum(aspectRatioIds).default("9:16"),
  /** crop = fill the new frame and cut the overflow; pad = keep the whole picture and add bars. */
  fit: z.enum(["crop", "pad"]).default("pad"),
  /** Position of the kept window along the axis that is cut, 0 (left/top) to 1 (right/bottom). */
  anchorX: z.number().min(0).max(1).default(0.5),
  anchorY: z.number().min(0).max(1).default(0.5),
  /** Bar fill in pad mode: a colour, or the picture itself blurred (`blur`). */
  background: z.enum(["black", "white", "blur"]).default("black"),
  /**
   * Largest frame to write (a platform's size, resize-for-platform pages). A bigger result is scaled
   * down to it; a smaller one is never enlarged. Absent on change-video-aspect-ratio.
   */
  maxWidth: z.number().int().min(2).optional(),
  maxHeight: z.number().int().min(2).optional(),
  /** Keep only the first N seconds (a platform's length limit, e.g. 180 for Shorts). */
  maxSec: z.number().positive().optional(),
  /** Which platform page this run is for (names the file and the verdict). No effect on processing. */
  platform: z.string().optional(),
});
export type AspectRatioOptions = z.infer<typeof AspectRatioOptions>;

/** The crop window for fill mode. */
export const fillRect = (o: AspectRatioOptions, src: Size): Rect =>
  largestRect(src, aspectNumber(o.ratio), { x: o.anchorX, y: o.anchorY });

export const capOf = (o: AspectRatioOptions): Size | undefined =>
  o.maxWidth && o.maxHeight ? { width: o.maxWidth, height: o.maxHeight } : undefined;

export function aspectPlan(o: AspectRatioOptions, src: Size): GeometryPlan {
  const cap = capOf(o);
  const end = o.maxSec;
  if (o.fit === "crop") {
    const rect = fillRect(o, src);
    const k = cap ? Math.min(cap.width / rect.width, cap.height / rect.height) : 1;
    const scale =
      k < 1 ? { width: evenFloor(rect.width * k), height: evenFloor(rect.height * k) } : undefined;
    return { kind: "crop", rect, scale, end };
  }
  const layout = padLayout(src, aspectNumber(o.ratio));
  return {
    kind: "pad",
    layout: cap ? capLayout(layout, cap) : layout,
    color: o.background,
    end,
  };
}

/**
 * True when a run would change nothing: the source already has the shape, is within the size cap
 * and within the length limit.
 */
export function aspectNoop(o: AspectRatioOptions, src: Size, durationSec: number): boolean {
  if (!hasRatio(src, aspectNumber(o.ratio))) return false;
  const cap = capOf(o);
  if (cap && (src.width > cap.width || src.height > cap.height)) return false;
  if (o.maxSec !== undefined && durationSec > o.maxSec + 0.05) return false;
  return true;
}

/** File name suffix, e.g. "9x16", or "tiktok" on a platform page. */
export const aspectSuffix = (o: AspectRatioOptions) => o.platform ?? o.ratio.replace(":", "x");
