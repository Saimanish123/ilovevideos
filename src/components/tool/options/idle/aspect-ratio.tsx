"use client";

import dynamic from "next/dynamic";
import { framePlatformName } from "@/content/platforms/frame-names";
import { type AspectRatioId, aspectRatioIds } from "@/tools/engines/aspect-ratio/ratios";
import type { IdleSpec } from "../types";

export const isRatio = (v: unknown): v is AspectRatioId =>
  typeof v === "string" && (aspectRatioIds as readonly string[]).includes(v);

/** Idle state of change aspect ratio and resize for a platform (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    const name = framePlatformName(preset.platform);
    if (name) return `Drop a video to resize it for ${name}`;
    return isRatio(preset.ratio)
      ? `Drop a video to make it ${preset.ratio}`
      : "Drop a video to reshape it";
  },
  // The shape picker and platform frames load on these pages only, rendered in place (ADR-0140).
  Idle: dynamic(() => import("@/components/tool/crop/page-idle").then((m) => m.AspectPageIdle)),
};
