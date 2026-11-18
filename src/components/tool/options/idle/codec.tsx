"use client";

import type { IdleSpec } from "../types";

const names: Record<string, string> = { avc: "H.264", hevc: "HEVC", vp9: "VP9", av1: "AV1" };

/** Idle state of the codec pages (types.ts `IdleSpec`): the prompt names the page's target. */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    const to = typeof preset.codec === "string" ? names[preset.codec] : undefined;
    return to ? `Drop a video to re-encode it as ${to}` : "Drop a video to change its codec";
  },
  several: "batch",
};
