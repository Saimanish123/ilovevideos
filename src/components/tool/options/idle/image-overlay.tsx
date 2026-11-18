"use client";

import type { IdleSpec } from "../types";

/** Idle state of the add-image page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to put images or stickers on it",
  Idle: () => (
    <p className="text-fg-muted text-sm">You add the pictures next and place them on the video.</p>
  ),
};
