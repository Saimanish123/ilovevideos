/**
 * The person finder's own worker (ADR-0118): runs the model on small frames (ImageBitmaps at the
 * model's size) sent by the page's preview or by the engine worker, and returns each mask. The model files come from this
 * origin (./segmenter-assets); the frames never leave this worker and the page.
 */
import { MODELS, type ModelKind } from "@/tools/engines/portrait-matte/options";
import type { Segmenter } from "@/tools/engines/portrait-matte/segmenter";
import { createTfjsSegmenter } from "@/tools/engines/portrait-matte/tfjs";
import { announceReady } from "./ready";

export type ToSegment =
  | { type: "load"; kind: ModelKind }
  | { type: "segment"; id: number; frame: ImageBitmap };

export type FromSegment =
  | { type: "loaded"; width: number; height: number }
  | { type: "failed"; message: string }
  | { type: "mask"; id: number; mask: Float32Array; ms: number }
  | { type: "error"; id: number; message: string };

let segmenter: Promise<Segmenter> | undefined;

const post = (m: FromSegment, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage: (m: FromSegment, t: Transferable[]) => void }).postMessage(
    m,
    transfer,
  );

self.onmessage = async (event: MessageEvent<ToSegment>) => {
  const msg = event.data;
  if (msg.type === "load") {
    segmenter ??= createTfjsSegmenter(msg.kind, MODELS[msg.kind]);
    try {
      const s = await segmenter;
      post({ type: "loaded", width: s.width, height: s.height });
    } catch (e) {
      segmenter = undefined;
      post({ type: "failed", message: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  if (msg.type === "segment") {
    try {
      const s = await segmenter;
      if (!s) throw new Error("The person finder is not loaded.");
      const t0 = performance.now();
      const mask = await s.segment(msg.frame);
      post({ type: "mask", id: msg.id, mask, ms: performance.now() - t0 }, [mask.buffer]);
    } catch (e) {
      post({ type: "error", id: msg.id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      msg.frame.close();
    }
  }
};

announceReady();
