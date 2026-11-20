"use client";

import type { IdleSpec } from "../types";

/** Idle state of the background pages without a green screen (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video with a person in it",
  Idle: ({ preset }) => (
    <p className="text-fg-muted text-sm">
      {preset.effect === "blur"
        ? "The person is found for you; you set the blur next."
        : "The person is found for you; you choose the new background next."}
    </p>
  ),
};
