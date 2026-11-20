/**
 * The vision kit's layers on the CPU, in plain TypeScript: the reference the WebGL 2 kernels
 * (./gl-net) are tested against, and the unit-testable statement of what each layer computes.
 * Pure; tensors are CHW Float32Arrays (batch 1). Far slower than the GPU (about 0.3 s for a
 * 640×384 YuNet pass); not used on a page.
 */
import { type ConvLayer, type Layer, layersFor, type ModelFile } from "./model-file";

export interface Tensor {
  c: number;
  h: number;
  w: number;
  data: Float32Array;
}

export const tensor = (c: number, h: number, w: number, data?: Float32Array): Tensor => ({
  c,
  h,
  w,
  data: data ?? new Float32Array(c * h * w),
});

/** Output size of a convolution or pool along one axis (ONNX, floor). */
export const outSize = (n: number, k: number, stride: number, pad: number) =>
  Math.floor((n + 2 * pad - k) / stride) + 1;

const activate = (v: number, act: ConvLayer["act"]) =>
  act === "relu" ? (v > 0 ? v : 0) : act === "sigmoid" ? 1 / (1 + Math.exp(-v)) : v;

/** Convolution with zero padding; `group` 1 (full) or `cin` (depthwise). */
export function conv(
  x: Tensor,
  weights: Float32Array,
  bias: Float32Array,
  l: Pick<ConvLayer, "cin" | "cout" | "k" | "stride" | "pad" | "group" | "act">,
): Tensor {
  if (x.c !== l.cin) throw new Error(`conv: ${x.c} channels in, ${l.cin} expected`);
  const oh = outSize(x.h, l.k, l.stride, l.pad);
  const ow = outSize(x.w, l.k, l.stride, l.pad);
  const y = tensor(l.cout, oh, ow);
  const cinG = l.cin / l.group;
  const coutG = l.cout / l.group;
  const { k, stride, pad } = l;
  const plane = x.h * x.w;
  for (let o = 0; o < l.cout; o++) {
    const g = Math.floor(o / coutG);
    const out = y.data.subarray(o * oh * ow, (o + 1) * oh * ow);
    out.fill(bias[o] ?? 0);
    for (let ci = 0; ci < cinG; ci++) {
      const ic = g * cinG + ci;
      const src = x.data.subarray(ic * plane, (ic + 1) * plane);
      for (let ky = 0; ky < k; ky++)
        for (let kx = 0; kx < k; kx++) {
          const wv = weights[((o * cinG + ci) * k + ky) * k + kx] ?? 0;
          if (wv === 0) continue;
          for (let oy = 0; oy < oh; oy++) {
            const iy = oy * stride - pad + ky;
            if (iy < 0 || iy >= x.h) continue;
            const row = iy * x.w;
            const orow = oy * ow;
            for (let ox = 0; ox < ow; ox++) {
              const ix = ox * stride - pad + kx;
              if (ix < 0 || ix >= x.w) continue;
              out[orow + ox] = (out[orow + ox] ?? 0) + wv * (src[row + ix] ?? 0);
            }
          }
        }
    }
    if (l.act !== "none")
      for (let i = 0; i < out.length; i++) out[i] = activate(out[i] ?? 0, l.act);
  }
  return y;
}

/** 2×2 max pool, stride 2, no padding (floor). */
export function maxPool2(x: Tensor): Tensor {
  const oh = Math.floor(x.h / 2);
  const ow = Math.floor(x.w / 2);
  const y = tensor(x.c, oh, ow);
  for (let c = 0; c < x.c; c++)
    for (let oy = 0; oy < oh; oy++)
      for (let ox = 0; ox < ow; ox++) {
        const b = c * x.h * x.w + 2 * oy * x.w + 2 * ox;
        const d = x.data;
        y.data[(c * oh + oy) * ow + ox] = Math.max(
          d[b] ?? 0,
          d[b + 1] ?? 0,
          d[b + x.w] ?? 0,
          d[b + x.w + 1] ?? 0,
        );
      }
  return y;
}

/** `a + up2(b)`, nearest neighbour (ONNX Resize asymmetric, floor). */
export function upAdd(a: Tensor, b: Tensor): Tensor {
  if (a.c !== b.c) throw new Error("upadd: channel counts differ");
  const y = tensor(a.c, a.h, a.w);
  for (let c = 0; c < a.c; c++)
    for (let yy = 0; yy < a.h; yy++)
      for (let xx = 0; xx < a.w; xx++) {
        const by = Math.min(b.h - 1, yy >> 1);
        const bx = Math.min(b.w - 1, xx >> 1);
        const i = (c * a.h + yy) * a.w + xx;
        y.data[i] = (a.data[i] ?? 0) + (b.data[(c * b.h + by) * b.w + bx] ?? 0);
      }
  return y;
}

/**
 * Runs `model` on `input` (CHW). Returns every tensor it computed by name (the input included), or
 * only what `wanted` needs when given.
 */
export function runCpu(model: ModelFile, input: Tensor, wanted?: string[]): Map<string, Tensor> {
  const layers: Layer[] = wanted ? layersFor(model.layers, wanted) : model.layers;
  const values = new Map<string, Tensor>([[model.input.name, input]]);
  const get = (name: string) => {
    const t = values.get(name);
    if (!t) throw new Error(`runCpu: ${name} not computed`);
    return t;
  };
  for (const l of layers) {
    if (l.op === "conv")
      values.set(l.out, conv(get(l.in), model.tensor(l.w), model.tensor(l.b), l));
    else if (l.op === "maxpool") values.set(l.out, maxPool2(get(l.in)));
    else values.set(l.out, upAdd(get(l.in[0]), get(l.in[1])));
  }
  return values;
}

/** CHW to the ONNX outputs' layout here: positions in row-major order, `c` values each. */
export function toHwc(t: Tensor): Float32Array {
  const out = new Float32Array(t.c * t.h * t.w);
  const plane = t.h * t.w;
  for (let c = 0; c < t.c; c++)
    for (let i = 0; i < plane; i++) out[i * t.c + c] = t.data[c * plane + i] ?? 0;
  return out;
}
