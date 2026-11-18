"use client";

import { lazy } from "react";

/**
 * The recording-time pieces of ./live, loaded when a recording is about to start rather
 * than with the page (ADR-0104): `preloadLive` runs with the encoder's preload on pointer-over or
 * focus of Start recording, so they are in place before the first frame is recorded.
 */
const live = () => import("./live");

export const preloadLive = () => {
  void live().catch(() => undefined);
};

export const LiveLine = lazy(() => live().then((m) => ({ default: m.LiveLine })));
export const RecordingControls = lazy(() => live().then((m) => ({ default: m.RecordingControls })));
export const DiscardButton = lazy(() => live().then((m) => ({ default: m.DiscardButton })));
export const LevelMeter = lazy(() => live().then((m) => ({ default: m.LevelMeter })));
