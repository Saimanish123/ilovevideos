import type { ModelKind } from "@/tools/engines/portrait-matte/options";
import { isReady, READY_TIMEOUT_MS } from "./ready";
import type { FromSegment, ToSegment } from "./segment.worker";

/**
 * Page-side handle to the preview's person finder (./segment.worker). One per preview; `dispose()`
 * ends the worker and frees its WebGL context. Frames go in as small ImageBitmaps (transferred) and
 * masks come back as Float32Arrays; nothing leaves the device.
 */
export class SegmentClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (r: { mask: Float32Array; ms: number }) => void; reject: (e: Error) => void }
  >();
  private ready: Promise<void>;
  private loaded: Promise<{ width: number; height: number }> | undefined;
  private onLoaded: ((size: { width: number; height: number }) => void) | undefined;
  private onFailed: ((e: Error) => void) | undefined;

  constructor() {
    this.worker = new Worker(new URL("./segment.worker.ts", import.meta.url), { type: "module" });
    let ok: () => void = () => undefined;
    let fail: (e: Error) => void = () => undefined;
    this.ready = new Promise<void>((resolve, reject) => {
      ok = resolve;
      fail = reject;
    });
    // A worker that has run none of our code in time is not coming (ADR-0092).
    const timer = setTimeout(
      () => fail(new Error("The preview worker did not start.")),
      READY_TIMEOUT_MS * 4,
    );
    this.worker.onmessage = (event: MessageEvent<FromSegment>) => {
      if (isReady(event.data)) {
        clearTimeout(timer);
        ok();
        return;
      }
      const msg = event.data;
      if (msg.type === "loaded") this.onLoaded?.({ width: msg.width, height: msg.height });
      else if (msg.type === "failed") this.onFailed?.(new Error(msg.message));
      else {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.type === "mask") p.resolve({ mask: msg.mask, ms: msg.ms });
        else p.reject(new Error(msg.message));
      }
    };
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "The preview worker stopped.");
      fail(err);
      this.onFailed?.(err);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  /** Loads the model; resolves with its input size. */
  load(kind: ModelKind): Promise<{ width: number; height: number }> {
    this.loaded ??= new Promise((resolve, reject) => {
      this.onLoaded = resolve;
      this.onFailed = reject;
      void this.ready.then(
        () => this.worker.postMessage({ type: "load", kind } satisfies ToSegment),
        reject,
      );
    });
    return this.loaded;
  }

  /** The person mask for one frame at the model's size. The bitmap is transferred (and closed). */
  segment(frame: ImageBitmap): Promise<{ mask: Float32Array; ms: number }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "segment", id, frame } satisfies ToSegment, [frame]);
    });
  }

  dispose() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error("Closed."));
    this.pending.clear();
  }
}
