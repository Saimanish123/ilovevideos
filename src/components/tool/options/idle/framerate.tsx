"use client";

import type { IdleSpec } from "../types";

/** Idle state of the change-frame-rate page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to lower its frame rate",
  several: "batch",
};
