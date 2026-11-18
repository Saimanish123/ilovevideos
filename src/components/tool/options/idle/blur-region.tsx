"use client";

import type { IdleSpec } from "../types";

/** Idle state of the blur page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to blur part of it",
  Idle: () => <p className="text-fg-muted text-sm">You draw the regions on the picture next.</p>,
};
