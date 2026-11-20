"use client";

import { AudioHero } from "../audio/audio-hero";
import type { OptionsSpec, ResultVerdict } from "./types";

/**
 * The done state of the three recorders (ADR-0099). Their idle state is the recorder itself
 * (`options/idle/<engine>`, `IdleSpec.Capture`), which hands the finished file to the stage; there
 * is nothing to set or run afterwards, so these specs only shape the result: the verdict, the
 * preview of the recording, and the usual next step with the file handed on.
 */
type NoOptions = Record<string, never>;

// Short titles that name the outcome; the length, size and format are on the file and meta lines.
const recorded = (title: string): ResultVerdict => ({
  title,
  // A recording has no "before": the line gives its own facts and size.
  before: false,
  change: false,
});

const base = {
  verb: "Record",
  Panel: () => null,
  defaults: () => ({}) as NoOptions,
  // One recording at a time; files are never dropped here.
  batch: false as const,
  previewResult: true as const,
  // The recording is the only file: nothing to compare it with (ADR-0134).
  compare: false as const,
};

export const screenRecordSpec: OptionsSpec<NoOptions> = {
  ...base,
  nextStep: { slug: "trim-video", label: "Trim the recording" },
  result: () => recorded("Screen recorded"),
};

export const webcamRecordSpec: OptionsSpec<NoOptions> = {
  ...base,
  nextStep: { slug: "trim-video", label: "Trim the recording" },
  result: () => recorded("Video recorded"),
};

export const audioRecordSpec: OptionsSpec<NoOptions> = {
  ...base,
  Hero: AudioHero,
  result: (_v, info) => {
    const from = info.container === "opus" ? "opus" : info.container === "wav" ? "wav" : "m4a";
    return {
      ...recorded("Voice recorded"),
      next: { slug: `${from}-to-mp3`, label: "Convert it to MP3" },
    };
  },
};
