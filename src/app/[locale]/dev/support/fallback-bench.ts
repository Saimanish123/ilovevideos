/**
 * Times one job on the native engine (the engine worker) and on its ffmpeg.wasm runner
 * (src/tools/engines/fallbacks.ts, ADR-0147) in this browser, for tests/e2e/capabilities.spec.ts.
 * Dev only.
 */
import { pageRunners } from "@/tools/engines/page-runners";
import type { EngineId } from "@/tools/registry/schema";
import { EngineClient } from "@/tools/workers/client";

export interface BenchResult {
  native?: { ms: number; bytes: number; error?: string };
  fallback: { ms: number; bytes: number; error?: string };
}

const noop = () => undefined;

export async function bench(engine: EngineId, file: File, options: unknown): Promise<BenchResult> {
  const client = new EngineClient();
  try {
    const info = await client.inspect(file);
    const ctx = { signal: new AbortController().signal, onProgress: noop };
    let native: BenchResult["native"];
    const t0 = performance.now();
    try {
      const r = await client.run(engine, file, options, { info, ...ctx });
      native = { ms: Math.round(performance.now() - t0), bytes: r.blob.size };
    } catch (e) {
      native = { ms: 0, bytes: 0, error: String((e as Error).message ?? e) };
    }
    const load = pageRunners[engine];
    if (!load) return { native, fallback: { ms: 0, bytes: 0, error: "no runner" } };
    const runner = await load();
    // The converter's one-time load is not part of the job's time: load it first.
    const { loadFFmpeg } = await import("@/tools/engines/ffmpeg");
    await loadFFmpeg();
    const t1 = performance.now();
    try {
      const r = await runner(file, info, options, ctx);
      return { native, fallback: { ms: Math.round(performance.now() - t1), bytes: r.blob.size } };
    } catch (e) {
      return {
        native,
        fallback: { ms: 0, bytes: 0, error: String((e as { message?: string }).message ?? e) },
      };
    }
  } finally {
    client.dispose();
  }
}
