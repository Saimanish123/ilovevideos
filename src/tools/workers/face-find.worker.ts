/**
 * Find faces worker (ADR-0113): samples a video's frames, finds the faces on each with YuNet on our
 * WebGL 2 kit (engines/vision) and returns them, in display pixels, for the page to track and turn
 * into blur regions. Runs in its own worker with its own GL context; the page ends it to cancel,
 * which frees the decoder and the GPU at once. The only network access is our own model file under
 * /models/ (README.md#privacy-and-processing §2); the video never leaves the worker.
 */
import { CanvasSink } from "mediabunny";
import { classifyError, EngineError } from "@/tools/engines/errors";
import { openInput } from "@/tools/engines/mediabunny/shared";
import { createFaceDetector } from "@/tools/engines/vision/faces";
import { VisionError } from "@/tools/engines/vision/gl-net";
import { readModelFile } from "@/tools/engines/vision/model-file";
import { type SampleFaces, sampleCuts } from "@/tools/engines/vision/track";
import { announceReady } from "./ready";

/** The model, self-hosted (public/models/yunet; MIT, OpenCV zoo, converted by scripts/vision). */
export const FACE_MODEL_URL = "/models/yunet/yunet-2026may.vnn";
/** Frames are read at most this large on their long side (faces down to about 12 px of it). */
export const MAX_DECODE_SIDE = 1920;

export type ToFaces = {
  type: "find";
  id: number;
  file: Blob;
  name: string;
  durationSec: number;
  startSec: number;
  /** Display size (rotation applied), the space regions are drawn in. */
  width: number;
  height: number;
  /** Frames looked at per second of video. */
  sampleFps: number;
};

export interface FaceFindResult {
  samples: SampleFaces[];
  sampleSec: number;
  /** Sample times where the picture changes completely (a new shot): tracks end there. */
  cuts: number[];
  /** The size frames were read at, and the network passes per frame. */
  readWidth: number;
  readHeight: number;
  passes: number;
  /** Wall time of the whole search and of the detector alone per frame, in ms. */
  totalMs: number;
  detectMs: number;
  precision: string;
}

/** Known ways a search fails, for the page's own copy (`model` the file, `gpu` mid-search). */
export type FaceFailure = "model" | "graphics" | "gpu" | "decode";

export type FromFaces =
  | { type: "progress"; id: number; phase: "loading" | "finding"; done: number; total: number }
  | { type: "done"; id: number; result: FaceFindResult }
  | {
      type: "error";
      id: number;
      code: string;
      message: string;
      hint?: string;
      reason?: FaceFailure;
    };

/** An engine error that also says which known failure it is. */
class FindError extends EngineError {
  constructor(
    readonly reason: FaceFailure,
    code: ConstructorParameters<typeof EngineError>[0],
    message: string,
    hint?: string,
  ) {
    super(code, message, hint);
  }
}

const post = (msg: FromFaces) =>
  (self as unknown as { postMessage: (m: FromFaces) => void }).postMessage(msg);

async function loadModel() {
  const r = await fetch(FACE_MODEL_URL); // privacy-allow: our own model file under /models, same origin, no user data
  if (!r.ok)
    throw new FindError(
      "model",
      "resource",
      `The face finder could not be loaded (${r.status}).`,
      "Check the connection and try again.",
    );
  return readModelFile(await r.arrayBuffer());
}

async function find(msg: ToFaces): Promise<FaceFindResult> {
  const started = performance.now();
  post({ type: "progress", id: msg.id, phase: "loading", done: 0, total: 1 });
  const model = await loadModel();
  let detector: ReturnType<typeof createFaceDetector>;
  try {
    detector = createFaceDetector(model);
  } catch (e) {
    if (e instanceof VisionError)
      throw new FindError(
        "graphics",
        "unsupported-output",
        e.code === "no-float-targets"
          ? "This browser's graphics cannot run the face finder."
          : "This browser cannot run the face finder.",
        "Draw the regions by hand, or try a recent Chrome or Edge on a computer.",
      );
    throw e;
  }
  const input = openInput(msg.file as File);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new EngineError("unsupported-input", "This file has no video track.");
    if (!(await track.canDecode()))
      throw new FindError(
        "decode",
        "unsupported-input",
        "This browser cannot decode this video's picture.",
        "Convert it to MP4 first, then find faces.",
      );
    const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(msg.width, msg.height));
    const readWidth = Math.max(2, Math.round(msg.width * scale));
    const readHeight = Math.max(2, Math.round(msg.height * scale));
    const sink = new CanvasSink(track, {
      width: readWidth,
      height: readHeight,
      fit: "fill",
      poolSize: 1,
    });
    const first = await track.getFirstTimestamp();
    const step = 1 / msg.sampleFps;
    const count = Math.max(1, Math.floor(msg.durationSec / step + 1e-6) + 1);
    const times = Array.from({ length: count }, (_, i) =>
      Math.min(i * step, Math.max(0, msg.durationSec - 0.001)),
    );
    const back = 1 / scale;
    const samples: SampleFaces[] = [];
    // A 32×18 grey copy of each sample, to find cuts between shots (vision/track `sampleCuts`).
    const thumb = new OffscreenCanvas(32, 18);
    const t2d = thumb.getContext("2d", { willReadFrequently: true });
    let prevGrey: Float32Array | undefined;
    const diffs: { t: number; d: number }[] = [];
    let detectMs = 0;
    let last = 0;
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(
      times.map((t) => Math.max(first, t + msg.startSec)),
    )) {
      const t = times[i] ?? 0;
      i++;
      if (wrapped) {
        const t0 = performance.now();
        let faces: ReturnType<typeof detector.detect>;
        try {
          faces = detector.detect(
            wrapped.canvas as OffscreenCanvas,
            wrapped.canvas.width,
            wrapped.canvas.height,
          );
        } catch (e) {
          if (e instanceof VisionError)
            throw new FindError(
              "gpu",
              "resource",
              "The graphics chip stopped the face search.",
              "Try again, or close other tabs that use graphics.",
            );
          throw e;
        }
        detectMs += performance.now() - t0;
        if (t2d) {
          t2d.drawImage(wrapped.canvas, 0, 0, 32, 18);
          const px = t2d.getImageData(0, 0, 32, 18).data;
          const grey = new Float32Array(32 * 18);
          for (let k = 0; k < grey.length; k++)
            grey[k] =
              0.299 * (px[k * 4] ?? 0) +
              0.587 * (px[k * 4 + 1] ?? 0) +
              0.114 * (px[k * 4 + 2] ?? 0);
          if (prevGrey) {
            let d = 0;
            for (let k = 0; k < grey.length; k++)
              d += Math.abs((grey[k] ?? 0) - (prevGrey[k] ?? 0));
            diffs.push({ t, d: d / grey.length });
          }
          prevGrey = grey;
        }
        samples.push({
          t,
          faces: faces.map((f) => ({
            x: f.x * back,
            y: f.y * back,
            width: f.width * back,
            height: f.height * back,
            score: f.score,
          })),
        });
      }
      const now = performance.now();
      if (now - last > 100 || i === count) {
        last = now;
        post({ type: "progress", id: msg.id, phase: "finding", done: i, total: count });
      }
    }
    return {
      samples,
      sampleSec: step,
      cuts: sampleCuts(diffs),
      readWidth,
      readHeight,
      passes: detector.lastPasses,
      totalMs: performance.now() - started,
      detectMs: samples.length ? detectMs / samples.length : 0,
      precision: detector.precision,
    };
  } finally {
    input.dispose();
    detector.dispose();
  }
}

self.onmessage = async (event: MessageEvent<ToFaces>) => {
  const msg = event.data;
  if (msg.type !== "find") return;
  try {
    post({ type: "done", id: msg.id, result: await find(msg) });
  } catch (e) {
    const err = classifyError(e);
    post({
      type: "error",
      id: msg.id,
      code: err.code,
      message: err.message,
      hint: err.hint,
      reason: e instanceof FindError ? e.reason : undefined,
    });
  }
};

announceReady();
