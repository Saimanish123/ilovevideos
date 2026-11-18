"use client";

import type { IdleSpec } from "../types";

/** Idle state of sharpen and denoise (types.ts `IdleSpec`); one file at a time (the split is per file). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.job === "sharpen" ? "Drop a video to sharpen it" : "Drop a video to reduce its grain",
};
