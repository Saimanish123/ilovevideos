"use client";

import type { IdleSpec } from "../types";

/** Idle state of the fade page (types.ts `IdleSpec`). One file at a time: the fades sit on its timeline. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a video to fade it in and out",
};
