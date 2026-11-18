"use client";

import type { IdleSpec } from "../types";

/** Idle state of change volume and normalise (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.mode === "normalize"
      ? "Drop an audio file or a video to normalise its loudness"
      : preset.input === "audio"
        ? "Drop an audio file to make it louder or quieter"
        : "Drop a video to make its sound louder or quieter",
  several: "batch",
};
