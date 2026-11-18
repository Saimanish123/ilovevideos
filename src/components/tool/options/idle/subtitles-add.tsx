"use client";

import type { AddSubtitlesOptions } from "@/tools/engines/subtitles-add/options";
import type { IdleSpec } from "../types";

/** A subtitle file handed on (from the subtitle converter) waits in the preset until the video comes. */
export const handedSubtitle = (preset: Record<string, unknown>) =>
  preset.subtitle as AddSubtitlesOptions["subtitle"] | undefined;

/** Idle state of add subtitles (types.ts `IdleSpec`). One subtitle file per video: never a batch. */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    const sub = handedSubtitle(preset);
    return sub ? `Drop the video for ${sub.name}` : "Drop a video to add subtitles to";
  },
  Idle: ({ preset }) => (
    <p className="text-fg-muted text-sm">
      {handedSubtitle(preset)
        ? "The subtitle file goes in as soon as the video is read."
        : "Then add its subtitle file."}
    </p>
  ),
};
