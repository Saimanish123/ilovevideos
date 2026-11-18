"use client";

import type { IdleSpec } from "../types";

/** Idle state of the video-to-gif page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to make a GIF from it",
};
