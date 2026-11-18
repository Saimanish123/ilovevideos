import { z } from "zod";
import { DEFAULT_QUALITY, imageFormats } from "../frame-extract/math";

/** Kept apart from the engine so the options panel imports no decoder code. */
export const FramePickOptions = z
  .object({
    /** "sharpest": search the range; "thumbnail": one frame at `time`, cropped and scaled. */
    mode: z.enum(["sharpest", "thumbnail"]).default("sharpest"),
    /** Thumbnail: the frame's time, seconds from the file's start. */
    time: z.number().min(0).optional(),
    /** Thumbnail: the crop in display pixels of the source (rotation applied). */
    crop: z
      .object({
        x: z.number().min(0),
        y: z.number().min(0),
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional(),
    /** Thumbnail: the output size in pixels. */
    outWidth: z.number().int().min(16).max(7680).optional(),
    outHeight: z.number().int().min(16).max(7680).optional(),
    /** The range searched, seconds from the file's start. */
    start: z.number().min(0).default(0),
    end: z.number().min(0).default(0),
    format: z.enum(imageFormats).default("png"),
    /** 0–100, JPG and WebP only. */
    quality: z.number().min(1).max(100).default(DEFAULT_QUALITY),
  })
  .refine((o) => o.mode === "thumbnail" || o.end > o.start, { message: "End must be after start" });
export type FramePickOptions = z.infer<typeof FramePickOptions>;

/** At most this many frames are scored per run (an even sample of longer ranges). */
export const MAX_SCORED = 900;
