"use client";

import type { IdleSpec } from "../types";

/** Idle state of the repair page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a damaged video to see what is wrong with it",
  Idle: () => (
    <p className="text-fg-muted text-xs">
      The file is checked first; nothing changes until you press Repair.
    </p>
  ),
};
