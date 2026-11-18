"use client";

import type { IdleSpec } from "../types";

/** Idle state of remove silence (types.ts `IdleSpec`): one file, its own pauses on a timeline. */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.input === "video"
      ? "Drop a video to cut out its pauses"
      : "Drop a recording to cut out its pauses",
};
