"use client";

import { lazyCapture } from "../../capture/lazy-capture";
import type { IdleSpec } from "../types";

/**
 * A recorder page: the idle workspace is the recorder (ADR-0099), loaded on this page only
 * (ADR-0104); its file opens as the result.
 */
export const idle: IdleSpec = {
  Capture: lazyCapture(() => import("../../capture/screen-capture").then((m) => m.ScreenCapture)),
};
