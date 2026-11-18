"use client";

import { type AudioFormatId, audioFormatById, audioSources } from "@/content/formats/audio";
import type { IdleSpec } from "../types";

/** The source a pair page names, with its article as people say it ("an MP3", "a WAV", "a FLAC"). */
const fromPhrase = (preset: Record<string, unknown>) => {
  const source = audioSources.find((s) => s.id === preset.from);
  if (!source) return undefined;
  const an = ["mp3", "m4a", "aac", "ogg", "opus", "aiff"].includes(source.id);
  return `${an ? "an" : "a"} ${source.name}`;
};

/** Idle state of the audio converter and its pairs (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    if (preset.channels === 1) return "Drop an audio file to make it mono";
    if (preset.resample === true) return "Drop an audio file to change its sample rate";
    const from = fromPhrase(preset);
    const to =
      typeof preset.to === "string"
        ? audioFormatById.get(preset.to as AudioFormatId)?.name
        : undefined;
    return from && to
      ? `Drop ${from} file to convert it to ${to}`
      : "Drop an audio file to convert it";
  },
  several: "batch",
};
