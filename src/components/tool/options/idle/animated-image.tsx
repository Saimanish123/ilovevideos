"use client";

import type { IdleSpec } from "../types";

const names: Record<string, string> = { webp: "WebP", apng: "APNG", avif: "AVIF" };

/** Idle state of the animated WebP, APNG and AVIF pages (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    `Drop a video to make an animated ${names[String(preset.format)] ?? "image"} from it`,
};
