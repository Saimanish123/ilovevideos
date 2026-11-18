"use client";

import type { IdleSpec } from "../types";

/** Idle state of merge audio (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop audio files to join them into one",
  several: "multiple",
};
