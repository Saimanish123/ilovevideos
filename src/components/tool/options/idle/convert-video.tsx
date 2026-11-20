"use client";

import type { FormatId } from "@/content/formats";
import { formatNames } from "@/content/formats/names";
import type { IdleSpec } from "../types";

/** "an AVI", "a MOV", "a 3GP": by how the name is spoken (letters, except MOV, which is said as a word). */
export const article = (name: string) =>
  name !== "MOV" && /^[AEFHILMNORSX]/.test(name) ? `an ${name}` : `a ${name}`;

/** The source format a pair page names (`mov` for MOV to MP4), from the light names table. */
export const sourceName = (preset: Record<string, unknown>) =>
  typeof preset.from === "string" && preset.from in formatNames
    ? formatNames[preset.from as FormatId]
    : undefined;

/** Idle state of the video converter and its pairs (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    const from = sourceName(preset);
    return from ? `Drop ${article(from)} file` : "Drop a video to convert it";
  },
  several: "batch",
};
