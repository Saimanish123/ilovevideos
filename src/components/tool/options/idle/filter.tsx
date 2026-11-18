"use client";

import type { IdleSpec } from "../types";

/** Idle state of the filter pages (types.ts `IdleSpec`): the prompt names the page's job. */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.job === "mono"
      ? "Drop a video to make it black and white"
      : preset.job === "adjust"
        ? "Drop a video to brighten it or change its colours"
        : "Drop a video to add a filter",
  several: "batch",
};
