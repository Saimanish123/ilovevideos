"use client";

import type { IdleSpec } from "../types";

/** Idle state of the audio to video page (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop an audio file to turn it into a video",
  several: "batch",
  Idle: () => (
    <p className="text-fg-muted text-xs">
      MP3, M4A, WAV, FLAC, OGG and Opus. The picture is chosen next: a title card or your image.
    </p>
  ),
};
