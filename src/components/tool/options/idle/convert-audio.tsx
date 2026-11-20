"use client";

import { audioFormatName, audioSourceNames } from "@/content/formats/audio-names";
import type { IdleSpec } from "../types";

/** The source a pair page names, with its article as people say it ("an MP3", "a WAV", "a FLAC"). */
const fromPhrase = (preset: Record<string, unknown>) => {
  const id = preset.from;
  if (typeof id !== "string" || !(id in audioSourceNames)) return undefined;
  const an = ["mp3", "m4a", "aac", "ogg", "opus", "aiff"].includes(id);
  return `${an ? "an" : "a"} ${audioSourceNames[id as keyof typeof audioSourceNames]}`;
};

/** Idle state of the audio converter and its pairs (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    if (preset.channels === 1) return "Drop an audio file to make it mono";
    if (preset.resample === true) return "Drop an audio file to change its sample rate";
    const from = fromPhrase(preset);
    const to = audioFormatName(preset.to);
    return from && to
      ? `Drop ${from} file to convert it to ${to}`
      : "Drop an audio file to convert it";
  },
  several: "batch",
};
