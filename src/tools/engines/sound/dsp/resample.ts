/**
 * Band-limited resampling at any ratio: a Kaiser-windowed sinc, read from a finely sampled table
 * with linear interpolation between table points, streaming with state carried across blocks so a
 * block edge leaves no trace. Output frame j is the input read at position `j · step` (input frames
 * per output frame), so `step = inRate / outRate` changes the sample rate and, played at the input
 * rate, `step = p` reads a sound p times faster (the pitch shifter's first stage). When reading
 * faster than real time the cutoff falls with the step, so nothing folds back below Nyquist.
 *
 * 64 zero crossings each side and Kaiser β 10: the passband is flat to 90% of the lower Nyquist
 * frequency (19.8 kHz at 44.1 kHz) and the stopband starts at it. Measured in
 * tests/unit/sound-resample.test.ts. The merge's linear interpolation (../../merge/resample) does not
 * filter at all; this is what new sound tools use. Pure: no DOM, no mediabunny.
 */

/** Zero crossings of the sinc on each side, at a cutoff of 1. */
const ZEROS = 64;
/** Table points per zero crossing. */
const RES = 512;
/** Kaiser β for about 100 dB of stopband attenuation. */
const BETA = 10;
/** Passband edge as a share of the (lower) Nyquist frequency. */
const ROLLOFF = 0.95;

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 64; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

let table: Float64Array | undefined;
/** sinc(u)·kaiser(u/ZEROS) for u = i/RES, i = 0..ZEROS·RES (+1 guard point). */
function kernel(): Float64Array {
  if (table) return table;
  const n = ZEROS * RES;
  const t = new Float64Array(n + 2);
  const i0b = besselI0(BETA);
  for (let i = 0; i <= n; i++) {
    const u = i / RES;
    const s = u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
    const r = u / ZEROS;
    t[i] = s * (besselI0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0b);
  }
  table = t;
  return t;
}

export class SincResampler {
  /** Input frames per output frame. */
  readonly step: number;
  private readonly cutoff: number;
  /** Half width of the filter in input frames. */
  private readonly reach: number;
  readonly k = kernel();
  /** Per channel: buffered input, starting at input frame `base`. */
  private buf: Float32Array[];
  private len = 0;
  private base = 0;
  /** Index of the next output frame. */
  private j = 0;
  /** Input frames received so far. */
  private received = 0;
  private w = new Float64Array(0);

  constructor(
    step: number,
    readonly channels: number,
  ) {
    if (!(step > 0) || !Number.isFinite(step)) throw new Error("Resampling step must be positive");
    this.step = step;
    this.cutoff = Math.min(1, 1 / step) * ROLLOFF;
    this.reach = Math.ceil(ZEROS / this.cutoff) + 1;
    // History before the first frame is silence: the reach to the left is zeros.
    this.buf = Array.from({ length: channels }, () => new Float32Array(4096 + 2 * this.reach));
    this.len = this.reach;
    this.base = -this.reach;
  }

  /** Output frames that `inputFrames` of input make in total (frames whose position is inside it). */
  static outputLength(inputFrames: number, step: number): number {
    return Math.max(0, Math.ceil(inputFrames / step - 1e-9));
  }

  private append(planes: Float32Array[], n: number) {
    if (this.len + n > (this.buf[0]?.length ?? 0)) {
      const size = Math.max(this.len + n, 2 * (this.buf[0]?.length ?? 0));
      this.buf = this.buf.map((b) => {
        const next = new Float32Array(size);
        next.set(b.subarray(0, this.len));
        return next;
      });
    }
    for (let c = 0; c < this.channels; c++)
      (this.buf[c] as Float32Array).set(
        (planes[c] ?? planes[0] ?? new Float32Array(n)).subarray(0, n),
        this.len,
      );
    this.len += n;
  }

  /** Output frames computable from what is buffered, stopping at input position `limit`. */
  private emit(limit: number, ready: number): Float32Array[] {
    const { step, cutoff, reach, k } = this;
    // Frames whose whole filter reach is buffered (or `ready` when flushing).
    let count = 0;
    while (true) {
      const pos = (this.j + count) * step;
      if (pos >= limit || pos + reach >= ready) break;
      count++;
    }
    const out = Array.from({ length: this.channels }, () => new Float32Array(count));
    const taps = 2 * reach;
    if (this.w.length < taps) this.w = new Float64Array(taps);
    const w = this.w;
    const span = ZEROS * RES;
    for (let o = 0; o < count; o++) {
      const pos = (this.j + o) * step;
      const lo = Math.floor(pos) - reach + 1;
      // Table position of each tap, |i − pos| · cutoff · RES; one set of weights for every channel.
      for (let i = 0; i < taps; i++) {
        const d = Math.abs(lo + i - pos) * cutoff * RES;
        const t = Math.floor(d);
        w[i] =
          t >= span ? 0 : (k[t] as number) + ((k[t + 1] as number) - (k[t] as number)) * (d - t);
      }
      const from = lo - this.base;
      for (let c = 0; c < this.channels; c++) {
        const b = this.buf[c] as Float32Array;
        let acc = 0;
        for (let i = 0; i < taps; i++) acc += (b[from + i] as number) * (w[i] as number);
        (out[c] as Float32Array)[o] = acc * cutoff;
      }
    }
    this.j += count;
    // Drop input no longer reachable.
    const keepFrom = Math.floor(this.j * step) - reach - 1;
    const drop = Math.max(0, keepFrom - this.base);
    if (drop > 0 && drop < this.len) {
      for (const b of this.buf) b.copyWithin(0, drop, this.len);
      this.len -= drop;
      this.base += drop;
    }
    return out;
  }

  /** Feeds a block of planar input; returns the output frames it completes. */
  process(planes: Float32Array[]): Float32Array[] {
    const n = planes[0]?.length ?? 0;
    if (n > 0) this.append(planes, n);
    this.received += n;
    return this.emit(Number.POSITIVE_INFINITY, this.base + this.len);
  }

  /** The remaining output: silence after the end, and exactly `outputLength(received)` in total. */
  flush(): Float32Array[] {
    const pad = Array.from({ length: this.channels }, () => new Float32Array(this.reach + 2));
    this.append(pad, this.reach + 2);
    return this.emit(this.received, Number.POSITIVE_INFINITY);
  }
}

/** Resamples whole planes at once (tests, short previews). */
export function resampleAll(planes: Float32Array[], step: number): Float32Array[] {
  const r = new SincResampler(step, planes.length);
  const a = r.process(planes);
  const b = r.flush();
  return a.map((p, c) => {
    const q = b[c] ?? new Float32Array(0);
    const out = new Float32Array(p.length + q.length);
    out.set(p);
    out.set(q, p.length);
    return out;
  });
}
