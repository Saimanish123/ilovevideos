"use client";

import type { IdleSpec } from "../types";

/** Idle state of the two-video layout pages (types.ts `IdleSpec`): two files, one frame. */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.layout === "pip"
      ? "Drop two videos: the main one and the inset"
      : "Drop two videos to put them side by side",
  several: "multiple",
};
