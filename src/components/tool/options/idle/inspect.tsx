"use client";

import type { IdleSpec } from "../types";

/** Idle state of the inspect page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video or audio file to see what is inside it",
};
