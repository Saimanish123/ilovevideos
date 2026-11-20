import type { EngineErrorCode } from "@/tools/engines/errors";
import type { MediaInfo, Progress } from "@/tools/engines/types";
import type { EngineId } from "@/tools/registry/schema";
import type { FromWorker, ToWorker, WorkerInput } from "./protocol";
import { READY_RETRIES, READY_TIMEOUT_MS } from "./ready";

export interface EngineFailure {
  code: EngineErrorCode;
  message: string;
  hint?: string;
  /** This browser cannot do the job (the engine's `supports()` said no); nothing ran (ADR-0147). */
  unsupported?: true;
}

export interface RunResultFile {
  blob: Blob;
  filename: string;
  meta?: string;
}

export interface RunResult {
  blob: Blob;
  filename: string;
  ffmpegCommand?: string;
  /** Output facts for the result line, e.g. "480×270 · 36 frames". */
  meta?: string;
  /** Every output file of a multi-output run (split); `files[0]` is `blob`. Absent otherwise. */
  files?: RunResultFile[];
}

/** Page-side handle to the engine worker. One per tool page; `dispose()` on unmount. */
export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: EngineFailure) => void;
      onProgress?: (p: Progress) => void;
    }
  >();

  /** Messages held until the worker says it is ready (protocol `ready`). */
  private queued: ToWorker[] | null = [];

  private readyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.worker = this.spawn(0);
  }

  /**
   * A new engine worker. One that has not said it is ready within `READY_TIMEOUT_MS` has run none
   * of our code (ADR-0092): it is replaced, and the held messages go to the one that answers.
   */
  private spawn(attempt: number): Worker {
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => this.receive(event);
    worker.onerror = (e) => this.crashed(e);
    if (attempt < READY_RETRIES)
      this.readyTimer = setTimeout(() => {
        if (!this.queued || this.worker !== worker) return;
        console.warn(`worker-not-ready: engine worker replaced (attempt ${attempt + 1})`);
        worker.terminate();
        this.worker = this.spawn(attempt + 1);
      }, READY_TIMEOUT_MS);
    return worker;
  }

  private receive(event: MessageEvent<FromWorker>) {
    const msg = event.data;
    if (msg.type === "ready") {
      if (this.readyTimer) clearTimeout(this.readyTimer);
      const held = this.queued ?? [];
      this.queued = null;
      for (const m of held) this.worker.postMessage(m);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(msg.progress);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.type === "info") p.resolve(msg.info);
    else if (msg.type === "checked") p.resolve(msg.failure);
    else if (msg.type === "released") p.resolve(undefined);
    else if (msg.type === "done") {
      // Blobs as the worker made them: a large output stays on disk (OPFS) until downloaded.
      const typed = (b: Blob, mime: string) =>
        b.type === mime ? b : new Blob([b], { type: mime });
      const files = msg.files?.map((f) => ({
        blob: typed(f.blob, f.mime),
        filename: f.filename,
        meta: f.meta,
      }));
      p.resolve({
        blob: files?.[0]?.blob ?? typed(msg.blob, msg.mime),
        filename: msg.filename,
        ffmpegCommand: msg.ffmpegCommand,
        meta: msg.meta,
        files,
      } satisfies RunResult);
    } else
      p.reject({
        code: msg.code,
        message: msg.message,
        hint: msg.hint,
        ...(msg.unsupported ? { unsupported: msg.unsupported } : {}),
      });
  }

  private crashed(e: ErrorEvent) {
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.reject({
        code: "internal",
        message: e.message || "The processing stopped unexpectedly.",
        hint: "Try again.",
      });
    }
  }

  private send(msg: ToWorker) {
    if (this.queued) this.queued.push(msg);
    else this.worker.postMessage(msg);
  }

  /** `keyframes: true` also lists key frame timestamps into `info.video.keyframes`. */
  inspect(file: File, opts: { keyframes?: boolean } = {}): Promise<MediaInfo> {
    const id = this.nextId++;
    return new Promise<MediaInfo>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as MediaInfo), reject });
      this.send({ type: "inspect", id, file, keyframes: opts.keyframes });
    });
  }

  /**
   * Whether this browser can run the job as set, without running it (ADR-0147): undefined when it
   * can, else the failure the run would give.
   */
  check(
    engineId: EngineId,
    inputs: WorkerInput[],
    options: unknown,
  ): Promise<EngineFailure | undefined> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as EngineFailure | undefined), reject });
      this.send({ type: "check", id, engineId, options, inputs });
    });
  }

  run(
    engineId: EngineId,
    file: File,
    options: unknown,
    opts: { info?: MediaInfo; signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
  ): Promise<RunResult> {
    return this.runMany(engineId, [{ file, info: opts.info }], options, opts, false);
  }

  /**
   * Runs one engine over several inputs in the given order (merge). Built so a batch queue can
   * reuse the same message shape later; for one input it is exactly `run`.
   */
  runMany(
    engineId: EngineId,
    inputs: WorkerInput[],
    options: unknown,
    opts: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
    multi = true,
  ): Promise<RunResult> {
    const first = inputs[0];
    if (!first)
      return Promise.reject({ code: "internal", message: "No input file." } as EngineFailure);
    const id = this.nextId++;
    return new Promise<RunResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as RunResult),
        reject,
        onProgress: opts.onProgress,
      });
      opts.signal?.addEventListener("abort", () => this.send({ type: "cancel", id }), {
        once: true,
      });
      this.send({
        type: "run",
        id,
        engineId,
        file: first.file,
        info: first.info,
        options,
        inputs: multi ? inputs : undefined,
      });
    });
  }

  /**
   * Removes the outputs this page's worker wrote to disk (OPFS). Call on Start over, once no result
   * Blob is needed any more; closing or reloading the page has the next page remove them.
   */
  releaseOutputs(): Promise<void> {
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve: () => resolve(), reject });
      this.send({ type: "release", id });
    });
  }

  dispose() {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.worker.terminate();
    this.pending.clear();
  }
}
