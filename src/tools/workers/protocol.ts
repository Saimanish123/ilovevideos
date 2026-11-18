import type { EngineErrorCode } from "@/tools/engines/errors";
import type { MediaInfo, Progress } from "@/tools/engines/types";
import type { EngineId } from "@/tools/registry/schema";

/**
 * Messages between the page and the engine worker. Files cross as File objects, and so do results:
 * a Blob is passed by reference (an OPFS-backed output is never read into memory to cross).
 */
export type ToWorker =
  /** `keyframes` also lists key frame timestamps into `info.video.keyframes` (split). */
  | { type: "inspect"; id: number; file: File; keyframes?: boolean }
  | {
      type: "run";
      id: number;
      engineId: EngineId;
      file: File;
      info?: MediaInfo;
      options: unknown;
      /**
       * Multi-input runs (merge, and later the batch queue): every input in order. When present it
       * supersedes `file`/`info`, which then repeat `inputs[0]`.
       */
      inputs?: WorkerInput[];
    }
  | { type: "cancel"; id: number }
  /** Removes this worker's outputs on disk (Start over); results already handed on stop reading. */
  | { type: "release"; id: number };

export interface WorkerInput {
  file: File;
  info?: MediaInfo;
}

/** One output file of a multi-output run (split). */
export interface WorkerOutputFile {
  blob: Blob;
  mime: string;
  filename: string;
  meta?: string;
}

export type FromWorker =
  | { type: "info"; id: number; info: MediaInfo }
  | { type: "progress"; id: number; progress: Progress }
  | {
      type: "done";
      id: number;
      blob: Blob;
      mime: string;
      filename: string;
      ffmpegCommand?: string;
      meta?: string;
      /** Every file of a multi-output run (split), in order; `files[0].blob` is `blob`. */
      files?: WorkerOutputFile[];
    }
  | { type: "error"; id: number; code: EngineErrorCode; message: string; hint?: string }
  | { type: "released"; id: number }
  /**
   * Sent once when the worker's module has finished evaluating and its message handler is set.
   * A message posted before that can be dropped (the module may finish evaluating after the
   * bootstrap script returns), so the client holds every message until this arrives.
   */
  | { type: "ready"; id: 0 };
