"use client";

import type { IdleSpec } from "../types";

/** Idle state of the add-border page (types.ts `IdleSpec`). One file at a time: the frame is drawn on its preview. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to add a border around it",
};
