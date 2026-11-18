"use client";

import { type ComponentType, lazy, Suspense } from "react";
import type { CaptureProps } from "../options/types";

/**
 * A recorder for `IdleSpec.Capture` that keeps its code out of the idle chunk every tool page loads
 * (ADR-0104): the idle modules of all engines share one chunk, so the recorder's own UI is a lazy
 * component loaded only on its page. The page is prerendered with the recorder in it, so the
 * first paint is the full recorder; hydration waits for its chunk and nothing is replaced. On a
 * client-side navigation the fallback holds the workspace's place for the few milliseconds the
 * chunk takes.
 */
export function lazyCapture(
  load: () => Promise<ComponentType<CaptureProps>>,
): ComponentType<CaptureProps> {
  const Recorder = lazy(() => load().then((C) => ({ default: C })));
  return function LazyCapture(props: CaptureProps) {
    return (
      <Suspense fallback={<Holding />}>
        <Recorder {...props} />
      </Suspense>
    );
  };
}

function Holding() {
  return (
    <section
      aria-label="Workspace"
      aria-busy="true"
      className="relative mx-auto min-h-(--stage-min-h) w-full max-w-(--container-content) rounded-lg border border-border bg-bg-raised p-6 md:min-h-80"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_var(--container-panel)]">
        <div className="aspect-video w-full rounded-lg bg-bg-stage" />
      </div>
    </section>
  );
}
