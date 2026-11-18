"use client";

import type { IdleSpec } from "../types";

/** Idle state of the zoom page (types.ts `IdleSpec`). One file at a time: key frames sit on its timeline. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to zoom in on it",
};
