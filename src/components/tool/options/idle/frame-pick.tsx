"use client";

import type { IdleSpec } from "../types";

/** Idle state of the sharpest-frame page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to find its sharpest frame",
};
