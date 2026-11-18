"use client";

import type { IdleSpec } from "../types";

/** Idle state of the split page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to split it into parts",
};
