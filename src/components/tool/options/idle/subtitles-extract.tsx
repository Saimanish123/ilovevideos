"use client";

import type { IdleSpec } from "../types";

/** Idle state of the extract-subtitles page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop an MKV, MP4, MOV or WebM video to take its subtitles out",
  several: "batch",
  Idle: () => (
    <p className="text-fg-muted text-xs">
      Only the header is read to list the tracks; nothing is decoded.
    </p>
  ),
};
