import { z } from "zod";
import { shellQuote } from "@/lib/format";
import {
  type AnimatedFormat,
  type AnimatedQuality,
  AV1_BITS_PER_PIXEL,
  MAX_FPS,
  MIN_FPS,
} from "./math";

/** Kept apart from the engine so the options panel imports no decoder or encoder code. */
export const AnimatedImageOptions = z
  .object({
    /** Locked by each page. */
    format: z.enum(["webp", "apng", "avif"]).default("webp"),
    start: z.number().min(0).default(0),
    end: z.number().min(0),
    fps: z.number().int().min(MIN_FPS).max(MAX_FPS).default(15),
    width: z
      .union([
        z.literal("original"),
        z.literal(720),
        z.literal(480),
        z.literal(360),
        z.literal(240),
      ])
      .default(480),
    /** WebP and AVIF only; APNG is lossless. */
    quality: z.enum(["small", "balanced", "high"]).default("balanced"),
    loop: z.boolean().default(true),
  })
  .refine((o) => o.end > o.start, { message: "End must be after start" });
export type AnimatedImageOptions = z.infer<typeof AnimatedImageOptions>;

const WEBP_Q: Record<AnimatedQuality, number> = { small: 60, balanced: 75, high: 90 };

/** The local FFmpeg command that makes the same kind of file (libwebp, apng, libaom/SVT-AV1). */
export function animatedFfmpegCommand(
  inputName: string,
  outputName: string,
  o: {
    format: AnimatedFormat;
    start: number;
    end: number;
    fps: number;
    loop: boolean;
    quality: AnimatedQuality;
  },
  dims: { width: number; height: number },
): string {
  const ss = `-ss ${o.start.toFixed(2)} -t ${(o.end - o.start).toFixed(2)}`;
  const vf = `-vf "fps=${o.fps},scale=${dims.width}:${dims.height}:flags=bilinear"`;
  const input = shellQuote(inputName);
  const output = shellQuote(outputName);
  const kbps = Math.round(
    (AV1_BITS_PER_PIXEL[o.quality] * dims.width * dims.height * o.fps) / 1000,
  );
  if (o.format === "webp")
    return `ffmpeg ${ss} -i ${input} ${vf} -an -c:v libwebp_anim -quality ${WEBP_Q[o.quality]} -loop ${o.loop ? 0 : 1} ${output}`;
  if (o.format === "apng")
    return `ffmpeg ${ss} -i ${input} ${vf} -an -c:v apng -pred mixed -plays ${o.loop ? 0 : 1} ${output}`;
  return `ffmpeg ${ss} -i ${input} ${vf} -an -c:v libaom-av1 -b:v ${kbps}k -pix_fmt yuv420p -loop ${o.loop ? 0 : 1} ${output}`;
}
