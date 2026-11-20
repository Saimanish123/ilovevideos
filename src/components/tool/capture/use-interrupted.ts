"use client";

import { type ComponentType, useCallback, useEffect, useState } from "react";
import type { Interrupted } from "@/tools/engines/capture/find";
import type { CaptureKind } from "@/tools/engines/capture/plan";
import type { Captured } from "../options/types";

type OfferProps = { found: Interrupted; onRecovered: (c: Captured) => void; onDone: () => void };

/** The recorder kind of a recorder engine, or undefined for every other page. */
export function captureKindOf(engine: string): CaptureKind | undefined {
  return engine === "screen-record"
    ? "screen"
    : engine === "webcam-record"
      ? "webcam"
      : engine === "audio-record"
        ? "voice"
        : undefined;
}

/**
 * On a recorder page, the newest recording of its kind that was cut off by a closed or crashed tab
 * (ADR-0130), with the offer that recovers or discards it. Looks once, after the page loads (a few
 * file-system reads; the recovery code loads only on Recover). Never on other pages.
 */
export function useInterrupted(kind: CaptureKind | undefined) {
  const [found, setFound] = useState<{ it: Interrupted; Offer: ComponentType<OfferProps> }>();
  useEffect(() => {
    if (!kind) return;
    let live = true;
    void import("@/tools/engines/capture/find")
      .then((m) => m.findInterrupted(kind))
      .then(async (it) => {
        if (!it || !live) return;
        const { RecoveryOffer } = await import("./recovery");
        if (live) setFound({ it, Offer: RecoveryOffer });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kind]);
  const settle = useCallback(() => setFound(undefined), []);
  return { found, settle };
}
