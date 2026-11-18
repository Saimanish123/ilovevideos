"use client";

import type { IdleSpec } from "../types";

/** Idle state of the watermark page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to add a watermark",
  Idle: () => (
    <p className="text-fg-muted text-sm">
      MP4, MOV, MKV or WebM. You add the logo or text next, and place it on the picture.
    </p>
  ),
};
