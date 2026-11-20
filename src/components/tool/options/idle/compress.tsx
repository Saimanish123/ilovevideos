"use client";

import dynamic from "next/dynamic";
import { withUnit } from "@/lib/format";
import type { IdleProps, IdleSpec } from "../types";

export const mb = (n: number) => withUnit(n, "MB");

/**
 * A platform's tiers, loaded on the platform pages only (ADR-0140). Rendered in place on the server;
 * the page preloads its chunk, and with no Suspense boundary of its own nothing is swapped in later.
 */
const PlatformTierIdle = dynamic(() => import("../compress-tier").then((m) => m.PlatformTierIdle));

/** Before any file: the page's target stated, and a platform's tiers as the one choice to make. */
function CompressIdle(props: IdleProps) {
  if (props.preset.preset !== "target") return null;
  if (typeof props.preset.platform === "string") return <PlatformTierIdle {...props} />;
  // The prompt above already names the size.
  return <p className="text-sm">A file that is already small enough is left as it is.</p>;
}

/** Idle state of compress and its size and platform families (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.preset === "target"
      ? `Drop a video to fit it under ${mb((preset.targetMb as number) ?? 25)}`
      : "Drop a video to make it smaller",
  Idle: CompressIdle,
  several: "batch",
};
