"use client";

import type { IdleProps } from "@/components/tool/options/types";
import { getFramePlatform } from "@/content/platforms/frames";
import { AspectIdle } from "./idle";
import { PlatformIdle } from "./platform-idle";

/**
 * Change aspect ratio and the resize-for-a-platform pages, before a file: the platform's frame, or the
 * shape picker. Loaded on those pages only (`next/dynamic`, ADR-0140).
 */
export function AspectPageIdle(props: IdleProps) {
  const p = getFramePlatform(props.preset.platform);
  return p ? <PlatformIdle platform={p} {...props} /> : <AspectIdle {...props} />;
}
