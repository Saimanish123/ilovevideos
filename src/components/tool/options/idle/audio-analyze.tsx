"use client";

import type { IdleSpec } from "../types";

/** Idle state of the key and BPM finder (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop songs to find their key and BPM",
  several: "multiple",
};
