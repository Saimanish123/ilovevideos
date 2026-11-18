"use client";

import type { IdleSpec } from "../types";

/** Idle state of stabilize (types.ts `IdleSpec`). Several files run as a batch with one setting. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a shaky video to steady it",
  several: "batch",
};
