"use client";

import type { IdleSpec } from "../types";

/** Idle state of the loop pages (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.boomerang === true
      ? "Drop a short clip to make it a boomerang"
      : "Drop a video to repeat it",
  several: "batch",
};
