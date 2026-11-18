"use client";

import type { IdleSpec } from "../types";

/** Idle state of change bitrate (types.ts `IdleSpec`). Several files run as a batch at one bitrate. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to set its bitrate",
  several: "batch",
};
