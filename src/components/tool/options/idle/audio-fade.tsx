"use client";

import type { IdleSpec } from "../types";

/** Idle state of the fade pages (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.input === "video"
      ? "Drop a video to fade its sound in and out"
      : "Drop an audio file to fade it in and out",
  several: "batch",
};
