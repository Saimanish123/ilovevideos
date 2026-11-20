/**
 * Face finding on one picture with YuNet on the vision kit: which passes to run (the plan, pure),
 * running them on the GPU, and merging what they find. Measured on NASA crew portraits (public
 * domain) placed at known sizes, with onnxruntime as a stand-in for the kit (parity in
 * tests/e2e/vision.spec.ts):
 * - One pass over the whole picture at 640 px on its long side finds faces from about 12 px (at
 *   that size) up to the whole frame: 41 of 41 faces from 24 px tall in 720p, and 900 px faces in a
 *   1080×1080 frame, with no smaller second pass needed.
 * - Pictures over 960 px add tiles of 640×640 at full resolution, overlapping by 160 px: at 1080p,
 *   faces 12 to 30 px tall go from 0–34 of 41 found to 41 of 41. A face cut by a tile's inner
 *   edge is dropped from that tile (the neighbouring tile or the whole pass holds all of it).
 * - Score threshold 0.6 (OpenCV's demo uses 0.9, built for precision; hiding faces needs recall):
 *   about one stray box per five frames, which tracking drops (./track).
 */
import { createGlNet, type GlNet, type InputSpec, visionContext } from "./gl-net";
import type { ModelFile } from "./model-file";
import { BOX_OUTPUTS, decodeYunet, type FaceBox, nms, padTo } from "./yunet";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One run of the network: a part of the picture at a scale, padded to a multiple of 32. */
export interface Pass {
  rect: Rect;
  /** Network pixels per picture pixel. */
  scale: number;
  contentWidth: number;
  contentHeight: number;
  width: number;
  height: number;
  /** A tile (not the whole picture): faces touching its inner edges are dropped. */
  tile: boolean;
}

export interface PlanOptions {
  /** Long side of the whole-picture pass. */
  longSide: number;
  /** Add full-resolution tiles to pictures larger than `tileAbove` on their long side. */
  tiles: boolean;
  tileAbove: number;
  tile: number;
  overlap: number;
}

export const DEFAULT_PLAN: PlanOptions = {
  longSide: 640,
  tiles: true,
  tileAbove: 960,
  tile: 640,
  overlap: 160,
};

/** The smallest tile kept at the right or bottom edge (narrower strips hold no whole face). */
const MIN_TILE = 64;

function pass(rect: Rect, scale: number, tile: boolean): Pass {
  const contentWidth = Math.max(1, Math.round(rect.width * scale));
  const contentHeight = Math.max(1, Math.round(rect.height * scale));
  return {
    rect,
    scale,
    contentWidth,
    contentHeight,
    width: padTo(contentWidth),
    height: padTo(contentHeight),
    tile,
  };
}

/** The passes for a `width`×`height` picture. */
export function planPasses(width: number, height: number, o: PlanOptions = DEFAULT_PLAN): Pass[] {
  const long = Math.max(width, height);
  const plan = [pass({ x: 0, y: 0, width, height }, Math.min(1, o.longSide / long), false)];
  if (!o.tiles || long <= o.tileAbove) return plan;
  const step = o.tile - o.overlap;
  for (let y = 0; y < Math.max(1, height - o.overlap); y += step)
    for (let x = 0; x < Math.max(1, width - o.overlap); x += step) {
      const w = Math.min(o.tile, width - x);
      const h = Math.min(o.tile, height - y);
      if (w < MIN_TILE || h < MIN_TILE) continue;
      plan.push(pass({ x, y, width: w, height: h }, 1, true));
    }
  return plan;
}

/**
 * Faces from every pass in picture pixels, merged: boxes mapped back, tile boxes touching an inner
 * tile edge (within 2 network pixels) dropped, then one NMS over all of them.
 */
export function mergePasses(
  found: { pass: Pass; faces: FaceBox[] }[],
  width: number,
  height: number,
  iouThreshold: number,
): FaceBox[] {
  const all: FaceBox[] = [];
  for (const { pass: p, faces } of found) {
    const m = 2 / p.scale;
    const r = p.rect;
    for (const f of faces) {
      const b: FaceBox = {
        x: f.x / p.scale + r.x,
        y: f.y / p.scale + r.y,
        width: f.width / p.scale,
        height: f.height / p.scale,
        score: f.score,
      };
      if (p.tile) {
        if (r.x > 0 && b.x < r.x + m) continue;
        if (r.y > 0 && b.y < r.y + m) continue;
        if (r.x + r.width < width && b.x + b.width > r.x + r.width - m) continue;
        if (r.y + r.height < height && b.y + b.height > r.y + r.height - m) continue;
      }
      all.push(b);
    }
  }
  return nms(all, iouThreshold, 5000, false);
}

export interface FaceDetectorOptions {
  /** Lowest face score kept (0 to 1). */
  threshold?: number;
  /** Overlap above which the weaker of two boxes is dropped. */
  nmsIou?: number;
  plan?: PlanOptions;
  /** A context to draw in; by default the detector makes its own. */
  gl?: WebGL2RenderingContext;
}

export interface FaceDetector {
  readonly precision: GlNet["precision"];
  /** Faces in a picture, in its pixels, best first. */
  detect(source: TexImageSource, width: number, height: number): FaceBox[];
  /** The passes the last `detect` ran (for progress and timing). */
  readonly lastPasses: number;
  dispose(): void;
}

export const DEFAULT_THRESHOLD = 0.6;
export const DEFAULT_NMS_IOU = 0.3;

/** YuNet's input: BGR, 0 to 255, as OpenCV feeds it. */
const YUNET_INPUT: Pick<InputSpec, "scale" | "bias" | "order"> = {
  scale: [255, 255, 255],
  bias: [0, 0, 0],
  order: "bgr",
};

export function createFaceDetector(model: ModelFile, o: FaceDetectorOptions = {}): FaceDetector {
  const gl = o.gl ?? visionContext();
  const net = createGlNet(gl, model);
  const threshold = o.threshold ?? DEFAULT_THRESHOLD;
  const nmsIou = o.nmsIou ?? DEFAULT_NMS_IOU;
  let lastPasses = 0;
  return {
    precision: net.precision,
    get lastPasses() {
      return lastPasses;
    },
    detect(source, width, height) {
      const passes = planPasses(width, height, o.plan ?? DEFAULT_PLAN);
      lastPasses = passes.length;
      const found = passes.map((p, i) => {
        const outs = net.run(
          {
            source,
            sameSource: i > 0,
            sourceWidth: width,
            sourceHeight: height,
            rect: p.rect,
            width: p.width,
            height: p.height,
            contentWidth: p.contentWidth,
            contentHeight: p.contentHeight,
            ...YUNET_INPUT,
          },
          BOX_OUTPUTS,
        );
        const faces = decodeYunet(
          (n) => outs.get(n)?.data ?? new Float32Array(),
          p.width,
          p.height,
          threshold,
        );
        return { pass: p, faces: nms(faces, nmsIou) };
      });
      return mergePasses(found, width, height, nmsIou);
    },
    dispose() {
      net.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
