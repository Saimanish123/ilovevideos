"use client";

import type { IdleSpec } from "../types";

/** Idle state of the trim page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to trim it",
};
