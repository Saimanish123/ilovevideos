"use client";

import type { IdleSpec } from "../types";

/** Idle state of the intro and outro page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop the main video; the intro and outro come next",
  several: "batch",
};
