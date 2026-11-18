/** Options of the fade engine (E5). Pure: the panel imports this without the engine. */
import { z } from "zod";

export const MAX_FADE_SEC = 60;

export const AudioFadeOptions = z
  .object({
    /** Seconds of fade-in from silence; 0 for none. */
    fadeIn: z.number().min(0).max(MAX_FADE_SEC).default(2),
    /** Seconds of fade-out to silence; 0 for none. */
    fadeOut: z.number().min(0).max(MAX_FADE_SEC).default(3),
    curve: z.enum(["smooth", "linear"]).default("smooth"),
    /** Internal: the page runner asks for float WAV when ffmpeg writes the final format. */
    output: z.enum(["auto", "wav"]).default("auto"),
  })
  .refine((o) => o.fadeIn > 0 || o.fadeOut > 0, { message: "Choose a fade-in or a fade-out" });
export type AudioFadeOptions = z.infer<typeof AudioFadeOptions>;
