"use client";

import { useEffect, useState } from "react";

/** Loads the bench on the page and says when `window.__vision` is ready for the test. */
export function VisionBench() {
  const [state, setState] = useState("loading");
  useEffect(() => {
    import("./bench")
      .then((m) => {
        (window as unknown as { __vision: unknown }).__vision = m.bench;
        setState("ready");
      })
      .catch((e) => setState(`failed: ${String(e)}`));
  }, []);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl">Vision kit bench</h1>
      <p data-bench={state} className="text-fg-muted">
        {state}
      </p>
    </main>
  );
}
