import { startWorker } from "./ready";
import type { FromWaveform, ToWaveform } from "./waveform.worker";

export interface WaveformUpdate {
  /** Peak per bucket, 0–1. */
  peaks: Float32Array;
  /** Share of the file read so far. */
  ratio: number;
  done: boolean;
}

/**
 * Reads a file's waveform in a dedicated worker, reporting partial peaks as decoding advances.
 * Resolves to false when the file has no audio or this browser cannot decode it. The worker is
 * terminated when the read finishes or the signal aborts, so nothing keeps decoding in the background.
 */
export function readWaveform(
  file: File,
  buckets: number,
  onUpdate: (u: WaveformUpdate) => void,
  signal: AbortSignal,
): Promise<"done" | "no-audio" | "unreadable"> {
  return new Promise((resolve) => {
    let started: { terminate(): void } | undefined;
    const stop = () => started?.terminate();
    signal.addEventListener("abort", stop, { once: true });
    const onMessage = (event: MessageEvent<FromWaveform>) => {
      const msg = event.data;
      if (msg.type === "none") {
        stop();
        resolve(msg.reason);
        return;
      }
      onUpdate({ peaks: msg.peaks, ratio: msg.ratio, done: msg.done });
      if (msg.done) {
        stop();
        resolve("done");
      }
    };
    // Started once ready, replaced if it never says so (./ready).
    started = startWorker(
      () => new Worker(new URL("./waveform.worker.ts", import.meta.url), { type: "module" }),
      { type: "read", id: 1, file, buckets } satisfies ToWaveform,
      onMessage,
      () => {
        stop();
        resolve("unreadable");
      },
    );
  });
}
