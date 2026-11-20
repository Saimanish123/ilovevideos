import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  conv,
  maxPool2,
  runCpu,
  type Tensor,
  tensor,
  toHwc,
  upAdd,
} from "@/tools/engines/vision/cpu";
import { halfToFloat, layersFor, readModelFile } from "@/tools/engines/vision/model-file";

/**
 * The vision kit's CPU reference against hand-worked cases and against the official YuNet ONNX
 * model run by onnxruntime (tests/fixtures/vision, made by scripts/vision/make_references.py). The
 * half-float weights are the only difference from the reference, so the tolerance is relative to
 * each tensor's range.
 */

const load = (p: string) => {
  const b = readFileSync(p);
  return readModelFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const model = load("public/models/yunet/yunet-2026may.vnn");
const ref = load("tests/fixtures/vision/yunet-layers.f32");

/** Largest absolute difference over the largest reference magnitude. */
function relErr(got: Float32Array, want: Float32Array) {
  expect(got.length).toBe(want.length);
  let diff = 0;
  let range = 1e-6;
  for (let i = 0; i < want.length; i++) {
    diff = Math.max(diff, Math.abs((got[i] ?? 0) - (want[i] ?? 0)));
    range = Math.max(range, Math.abs(want[i] ?? 0));
  }
  return diff / range;
}

describe("half floats", () => {
  it("decodes the usual values", () => {
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0xc000)).toBe(-2);
    expect(halfToFloat(0x7bff)).toBe(65504);
    expect(halfToFloat(0x0001)).toBeCloseTo(5.96e-8, 10);
    expect(halfToFloat(0x7c00)).toBe(Number.POSITIVE_INFINITY);
    expect(halfToFloat(0x3555)).toBeCloseTo(0.33325, 5);
  });
});

describe("layers on small cases", () => {
  const t = (c: number, h: number, w: number, v: number[]): Tensor =>
    tensor(c, h, w, Float32Array.from(v));

  it("convolves 3×3 with zero padding and stride 2", () => {
    const x = t(1, 3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const w = new Float32Array(9).fill(1);
    const y = conv(x, w, Float32Array.of(0.5), {
      cin: 1,
      cout: 1,
      k: 3,
      stride: 2,
      pad: 1,
      group: 1,
      act: "none",
    });
    // Windows centred on (0,0), (0,2), (2,0), (2,2).
    expect([y.h, y.w]).toEqual([2, 2]);
    expect(Array.from(y.data)).toEqual([12.5, 16.5, 24.5, 28.5]);
  });

  it("keeps depthwise channels apart and applies ReLU", () => {
    const x = t(2, 1, 2, [1, 2, -3, -4]);
    const w = new Float32Array(18);
    w[4] = 2; // channel 0 centre tap
    w[13] = 1; // channel 1 centre tap
    const y = conv(x, w, Float32Array.of(0, 1), {
      cin: 2,
      cout: 2,
      k: 3,
      stride: 1,
      pad: 1,
      group: 2,
      act: "relu",
    });
    expect(Array.from(y.data)).toEqual([2, 4, 0, 0]);
  });

  it("mixes channels in a 1×1 and squashes with a sigmoid", () => {
    const x = t(2, 1, 1, [1, 3]);
    const y = conv(x, Float32Array.of(1, -1), Float32Array.of(2), {
      cin: 2,
      cout: 1,
      k: 1,
      stride: 1,
      pad: 0,
      group: 1,
      act: "sigmoid",
    });
    expect(y.data[0]).toBeCloseTo(0.5, 6);
  });

  it("max pools 2×2 rounding the size down", () => {
    const y = maxPool2(t(1, 3, 3, [1, 5, 2, 3, 4, 9, 7, 8, 6]));
    expect([y.h, y.w, y.data[0]]).toEqual([1, 1, 5]);
  });

  it("adds a nearest-neighbour 2× upsampling", () => {
    const y = upAdd(t(1, 2, 2, [1, 1, 1, 1]), t(1, 1, 1, [5]));
    expect(Array.from(y.data)).toEqual([6, 6, 6, 6]);
  });

  it("lays out channels last for the outputs", () => {
    expect(Array.from(toHwc(t(2, 1, 2, [1, 2, 3, 4])))).toEqual([1, 3, 2, 4]);
  });
});

describe("YuNet on the CPU against onnxruntime", () => {
  const input = ref.tensor("input");
  const values = runCpu(model, tensor(3, 64, 64, input));

  it("reads the model file the converter wrote", () => {
    expect(model.name).toBe("yunet-2026may");
    expect(model.licence).toBe("MIT");
    expect(model.layers).toHaveLength(59);
    expect(model.outputs.map((o) => o.name)).toContain("cls_8");
    const params = model.names().reduce((n, k) => n + model.tensor(k).length, 0);
    expect(params).toBe(53104);
  });

  it("matches every layer within 0.5% of its range", () => {
    let worst = 0;
    for (const l of model.layers) {
      const got = values.get(l.out);
      if (!got) throw new Error(l.out);
      // A layer that becomes an output is stored channels last in the reference.
      const isOut = model.outputs.some((o) => o.tensor === l.out);
      const e = relErr(isOut ? toHwc(got) : got.data, ref.tensor(l.out));
      worst = Math.max(worst, e);
      expect(e, l.name).toBeLessThan(5e-3);
    }
    // Not bit-exact: the weights are half floats.
    expect(worst).toBeGreaterThan(0);
  });

  it("matches the twelve outputs", () => {
    for (const o of model.outputs) {
      const t = values.get(o.tensor);
      if (!t) throw new Error(o.tensor);
      expect(relErr(toHwc(t), ref.tensor(o.name)), o.name).toBeLessThan(5e-3);
    }
  });

  it("computes only what the wanted outputs need", () => {
    const wanted = ["cls_8", "obj_8", "bbox_8"].map(
      (n) => model.outputs.find((o) => o.name === n)?.tensor ?? "",
    );
    const some = layersFor(model.layers, wanted);
    expect(some.length).toBeLessThan(model.layers.length);
    const outs = new Set(some.map((l) => l.out));
    for (const w of wanted) expect(outs.has(w)).toBe(true);
    expect(outs.has("kps_8")).toBe(false);
  });
});
