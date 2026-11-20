"use client";

import { type ComponentProps, lazy, Suspense } from "react";
import type { RowControls as Controls } from "./row-controls";

const Live = lazy(() => import("./row-controls").then((m) => ({ default: m.RowControls })));

/**
 * The home rows' controls as their own chunk (ADR-0140). Every page prefetches home through the
 * header's link, and that loaded the home route's client chunk on every hub and tool page; the
 * controls are an overlay that moves nothing, so they can arrive after the page is interactive.
 */
export function RowControlsLazy(props: ComponentProps<typeof Controls>) {
  return (
    <Suspense fallback={null}>
      <Live {...props} />
    </Suspense>
  );
}
