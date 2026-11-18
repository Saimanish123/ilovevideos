"use client";

import type { IdleSpec } from "../types";

/** Idle state of GIF to video (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    `Drop a GIF to turn it into ${preset.to === "webm" ? "a WebM" : "an MP4"}`,
  several: "batch",
};
