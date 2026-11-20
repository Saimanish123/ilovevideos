/**
 * YuNet's outputs to face boxes: the decoding and non-maximum suppression of OpenCV's
 * `FaceDetectorYN` (objdetect/src/face_detect.cpp), in TypeScript. Pure; checked against OpenCV's
 * own detections in tests/unit/vision-yunet.test.ts.
 *
 * The network runs on a picture padded with zeros on the right and bottom to a multiple of 32. At
 * each stride (8, 16, 32) every grid cell predicts a class score and an objectness (both through a
 * sigmoid), a box (centre offset in cells, log width and height in cells) and five landmarks. The
 * face score is the geometric mean of the two scores, clamped to 0..1.
 */

export const STRIDES = [8, 16, 32] as const;

/** The outputs the boxes need (landmarks are not read). */
export const BOX_OUTPUTS = STRIDES.flatMap((s) => [`cls_${s}`, `obj_${s}`, `bbox_${s}`]);
export const LANDMARK_OUTPUTS = STRIDES.map((s) => `kps_${s}`);

/** OpenCV pads YuNet's input to this multiple. */
export const PAD_MULTIPLE = 32;
export const padTo = (n: number) => Math.ceil(n / PAD_MULTIPLE) * PAD_MULTIPLE;

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  /** Right eye, left eye, nose tip, right and left mouth corners (x, y each), when decoded. */
  landmarks?: number[];
}

/** Decodes every cell scoring at least `threshold`, in the network's pixels (before NMS). */
export function decodeYunet(
  get: (name: string) => Float32Array,
  padWidth: number,
  padHeight: number,
  threshold: number,
  landmarks = false,
): FaceBox[] {
  const faces: FaceBox[] = [];
  for (const s of STRIDES) {
    const cols = Math.floor(padWidth / s);
    const rows = Math.floor(padHeight / s);
    const cls = get(`cls_${s}`);
    const obj = get(`obj_${s}`);
    const box = get(`bbox_${s}`);
    const kps = landmarks ? get(`kps_${s}`) : undefined;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const cs = Math.min(1, Math.max(0, cls[i] ?? 0));
        const os = Math.min(1, Math.max(0, obj[i] ?? 0));
        const score = Math.sqrt(cs * os);
        if (score < threshold) continue;
        const cx = (c + (box[i * 4] ?? 0)) * s;
        const cy = (r + (box[i * 4 + 1] ?? 0)) * s;
        const w = Math.exp(box[i * 4 + 2] ?? 0) * s;
        const h = Math.exp(box[i * 4 + 3] ?? 0) * s;
        const face: FaceBox = { x: cx - w / 2, y: cy - h / 2, width: w, height: h, score };
        if (kps) {
          face.landmarks = [];
          for (let n = 0; n < 5; n++)
            face.landmarks.push(
              ((kps[i * 10 + 2 * n] ?? 0) + c) * s,
              ((kps[i * 10 + 2 * n + 1] ?? 0) + r) * s,
            );
        }
        faces.push(face);
      }
  }
  return faces;
}

type Box = Pick<FaceBox, "x" | "y" | "width" | "height">;

/** Intersection over union of two boxes. */
export function iou(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** OpenCV's `Rect2i(int(x), int(y), int(w), int(h))`: truncated toward zero. */
const toIntRect = (b: Box): Box => ({
  x: Math.trunc(b.x),
  y: Math.trunc(b.y),
  width: Math.trunc(b.width),
  height: Math.trunc(b.height),
});

/**
 * Greedy non-maximum suppression as OpenCV's `dnn::NMSBoxes` (eta 1): highest score first (ties in
 * input order), a box is kept when its overlap with every kept box is at most `iouThreshold`.
 * `integer` compares truncated rectangles, as `FaceDetectorYN` does; the boxes returned are the
 * originals.
 */
export function nms<T extends FaceBox>(
  faces: T[],
  iouThreshold: number,
  topK = 5000,
  integer = true,
): T[] {
  const order = faces
    .map((f, i) => ({ f, i, r: integer ? toIntRect(f) : f }))
    .sort((a, b) => b.f.score - a.f.score || a.i - b.i)
    .slice(0, topK > 0 ? topK : undefined);
  const kept: typeof order = [];
  for (const cand of order) {
    if (kept.every((k) => iou(cand.r, k.r) <= iouThreshold)) kept.push(cand);
  }
  return kept.map((k) => k.f);
}
