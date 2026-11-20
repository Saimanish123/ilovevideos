import type { SoundAnalysis } from "@/tools/engines/sound/analyze";
import { startWorker } from "./ready";
import type { FromAnalysis, ToAnalysis } from "./sound-analysis.worker";

export interface AnalysisFailure {
  code: string;
  message: string;
  hint?: string;
}

/**
 * Measures a file's sound in a dedicated worker (loudness, true peak and, with `levels`, the level
 * every 10 ms). The worker is terminated when the measurement ends or `signal` aborts, so nothing
 * keeps decoding in the background. Rejects with an `AnalysisFailure`.
 */
export function analyzeInWorker(
  file: Blob,
  name: string,
  opts: {
    levels?: boolean;
    truePeak?: boolean;
    /** Also read where there is speech (Silero VAD, loaded in the worker). */
    speech?: boolean;
    signal?: AbortSignal;
    onProgress?: (ratio: number) => void;
  } = {},
): Promise<SoundAnalysis> {
  return new Promise((resolve, reject) => {
    // The worker is started below; until then there is nothing to stop.
    let started: { terminate(): void } | undefined;
    const stop = () => started?.terminate();
    opts.signal?.addEventListener(
      "abort",
      () => {
        stop();
        reject({ code: "cancelled", message: "Cancelled." } satisfies AnalysisFailure);
      },
      { once: true },
    );
    const onMessage = (event: MessageEvent<FromAnalysis>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        opts.onProgress?.(msg.ratio);
        return;
      }
      stop();
      if (msg.type === "done") resolve(msg.result);
      else
        reject({ code: msg.code, message: msg.message, hint: msg.hint } satisfies AnalysisFailure);
    };
    // Started once ready, replaced if it never says so (./ready).
    started = startWorker(
      () => new Worker(new URL("./sound-analysis.worker.ts", import.meta.url), { type: "module" }),
      {
        type: "analyze",
        id: 1,
        file,
        name,
        levels: opts.levels === true,
        truePeak: opts.truePeak !== false,
        speech: opts.speech === true,
      } satisfies ToAnalysis,
      onMessage,
      (e) => {
        stop();
        reject({ code: "internal", message: e.message || "The analysis stopped." });
      },
    );
  });
}
