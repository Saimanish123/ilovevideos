"use client";

import { Link } from "@/lib/i18n/navigation";
import type { IdleSpec } from "../types";

/** Idle state of add and replace audio (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.mode === "replace"
      ? "Drop a video and its new audio"
      : "Drop a video and the audio to add to it",
  several: "multiple",
  Idle: () => (
    <p className="text-fg-muted text-xs">
      MP3, M4A, WAV, FLAC, OGG and Opus work as the new audio. WMA and AIFF cannot be decoded here;
      turn them into MP3 first with the{" "}
      <Link
        href="/audio-converter"
        className="rounded-sm font-medium text-fg underline decoration-1 underline-offset-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        audio converter
      </Link>
      .
    </p>
  ),
};
