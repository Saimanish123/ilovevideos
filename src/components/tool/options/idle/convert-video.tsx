"use client";

import { formats } from "@/content/formats";
import type { IdleSpec } from "../types";

/** "an AVI", "a MOV", "a 3GP": by how the name is spoken (letters, except MOV, which is said as a word). */
export const article = (name: string) =>
  name !== "MOV" && /^[AEFHILMNORSX]/.test(name) ? `an ${name}` : `a ${name}`;

export const sourceProfile = (preset: Record<string, unknown>) =>
  typeof preset.from === "string" && preset.from in formats
    ? formats[preset.from as keyof typeof formats]
    : undefined;

/** Idle state of the video converter and its pairs (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    const from = sourceProfile(preset);
    return from ? `Drop ${article(from.name)} file` : "Drop a video to convert it";
  },
  several: "batch",
};
