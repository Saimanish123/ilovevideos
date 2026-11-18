"use client";

import type { IdleSpec } from "../types";

/** Idle state of the mute page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to remove its sound",
  several: "batch",
};
