"use client";

import type { IdleSpec } from "../types";

/** Idle state of the edit-metadata pages: tags, or the recording date (`task: "date"`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.task === "date"
      ? "Drop a video to change its recording date"
      : "Drop a video or audio file to edit its title, artist, date and cover",
  several: "batch",
  Idle: ({ preset }) => (
    <p className="text-fg-muted text-xs">
      {preset.task === "date"
        ? "Next, set a date or shift it. Several files move by the same amount."
        : "Next, edit the fields. Several files take the same values."}
    </p>
  ),
};
