"use client";

import type { IdleSpec } from "../types";

/** Idle state of the image sequence page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to turn it into numbered images",
};
