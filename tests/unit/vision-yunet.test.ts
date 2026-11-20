import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readModelFile } from "@/tools/engines/vision/model-file";
import { decodeYunet, type FaceBox, iou, nms, padTo } from "@/tools/engines/vision/yunet";

/**
 * YuNet decoding and NMS against OpenCV's FaceDetectorYN on the same image: the onnxruntime
 * outputs for scikit-image's `astronaut` (tests/fixtures/vision, scripts/vision/make_references.py)
 * decoded here must give OpenCV's faces.
 */

const buf = readFileSync("tests/fixtures/vision/yunet-astronaut.f32");
const outs = readModelFile(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
);
const opencv = JSON.parse(readFileSync("tests/fixtures/vision/yunet-opencv.json", "utf8")) as {
  scoreThreshold: number;
  nmsThreshold: number;
  faces: { box: number[]; landmarks: number[]; score: number }[];
};

const face = (x: number, y: number, w: number, h: number, score: number): FaceBox => ({
  x,
  y,
  width: w,
  height: h,
  score,
});

describe("YuNet decoding", () => {
  it("pads to a multiple of 32", () => {
    expect([padTo(640), padTo(360), padTo(1), padTo(33)]).toEqual([640, 384, 32, 64]);
  });

  it("gives OpenCV's faces for the astronaut", () => {
    const all = decodeYunet((n) => outs.tensor(n), 512, 512, opencv.scoreThreshold, true);
    expect(all.length).toBeGreaterThan(1);
    const kept = nms(all, opencv.nmsThreshold);
    expect(kept).toHaveLength(opencv.faces.length);
    kept.forEach((f, i) => {
      const want = opencv.faces[i];
      if (!want) throw new Error("missing");
      const got = [f.x, f.y, f.width, f.height];
      got.forEach((v, j) => {
        expect(Math.abs(v - (want.box[j] ?? 0))).toBeLessThan(0.05);
      });
      f.landmarks?.forEach((v, j) => {
        expect(Math.abs(v - (want.landmarks[j] ?? 0))).toBeLessThan(0.05);
      });
      expect(Math.abs(f.score - want.score)).toBeLessThan(1e-3);
    });
  });

  it("decodes a cell's box from its offsets", () => {
    // One 32×32 picture: stride 8 has 4×4 cells. Cell (row 1, col 2) predicts a face.
    const z = (n: number) => new Float32Array(n);
    const t: Record<string, Float32Array> = {
      cls_8: z(16),
      obj_8: z(16),
      bbox_8: z(64),
      cls_16: z(4),
      obj_16: z(4),
      bbox_16: z(16),
      cls_32: z(1),
      obj_32: z(1),
      bbox_32: z(4),
    };
    const i = 1 * 4 + 2;
    (t.cls_8 as Float32Array)[i] = 0.81;
    (t.obj_8 as Float32Array)[i] = 1.2; // clamped to 1
    (t.bbox_8 as Float32Array).set([0.5, 0.25, Math.log(2), 0], i * 4);
    const [f] = decodeYunet((n) => t[n] as Float32Array, 32, 32, 0.5);
    expect(f?.score).toBeCloseTo(0.9, 6);
    // Centre (2.5, 1.25) cells = (20, 10) px; 16×8 px.
    [12, 6, 16, 8].forEach((v, j) => {
      expect([f?.x, f?.y, f?.width, f?.height][j]).toBeCloseTo(v, 5);
    });
  });
});

describe("NMS", () => {
  it("measures overlap", () => {
    expect(iou(face(0, 0, 10, 10, 1), face(5, 0, 10, 10, 1))).toBeCloseTo(1 / 3, 6);
    expect(iou(face(0, 0, 10, 10, 1), face(10, 0, 10, 10, 1))).toBe(0);
  });

  it("keeps the best of overlapping boxes and every separate one, best first", () => {
    const kept = nms(
      [
        face(0, 0, 10, 10, 0.8),
        face(1, 1, 10, 10, 0.95),
        face(50, 50, 10, 10, 0.7),
        face(2, 0, 10, 10, 0.6),
      ],
      0.3,
    );
    expect(kept.map((f) => f.score)).toEqual([0.95, 0.7]);
  });

  it("keeps a box whose overlap equals the threshold, and breaks ties by input order", () => {
    // Overlap 1/3 with an IoU threshold of 1/3: kept (OpenCV keeps overlap <= threshold).
    const kept = nms([face(0, 0, 10, 10, 0.9), face(5, 0, 10, 10, 0.9)], 1 / 3);
    expect(kept).toHaveLength(2);
    expect(kept[0]?.x).toBe(0);
  });

  it("compares truncated rectangles as OpenCV does", () => {
    // As floats these overlap by 0.306 (suppressed at 0.3); truncated by 0.25 (kept).
    const a = face(0, 0, 10.9, 10, 0.9);
    const b = face(6, 0, 10, 10, 0.8);
    expect(iou(a, b)).toBeGreaterThan(0.3);
    expect(nms([a, b], 0.3)).toHaveLength(2);
    expect(nms([a, b], 0.3, 5000, false)).toHaveLength(1);
  });
});
