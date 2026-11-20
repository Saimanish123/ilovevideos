/**
 * Reads the file our vision kit runs from (`.vnn`, written offline by
 * scripts/vision/onnx_to_vision.py from the official ONNX model; the parity fixtures use the same
 * layout with 32-bit floats). Pure; no network, no GL.
 *
 * Layout (little endian): "VNN1", a uint32 header length N, N bytes of JSON (padded to 8 bytes),
 * then every tensor as half floats ("f16") or floats ("f32") at the offsets the header lists. The
 * header carries the layer list after fusing (conv with its activation, max pool, nearest 2× up
 * plus add), the outputs, the tensor table and where the weights came from (file, SHA-256, licence).
 */

export type Activation = "none" | "relu" | "sigmoid";

/** Convolution, NCHW, square kernel; `group` is 1 (full) or `cin` (depthwise, `cout` = `cin`). */
export interface ConvLayer {
  op: "conv";
  name: string;
  in: string;
  out: string;
  cin: number;
  cout: number;
  k: number;
  stride: number;
  pad: number;
  group: number;
  act: Activation;
  /** Tensor names: weights `[cout, cin / group, k, k]`, bias `[cout]`. */
  w: string;
  b: string;
}

/** 2×2 max pool, stride 2, no padding, sizes rounded down. */
export interface MaxPoolLayer {
  op: "maxpool";
  name: string;
  in: string;
  out: string;
  k: 2;
  stride: 2;
}

/** `in[0] + up2(in[1])`: nearest-neighbour 2× upsampling of the second, added to the first. */
export interface UpAddLayer {
  op: "upadd";
  name: string;
  in: [string, string];
  out: string;
}

export type Layer = ConvLayer | MaxPoolLayer | UpAddLayer;

export interface TensorEntry {
  shape: number[];
  offset: number;
  length: number;
}

export interface ModelFile {
  name: string;
  /** Where the weights came from, as the header states it. */
  source?: string;
  sourceSha256?: string;
  licence?: string;
  input: { name: string; channels: number };
  layers: Layer[];
  /** Network outputs and the layer output each one is. */
  outputs: { name: string; tensor: string }[];
  shapes: Record<string, number[]>;
  /** A tensor as floats (half floats are widened); throws for an unknown name. */
  tensor(name: string): Float32Array;
  names(): string[];
}

/** Half float bits to a number (IEEE 754 binary16). */
export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  if (exp === 31) return frac ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

let halfTable: Float32Array | undefined;
/** All 65,536 half floats as floats, built once (256 KB). */
function halves(): Float32Array {
  if (!halfTable) {
    halfTable = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) halfTable[i] = halfToFloat(i);
  }
  return halfTable;
}

interface Header {
  format: string;
  name?: string;
  source?: string;
  sourceSha256?: string;
  licence?: string;
  dtype: "f16" | "f32";
  input?: { name: string; channels: number };
  layers?: Layer[];
  outputs?: { name: string; tensor: string }[];
  tensors: Record<string, TensorEntry>;
}

export class ModelFileError extends Error {}

export function readModelFile(buffer: ArrayBuffer): ModelFile {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (buffer.byteLength < 8 || magic !== "VNN1")
    throw new ModelFileError("Not a model file (no VNN1 signature).");
  const n = new DataView(buffer).getUint32(4, true);
  if (8 + n > buffer.byteLength) throw new ModelFileError("The model file is cut short.");
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n))) as Header;
  if (header.format !== "vnn/1") throw new ModelFileError(`Unknown model format ${header.format}.`);
  const start = 8 + n;
  const width = header.dtype === "f16" ? 2 : 4;
  const end = Object.values(header.tensors).reduce(
    (m, t) => Math.max(m, t.offset + t.length * width),
    0,
  );
  if (start + end > buffer.byteLength) throw new ModelFileError("The model file is cut short.");
  const cache = new Map<string, Float32Array>();
  const tensor = (name: string) => {
    const hit = cache.get(name);
    if (hit) return hit;
    const t = header.tensors[name];
    if (!t) throw new ModelFileError(`No tensor ${name} in the model file.`);
    let out: Float32Array;
    if (header.dtype === "f32") {
      // Copied, so the result is aligned and independent of the file's buffer.
      out = new Float32Array(buffer.slice(start + t.offset, start + t.offset + t.length * 4));
    } else {
      const table = halves();
      const view = new DataView(buffer, start + t.offset, t.length * 2);
      out = new Float32Array(t.length);
      for (let i = 0; i < t.length; i++) out[i] = table[view.getUint16(i * 2, true)] ?? 0;
    }
    cache.set(name, out);
    return out;
  };
  const shapes: Record<string, number[]> = {};
  for (const [k, t] of Object.entries(header.tensors)) shapes[k] = t.shape;
  return {
    name: header.name ?? "",
    source: header.source,
    sourceSha256: header.sourceSha256,
    licence: header.licence,
    input: header.input ?? { name: "input", channels: 3 },
    layers: header.layers ?? [],
    outputs: header.outputs ?? [],
    shapes,
    tensor,
    names: () => Object.keys(header.tensors),
  };
}

/**
 * The layers needed for `wanted` outputs (layer output names), in file order: lets a caller skip
 * heads it does not read (face boxes without landmarks).
 */
export function layersFor(layers: Layer[], wanted: string[]): Layer[] {
  const need = new Set(wanted);
  const keep: Layer[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i] as Layer;
    if (!need.has(l.out)) continue;
    keep.push(l);
    for (const x of Array.isArray(l.in) ? l.in : [l.in]) need.add(x);
  }
  return keep.reverse();
}
