"use client";

import type { IdleSpec } from "../types";

/** Idle state of the clips page (types.ts `IdleSpec`). One long video at a time: its clips sit on its timeline. */
export const idle: IdleSpec = {
  dropPrompt: () => "Drop a long video to cut it into clips",
};
