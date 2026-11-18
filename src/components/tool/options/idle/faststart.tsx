"use client";

import type { IdleSpec } from "../types";

/** Idle state of the optimise-for-web page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop an MP4 or MOV to make it start playing sooner",
  several: "batch",
};
