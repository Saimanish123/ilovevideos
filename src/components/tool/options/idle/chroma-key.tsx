"use client";

import type { IdleSpec } from "../types";

/** Idle state of the green screen page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a green screen video",
  Idle: () => <p className="text-fg-muted text-sm">You choose the new background next.</p>,
};
