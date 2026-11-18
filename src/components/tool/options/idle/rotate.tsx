"use client";

import type { Flip } from "@/tools/engines/rotate/math";
import type { IdleSpec } from "../types";

export const isFlip = (v: unknown): v is Flip =>
  v === "none" || v === "horizontal" || v === "vertical";

/** Idle state of rotate and flip (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    isFlip(preset.flip) && preset.flip !== "none"
      ? "Drop a video to mirror it"
      : "Drop a video to turn it upright",
  several: "batch",
};
