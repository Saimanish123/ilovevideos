"use client";

import type { IdleSpec } from "../types";

/** Idle state of select audio tracks (types.ts `IdleSpec`): one file, its own tracks. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video with several audio tracks",
};
