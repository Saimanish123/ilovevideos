"use client";

import type { IdleSpec } from "../types";

/** Idle state of the slideshow page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop photos or images to make a slideshow",
  several: "multiple",
  Idle: () => (
    <p className="text-fg-muted text-xs">
      JPEG, PNG, WebP or GIF, up to 200. Put them in order next, and add music if you like.
    </p>
  ),
};
