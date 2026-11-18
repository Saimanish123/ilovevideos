"use client";

import { formatNames, type SubtitleFormat, subtitleFormats } from "@/tools/engines/subtitles/model";
import type { IdleSpec } from "../types";

export const isSubtitleFormat = (v: unknown): v is SubtitleFormat =>
  typeof v === "string" && (subtitleFormats as readonly string[]).includes(v);
export const an = (name: string) => (/^[AEFHILMNORSX]/.test(name) ? `an ${name}` : `a ${name}`);

/** Idle state of the subtitle converter and its jobs (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    if (preset.job === "shift") return "Drop a subtitle file to shift its timing";
    if (preset.job === "fix") return "Drop a subtitle file to fix its timing";
    if (preset.job === "fps") return "Drop a subtitle file to re-time it for another frame rate";
    if (isSubtitleFormat(preset.from) && isSubtitleFormat(preset.to))
      return `Drop ${an(formatNames[preset.from])} file to convert it to ${formatNames[preset.to]}`;
    return "Drop a subtitle file to convert it";
  },
  Idle: () => (
    <p className="text-fg-muted text-sm">
      SRT, WebVTT, ASS, SSA or SBV. Read as text on this device.
    </p>
  ),
  several: "batch",
};
