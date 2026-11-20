"use client";

import type { IdleSpec } from "../types";

/** Idle state of remove background noise (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a recording or a video to clean up its speech",
  several: "batch",
};
