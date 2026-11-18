/**
 * Streaming sample-rate and channel conversion for the re-encoding join, so clips recorded at
 * 44.1 and 48 kHz, or in mono and stereo, can feed one audio encoder. Linear interpolation, state
 * carried across chunks so there is no click at chunk edges. Linear interpolation does not filter
 * before downsampling; content above the new Nyquist frequency (22.05 kHz for 44.1 kHz) can alias,
 * which is rarely audible in camera and phone sound. Pure; no DOM.
 */
import { downmix } from "../sound/dsp/downmix";

/**
 * Channel mix for joins and placed sound. Down to mono or stereo it is the ITU-R BS.775 downmix,
 * scaled so it cannot clip (../sound/dsp/downmix): a 5.1 source keeps its centre, where dialogue is
 * (before, only left and right were kept). Mono is copied to every output channel; any other
 * upmix repeats the last channel.
 */
export function mixChannels(planes: Float32Array[], outChannels: number): Float32Array[] {
  const inChannels = planes.length;
  if (inChannels === outChannels) return planes;
  if (outChannels <= 2 || inChannels === 1) return downmix(planes, outChannels);
  const frames = planes[0]?.length ?? 0;
  return Array.from(
    { length: outChannels },
    (_, c) => planes[Math.min(c, inChannels - 1)] ?? new Float32Array(frames),
  );
}

export class LinearResampler {
  private readonly step: number;
  /** Next output position, in input frames, relative to the start of the next chunk. */
  private pos = 0;
  private prev: number[] | null = null;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
    readonly channels: number,
  ) {
    this.step = inRate / outRate;
  }

  /** Converts one chunk of planar audio; output length follows the rate ratio. */
  process(planes: Float32Array[]): Float32Array[] {
    const n = planes[0]?.length ?? 0;
    if (this.inRate === this.outRate) return planes;
    if (n === 0) return planes.map(() => new Float32Array(0));
    // x(-1) is the last frame of the previous chunk, so interpolation runs across the edge.
    const prev = this.prev ?? planes.map((p) => p[0] ?? 0);
    const count = Math.max(0, Math.floor((n - 1 - this.pos) / this.step) + 1);
    const out = planes.map(() => new Float32Array(count));
    let t = this.pos;
    for (let k = 0; k < count; k++, t += this.step) {
      const i0 = Math.floor(t);
      const frac = t - i0;
      for (let c = 0; c < planes.length; c++) {
        const p = planes[c] as Float32Array;
        const a = i0 < 0 ? (prev[c] ?? 0) : (p[i0] ?? 0);
        const b = p[i0 + 1] ?? p[n - 1] ?? 0;
        (out[c] as Float32Array)[k] = a + (b - a) * frac;
      }
    }
    this.pos = t - n;
    this.prev = planes.map((p) => p[n - 1] ?? 0);
    return out;
  }
}
