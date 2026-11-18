"use client";

import type { IdleSpec } from "../types";

/** Idle state of the audio sync fix (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video whose sound is out of sync",
  several: "batch",
};
