"use client";

import { AspectIdle } from "@/components/tool/crop/idle";
import { PlatformIdle } from "@/components/tool/crop/platform-idle";
import { getFramePlatform } from "@/content/platforms/frames";
import { type AspectRatioId, aspectRatioIds } from "@/tools/engines/aspect-ratio/ratios";
import type { IdleProps, IdleSpec } from "../types";

export const isRatio = (v: unknown): v is AspectRatioId =>
  typeof v === "string" && (aspectRatioIds as readonly string[]).includes(v);

function PageIdle(props: IdleProps) {
  const p = getFramePlatform(props.preset.platform);
  return p ? <PlatformIdle platform={p} {...props} /> : <AspectIdle {...props} />;
}

/** Idle state of change aspect ratio and resize for a platform (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) => {
    const p = getFramePlatform(preset.platform);
    if (p) return `Drop a video to resize it for ${p.name}`;
    return isRatio(preset.ratio)
      ? `Drop a video to make it ${preset.ratio}`
      : "Drop a video to reshape it";
  },
  Idle: PageIdle,
};
