"use client";

import type { IdleSpec } from "../types";

/** Idle state of the speed page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.input === "audio"
      ? "Drop an audio file to speed it up or slow it down"
      : "Drop a video to speed it up or slow it down",
  several: "batch",
};
