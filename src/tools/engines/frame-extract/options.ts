import { z } from "zod";
import { DEFAULT_QUALITY, imageFormats } from "./math";

/** Kept apart from the engine so the options panel imports no decoder code. */
export const FrameExtractOptions = z.object({
  /** Presentation time in seconds, snapped to a frame by the panel. */
  time: z.number().min(0).default(0),
  format: z.enum(imageFormats).default("png"),
  /** 0–100, JPG and WebP only. */
  quality: z.number().min(1).max(100).default(DEFAULT_QUALITY),
});
export type FrameExtractOptions = z.infer<typeof FrameExtractOptions>;
