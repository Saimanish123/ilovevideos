"use client";

import type { IdleSpec } from "../types";

/** Idle state of the contact sheet page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to lay its frames out on one sheet",
  several: "batch",
  Idle: () => (
    <p className="text-fg-muted text-xs">Several videos give one sheet each, in a ZIP.</p>
  ),
};
