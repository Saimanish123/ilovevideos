"use client";

import type { IdleSpec } from "../types";

/** Idle state of the change-video-thumbnail page (types.ts `IdleSpec`): one file at a time. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to choose the frame it shows as its thumbnail",
  Idle: () => (
    <p className="text-fg-muted text-xs">
      Next, pick the frame on a filmstrip. Nothing is re-encoded.
    </p>
  ),
};
