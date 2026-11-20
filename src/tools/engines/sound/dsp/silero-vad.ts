/**
 * Silero VAD v6 (16 kHz), forward pass written out by hand, on the weights of the official
 * `silero_vad_16k.safetensors` (MIT, github.com/snakers4/silero-vad, PyPI silero-vad 6.2.3; ADR-0109).
 * The graph is the package's own reference (`tinygrad_model.py`), checked against the official ONNX
 * model in tests/unit/silero-vad.test.ts:
 *
 * - each call takes 512 new samples at 16 kHz plus the 64 before them (576), reflect-padded by 64 on
 *   the right (640);
 * - a learned STFT: a 1-D convolution of 258 filters, 256 wide, stride 128 (4 frames), whose two
 *   halves are the real and imaginary parts; the magnitude of 129 bins;
 * - four 1-D convolutions, 3 wide, padding 1, strides 1, 2, 2, 1 (129 → 128 → 64 → 64 → 128
 *   channels, 4 → 4 → 2 → 1 → 1 frames), each followed by ReLU;
 * - an LSTM cell of 128 (PyTorch gate order i, f, g, o) whose state carries from call to call;
 * - ReLU, a 1×1 convolution to one value, and a sigmoid: the speech probability of those 32 ms.
 *
 * About 0.68 million multiply-adds per 32 ms. Pure: no DOM, no network; the weights are handed in.
 */

/** New samples per call at 16 kHz (32 ms). */
export const VAD_CHUNK = 512;
/** Samples of the previous call that each call also sees. */
export const VAD_CONTEXT = 64;
export const VAD_RATE = 16_000;
/** Seconds each probability covers. */
export const VAD_FRAME_SEC = VAD_CHUNK / VAD_RATE;

export interface Tensor {
  shape: number[];
  data: Float32Array;
}

/**
 * Reads a safetensors file (an 8-byte little-endian header length, a JSON header, then raw tensors)
 * holding F32 or F16 tensors. Throws on anything else, so a wrong file fails loudly.
 */
export function readSafetensors(bytes: Uint8Array): Record<string, Tensor> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = Number(view.getBigUint64(0, true));
  if (!(headerLen > 0) || 8 + headerLen > bytes.byteLength)
    throw new Error("Not a safetensors file");
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLen))) as Record<
    string,
    { dtype: string; shape: number[]; data_offsets: [number, number] }
  >;
  const base = 8 + headerLen;
  const out: Record<string, Tensor> = {};
  for (const [name, t] of Object.entries(header)) {
    if (name === "__metadata__") continue;
    const [from, to] = t.data_offsets;
    const count = t.shape.reduce((a, b) => a * b, 1);
    const data = new Float32Array(count);
    if (t.dtype === "F32") {
      if (to - from !== count * 4) throw new Error(`Bad tensor size: ${name}`);
      for (let i = 0; i < count; i++) data[i] = view.getFloat32(base + from + i * 4, true);
    } else if (t.dtype === "F16") {
      if (to - from !== count * 2) throw new Error(`Bad tensor size: ${name}`);
      for (let i = 0; i < count; i++) data[i] = half(view.getUint16(base + from + i * 2, true));
    } else throw new Error(`Unsupported tensor type ${t.dtype}`);
    out[name] = { shape: t.shape, data };
  }
  return out;
}

function half(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? Number.NaN : s * Number.POSITIVE_INFINITY;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

interface Conv {
  w: Float32Array;
  b: Float32Array;
  inCh: number;
  outCh: number;
  stride: number;
}

const need = (t: Record<string, Tensor>, name: string, shape: number[]): Float32Array => {
  const x = t[name];
  if (!x || x.shape.join("×") !== shape.join("×"))
    throw new Error(`The speech model file is not the expected one (${name}).`);
  return x.data;
};

/** One Silero VAD model with its running state (context and LSTM). */
export class SileroVad {
  private readonly stft: Float32Array;
  private readonly convs: Conv[];
  private readonly wih: Float32Array;
  private readonly whh: Float32Array;
  private readonly bias: Float32Array;
  private readonly fw: Float32Array;
  private readonly fb: number;
  private readonly h = new Float32Array(128);
  private readonly c = new Float32Array(128);
  private readonly context = new Float32Array(VAD_CONTEXT);
  // Scratch, reused every call.
  private readonly x = new Float32Array(VAD_CHUNK + 2 * VAD_CONTEXT);
  private readonly spec = new Float32Array(129 * 4);
  private readonly gates = new Float32Array(512);
  private readonly bufs = [new Float32Array(128 * 4), new Float32Array(64 * 2)] as const;
  private readonly bufs2 = [new Float32Array(64), new Float32Array(128)] as const;

  constructor(weights: Record<string, Tensor>) {
    this.stft = need(weights, "stft_conv.weight", [258, 1, 256]);
    const conv = (n: number, outCh: number, inCh: number, stride: number): Conv => ({
      w: need(weights, `conv${n}.weight`, [outCh, inCh, 3]),
      b: need(weights, `conv${n}.bias`, [outCh]),
      inCh,
      outCh,
      stride,
    });
    this.convs = [
      conv(1, 128, 129, 1),
      conv(2, 64, 128, 2),
      conv(3, 64, 64, 2),
      conv(4, 128, 64, 1),
    ];
    this.wih = need(weights, "lstm_cell.weight_ih", [512, 128]);
    this.whh = need(weights, "lstm_cell.weight_hh", [512, 128]);
    const bih = need(weights, "lstm_cell.bias_ih", [512]);
    const bhh = need(weights, "lstm_cell.bias_hh", [512]);
    this.bias = new Float32Array(512);
    for (let i = 0; i < 512; i++) this.bias[i] = (bih[i] as number) + (bhh[i] as number);
    this.fw = need(weights, "final_conv.weight", [1, 128, 1]);
    this.fb = need(weights, "final_conv.bias", [1])[0] as number;
  }

  /** Back to the state of a new file: no context, LSTM at zero. */
  reset() {
    this.h.fill(0);
    this.c.fill(0);
    this.context.fill(0);
  }

  /** Speech probability of the next 512 samples (16 kHz, about ±1 full scale). */
  process(chunk: Float32Array): number {
    if (chunk.length !== VAD_CHUNK) throw new Error("A VAD chunk is 512 samples.");
    const x = this.x;
    const n = VAD_CONTEXT + VAD_CHUNK;
    x.set(this.context, 0);
    x.set(chunk, VAD_CONTEXT);
    // Reflect padding on the right (the edge sample itself is not repeated).
    for (let k = 0; k < VAD_CONTEXT; k++) x[n + k] = x[n - 2 - k] as number;
    this.context.set(chunk.subarray(VAD_CHUNK - VAD_CONTEXT));

    // Learned STFT magnitude: 129 bins × 4 frames.
    const w = this.stft;
    const spec = this.spec;
    for (let t = 0; t < 4; t++) {
      const off = t * 128;
      for (let f = 0; f < 129; f++) {
        let re = 0;
        let im = 0;
        const wr = f * 256;
        const wi = (129 + f) * 256;
        for (let k = 0; k < 256; k++) {
          const v = x[off + k] as number;
          re += (w[wr + k] as number) * v;
          im += (w[wi + k] as number) * v;
        }
        spec[f * 4 + t] = Math.sqrt(re * re + im * im);
      }
    }
    const [c1, c2, c3, c4] = this.convs as [Conv, Conv, Conv, Conv];
    const a = conv1d(c1, spec, 4, this.bufs[0]);
    const b = conv1d(c2, a, 4, this.bufs[1]);
    const c = conv1d(c3, b, 2, this.bufs2[0]);
    const d = conv1d(c4, c, 1, this.bufs2[1]);

    // LSTM cell.
    const g = this.gates;
    const h = this.h;
    for (let j = 0; j < 512; j++) {
      let s = this.bias[j] as number;
      const row = j * 128;
      for (let i = 0; i < 128; i++)
        s +=
          (this.wih[row + i] as number) * (d[i] as number) +
          (this.whh[row + i] as number) * (h[i] as number);
      g[j] = s;
    }
    let out = this.fb;
    for (let i = 0; i < 128; i++) {
      const ig = sigmoid(g[i] as number);
      const fg = sigmoid(g[128 + i] as number);
      const gg = Math.tanh(g[256 + i] as number);
      const og = sigmoid(g[384 + i] as number);
      const cc = fg * (this.c[i] as number) + ig * gg;
      this.c[i] = cc;
      const hh = og * Math.tanh(cc);
      h[i] = hh;
      out += (this.fw[i] as number) * Math.max(0, hh);
    }
    return sigmoid(out);
  }
}

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

/** 3-wide convolution with padding 1 and ReLU; `input` is channel-major [inCh][len]. */
function conv1d(conv: Conv, input: Float32Array, len: number, out: Float32Array): Float32Array {
  const { w, b, inCh, outCh, stride } = conv;
  const outLen = Math.floor((len + 2 - 3) / stride) + 1;
  for (let o = 0; o < outCh; o++) {
    for (let t = 0; t < outLen; t++) {
      let s = b[o] as number;
      const start = t * stride - 1;
      for (let i = 0; i < inCh; i++) {
        const wo = (o * inCh + i) * 3;
        const io = i * len;
        for (let k = 0; k < 3; k++) {
          const p = start + k;
          if (p >= 0 && p < len) s += (w[wo + k] as number) * (input[io + p] as number);
        }
      }
      out[o * outLen + t] = s > 0 ? s : 0;
    }
  }
  return out;
}
