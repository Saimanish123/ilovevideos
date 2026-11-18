"use client";

import { CropIdle } from "@/components/tool/crop/idle";
import type { IdleProps, IdleSpec } from "../types";

/** Idle state of crop (types.ts `IdleSpec`); the remove-black-bars page (`bars`) has its own prompt. */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.bars === true
      ? "Drop a video to find and remove its black bars"
      : "Drop a video to crop it",
  Idle: ({ preset }: IdleProps) => (preset.bars === true ? null : <CropIdle />),
};
