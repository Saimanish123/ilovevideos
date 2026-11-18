"use client";

import type { IdleSpec } from "../types";

/** Idle state of the progress bar and timer pages (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.kind === "timer"
      ? "Drop a video to put a timer on it"
      : "Drop a video to put a progress bar on it",
};
