"use client";

import { lazy } from "react";

/** The screen recorder's preview while recording and its notice for browsers without screen capture. */
const screen = () => import("./screen-live");

/** Fetched with the encoder on pointer-over or focus of Start recording (ADR-0104). */
export const preloadScreen = () => {
  void screen().catch(() => undefined);
  void import("./screen-start").catch(() => undefined);
};

export const ScreenPreview = lazy(() => screen().then((m) => ({ default: m.ScreenPreview })));
export const ScreenBlocked = lazy(() => screen().then((m) => ({ default: m.ScreenBlocked })));
