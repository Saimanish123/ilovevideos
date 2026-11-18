"use client";

import type { IdleSpec } from "../types";

/** Idle state of the frame-extract page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to take a still from it",
};
