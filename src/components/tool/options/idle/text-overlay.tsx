"use client";

import type { IdleSpec } from "../types";

/** Idle state of the add-text page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to put a title or caption on it",
};
