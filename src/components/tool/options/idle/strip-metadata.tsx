"use client";

import type { IdleSpec } from "../types";

/** Idle state of the strip-metadata page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to see and remove its metadata",
  several: "batch",
};
