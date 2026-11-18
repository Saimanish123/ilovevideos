/** Crop options and the rectangle they resolve to. Pure; shared by the worker engine, the ffmpeg runner and the panel. */
import { z } from "zod";
import { normalizeRect, ratioIds, type Size } from "./math";

export const CropOptions = z.object({
  /** Rectangle in source display pixels. Snapped to even values before use. */
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(2),
  height: z.number().min(2),
  /** The shape lock chosen in the panel. Only the rectangle drives processing. */
  aspect: z.enum(ratioIds).default("free"),
  /**
   * The remove-black-bars page: the frame starts on the bars found in the video (./bars). Only the
   * rectangle drives processing; this marks the page's job (and its own preset options).
   */
  bars: z.boolean().optional(),
});
export type CropOptions = z.infer<typeof CropOptions>;

export const cropRect = (o: CropOptions, src: Size) =>
  normalizeRect({ x: o.x, y: o.y, width: o.width, height: o.height }, src);
