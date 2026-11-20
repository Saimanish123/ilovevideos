/**
 * The person finder behind the background tools, as a small interface so the runtime can change
 * (ADR-0118: TensorFlow.js now; our own WebGL 2 inference later) without touching the matte or the
 * pages. The model itself always runs in its own worker (../../workers/segment.worker): the page's
 * preview talks to one, and the engine worker starts one of its own, so loading and compiling the
 * model (a second or more, in one piece) never stops the engine worker from hearing Cancel.
 */
import { SegmentClient } from "../../workers/segment-client";
import type { ModelKind } from "./options";

export interface Segmenter {
  readonly kind: ModelKind;
  /** The model's input size; `segment` takes a picture of exactly this size. */
  readonly width: number;
  readonly height: number;
  /**
   * The chance (0 to 1) that each pixel of `input` shows a person, row by row, `width`×`height`.
   * `input` is the frame scaled to the model's size (./masks `modelInput`).
   */
  segment(input: ImageBitmap | OffscreenCanvas): Promise<Float32Array>;
  dispose(): void;
}

/** A segmenter whose model runs in a worker of its own, started from here. */
export async function createWorkerSegmenter(kind: ModelKind): Promise<Segmenter> {
  const client = new SegmentClient();
  try {
    const { width, height } = await client.load(kind);
    return {
      kind,
      width,
      height,
      async segment(input) {
        const frame = "transferToImageBitmap" in input ? input.transferToImageBitmap() : input;
        return (await client.segment(frame)).mask;
      },
      dispose: () => client.dispose(),
    };
  } catch (e) {
    client.dispose();
    throw e;
  }
}
