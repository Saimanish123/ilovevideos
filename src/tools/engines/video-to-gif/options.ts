import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { DEFAULT_FPS, type GifQuality, MAX_FPS, MIN_FPS } from "./math";

/** Kept apart from the engine so the options panel and the page runner import no decoder code. */
export const VideoToGifOptions = z
  .object({
    start: z.number().min(0).default(0),
    end: z.number().min(0),
    fps: z.number().int().min(MIN_FPS).max(MAX_FPS).default(DEFAULT_FPS),
    width: z
      .union([
        z.literal("original"),
        z.literal(720),
        z.literal(480),
        z.literal(360),
        z.literal(240),
      ])
      .default(480),
    /** "fast" quantises a palette per frame on the device; "best" runs ffmpeg's palettegen/paletteuse with dithering. */
    quality: z.enum(["fast", "best"]).default("fast"),
    loop: z.boolean().default(true),
  })
  .refine((o) => o.end > o.start, { message: "End must be after start" });
export type VideoToGifOptions = z.infer<typeof VideoToGifOptions>;

/**
 * The equivalent ffmpeg command. Both paths are described honestly: the fast path is a palette per
 * frame without dithering; the best path is the classic two-pass palettegen → paletteuse.
 */
export function gifFfmpegCommand(
  inputName: string,
  outputName: string,
  o: { start: number; end: number; fps: number; loop: boolean; quality: GifQuality },
  dims: { width: number; height: number },
): string {
  const ss = `-ss ${o.start.toFixed(2)} -t ${(o.end - o.start).toFixed(2)}`;
  const scale = `fps=${o.fps},scale=${dims.width}:${dims.height}:flags=lanczos`;
  const loop = `-loop ${o.loop ? 0 : -1}`;
  const input = shellQuote(inputName);
  const output = shellQuote(outputName);
  if (o.quality === "best") {
    return [
      `ffmpeg ${ss} -i ${input} -vf "${scale},palettegen" palette.png`,
      `ffmpeg ${ss} -i ${input} -i palette.png -lavfi "${scale}[x];[x][1:v]paletteuse=dither=sierra2_4a" ${loop} ${output}`,
    ].join(" && ");
  }
  return `ffmpeg ${ss} -i ${input} -vf "${scale},split[a][b];[a]palettegen=stats_mode=single[p];[b][p]paletteuse=new=1:dither=none" ${loop} ${output}`;
}
