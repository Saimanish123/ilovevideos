"use client";

import type { IdleSpec } from "../types";

/** Idle state of the thumbnail maker (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to make a thumbnail from it",
};
