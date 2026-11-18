"use client";

import type { IdleSpec } from "../types";

/** Idle state of the freeze frame page (types.ts `IdleSpec`). One file at a time: the holds sit on its timeline. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to freeze a frame",
};
