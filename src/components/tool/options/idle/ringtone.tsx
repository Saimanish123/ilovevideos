"use client";

import type { IdleSpec } from "../types";

/** Idle state of the ringtone maker (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a song or a video to make a ringtone",
};
