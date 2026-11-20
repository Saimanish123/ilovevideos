"use client";

import { audioFormatName } from "@/content/formats/audio-names";
import type { IdleSpec } from "../types";

/** Video container names for the drop prompt of video → audio pair pages ("a MOV video"). */
const videoNames: Record<string, string> = {
  mp4: "an MP4",
  mov: "a MOV",
  webm: "a WebM",
  mkv: "an MKV",
};

/** Idle state of extract audio and its pairs (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    if (preset.trimOnly === true) return "Drop an audio file to trim it";
    const from = typeof preset.from === "string" ? videoNames[preset.from] : undefined;
    const to = audioFormatName(preset.to);
    return from && to
      ? `Drop ${from} video to save its sound as ${to}`
      : "Drop a video to save its sound";
  },
};
