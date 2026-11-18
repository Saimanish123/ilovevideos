"use client";

import { lazy } from "react";

/** The voice recorder's live waveform, loaded with the encoder (ADR-0104). */
export const LiveWave = lazy(() => import("./wave").then((m) => ({ default: m.LiveWave })));
