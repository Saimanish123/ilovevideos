/**
 * Change speed. Always runs through ffmpeg.wasm on the page (see ./ffmpeg): the picture is re-timed
 * with `setpts` and re-encoded, the sound is stretched with `atempo` (pitch kept), resampled
 * (pitch follows speed) or dropped. The worker engine object exists for the loader table only.
 */
import { z } from "zod";
import { EngineError } from "../errors";
import type { Engine } from "../types";
import { MAX_SPEED, MIN_SPEED } from "./math";

export const SpeedOptions = z.object({
  speed: z.number().min(MIN_SPEED).max(MAX_SPEED).default(2),
  /** True: atempo keeps the pitch. False: the pitch shifts with the speed. */
  keepPitch: z.boolean().default(true),
  /** Drop the sound track altogether. */
  muteAudio: z.boolean().default(false),
});
export type SpeedOptions = z.infer<typeof SpeedOptions>;

export const speedEngine: Engine<SpeedOptions> = {
  id: "speed",
  backends: ["ffmpeg-wasm"],
  optionsSchema: SpeedOptions,
  async supports() {
    // ffmpeg.wasm runs on the page thread (it owns its own worker), never inside the engine worker.
    return false;
  },
  async run() {
    throw new EngineError("internal", "This file could not be processed.", "Try again.");
  },
};
