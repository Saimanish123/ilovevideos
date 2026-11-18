"use client";

import type { IdleSpec } from "../types";

/** Idle state of the merge page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop two or more videos to join them",
  several: "multiple",
};
