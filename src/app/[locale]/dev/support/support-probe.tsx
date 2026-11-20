"use client";

import { useEffect, useState } from "react";

/** Runs the probe on the page and in a worker; the JSON lands in `data-facts` for the test. */
export function SupportProbe() {
  const [facts, setFacts] = useState<string>();
  useEffect(() => {
    let worker: Worker | undefined;
    (async () => {
      const { probeSupport } = await import("@/lib/browser-support/probe");
      const page = await probeSupport();
      worker = new Worker(new URL("./probe.worker.ts", import.meta.url), { type: "module" });
      const inWorker = await new Promise<unknown>((resolve) => {
        if (!worker) return resolve(null);
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = () => resolve(null);
      });
      setFacts(JSON.stringify({ window: page, worker: inWorker }));
      // The fallback bench, for the test to call with a chosen file.
      const { bench } = await import("./fallback-bench");
      (window as unknown as { __bench: typeof bench }).__bench = bench;
    })().catch((e) => setFacts(JSON.stringify({ error: String(e) })));
    return () => worker?.terminate();
  }, []);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-h3">Browser support probe</h1>
      <input type="file" aria-label="Bench file" data-bench-file />
      <pre data-facts={facts ?? ""} className="whitespace-pre-wrap text-xs">
        {facts ?? "Measuring"}
      </pre>
    </main>
  );
}
