"use client";

import type { IdleSpec } from "../types";

/** Idle state of the reverse page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to play it backwards",
  several: "batch",
};
