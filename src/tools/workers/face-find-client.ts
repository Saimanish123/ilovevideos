import type { FaceFailure, FaceFindResult, FromFaces, ToFaces } from "./face-find.worker";
import { startWorker } from "./ready";
import type { AnalysisFailure } from "./sound-analysis-client";

export type { FaceFailure, FaceFindResult };

/** A failed search: the worker's code and, where known, which failure it was. */
export type FaceFindFailure = AnalysisFailure & { reason?: FaceFailure };

export interface FaceFindProgress {
  phase: "loading" | "finding";
  done: number;
  total: number;
}

/**
 * Finds the faces on a video's sampled frames in a dedicated worker (./face-find.worker). The
 * worker is terminated when the search ends or `signal` aborts, which frees its decoder and GPU
 * context at once. Rejects with a `FaceFindFailure`.
 */
export function findFacesInWorker(
  file: Blob,
  name: string,
  opts: Omit<ToFaces, "type" | "id" | "file" | "name"> & {
    signal?: AbortSignal;
    onProgress?: (p: FaceFindProgress) => void;
  },
): Promise<FaceFindResult> {
  const { signal, onProgress, ...job } = opts;
  return new Promise((resolve, reject) => {
    let started: { terminate(): void } | undefined;
    const stop = () => started?.terminate();
    if (signal?.aborted) {
      reject({ code: "cancelled", message: "Cancelled." } satisfies AnalysisFailure);
      return;
    }
    signal?.addEventListener(
      "abort",
      () => {
        stop();
        reject({ code: "cancelled", message: "Cancelled." } satisfies AnalysisFailure);
      },
      { once: true },
    );
    const onMessage = (event: MessageEvent<FromFaces>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        onProgress?.({ phase: msg.phase, done: msg.done, total: msg.total });
        return;
      }
      stop();
      if (msg.type === "done") resolve(msg.result);
      else
        reject({
          code: msg.code,
          message: msg.message,
          hint: msg.hint,
          reason: msg.reason,
        } satisfies FaceFindFailure);
    };
    started = startWorker(
      () => new Worker(new URL("./face-find.worker.ts", import.meta.url), { type: "module" }),
      { type: "find", id: 1, file, name, ...job } satisfies ToFaces,
      onMessage,
      (e) => {
        stop();
        reject({ code: "internal", message: e.message || "The face search stopped." });
      },
    );
  });
}
