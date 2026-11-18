"use client";

import type { IdleSpec } from "../types";

/** Idle state of change audio pitch (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop an audio file or a video to change its pitch",
  several: "batch",
};
