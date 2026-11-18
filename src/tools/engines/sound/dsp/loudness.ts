/**
 * Loudness measurement per ITU-R BS.1770-4 as used by EBU R128: K-weighting (a high-shelf and a
 * high-pass biquad), mean square per channel with the standard channel weights, 400 ms blocks every
 * 100 ms, an absolute gate at −70 LUFS and a relative gate 10 LU below the ungated level. Reports the
 * integrated loudness (LUFS), the sample peak and the true peak (dBTP, see ./true-peak).
 *
 * The filter coefficients are derived for any sample rate from the analogue prototype, the way
 * libebur128 does; at 48 kHz they equal the BS.1770 table (unit-tested). Pure: no DOM, no mediabunny.
 */
import { TruePeakChannel } from "./true-peak";

/** Loudness of an empty or all-silent measurement. */
export const SILENT = Number.NEGATIVE_INFINITY;
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** The two K-weighting stages for a sample rate (libebur128's derivation of the BS.1770 filters). */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sampleRate);
  const d = 1 + K / Q + K * K;
  const highPass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / d,
    a2: (1 - K / Q + K * K) / d,
  };
  return [shelf, highPass];
}

/**
 * BS.1770 channel weights: 1.0 for left, right and centre, 1.41 for the surrounds, 0 for LFE. Five-
 * and six-channel files are assumed to be in the usual order (L R C LFE Ls Rs); other layouts weigh
 * every channel 1.0, which is right for mono and stereo.
 */
export function channelWeights(channels: number): number[] {
  if (channels === 6) return [1, 1, 1, 0, 1.41, 1.41];
  if (channels === 5) return [1, 1, 1, 1.41, 1.41];
  return Array.from({ length: channels }, () => 1);
}

export interface LoudnessResult {
  /** Integrated loudness in LUFS; −Infinity when nothing passed the gates (silence, or under 0.4 s). */
  integrated: number;
  /** Largest absolute sample, dBFS. */
  samplePeak: number;
  /** Largest absolute value of the 4× oversampled signal, dBTP. */
  truePeak: number;
  /** Seconds measured. */
  seconds: number;
}

/** Loudness of a mean-square sum: −0.691 + 10·log10(z). */
const lufs = (z: number) => (z > 0 ? -0.691 + 10 * Math.log10(z) : SILENT);
export const toDb = (linear: number) => (linear > 0 ? 20 * Math.log10(linear) : SILENT);
export const fromDb = (db: number) => 10 ** (db / 20);

/** Streaming meter: `push` planar blocks of any size, then `result()`. */
export class LoudnessMeter {
  private readonly filters: [Biquad, Biquad];
  private readonly weights: number[];
  /** Biquad state per channel: [x1, x2, y1, y2] for each of the two stages. */
  private readonly state: Float64Array[];
  private readonly peaks: TruePeakChannel[];
  private readonly subLength: number;
  /** Weighted mean-square accumulator of the current 100 ms sub-block, and its frame count. */
  private subSum = 0;
  private subFrames = 0;
  /** Energies of the last three complete sub-blocks, to form 400 ms blocks. */
  private readonly recent: number[] = [];
  /** Mean-square energy of every 400 ms block. */
  private readonly blocks: number[] = [];
  private samplePeak = 0;
  private frames = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly channels: number,
    /** False skips the oversampled true peak (the sample peak is still measured). */
    private readonly truePeak = true,
  ) {
    this.filters = kWeighting(sampleRate);
    this.weights = channelWeights(channels);
    this.state = Array.from({ length: channels }, () => new Float64Array(8));
    this.peaks = Array.from({ length: channels }, () => new TruePeakChannel());
    this.subLength = Math.max(1, Math.round(sampleRate / 10));
  }

  push(planes: Float32Array[], n = planes[0]?.length ?? 0): void {
    if (n <= 0) return;
    const [s1, s2] = this.filters;
    // Weighted K-filtered squares per frame, summed across channels.
    const sq = new Float64Array(n);
    for (let c = 0; c < this.channels; c++) {
      const x = planes[c] ?? planes[0];
      const st = this.state[c];
      const w = this.weights[c] ?? 1;
      if (!x || !st) continue;
      let x1 = st[0] ?? 0;
      let x2 = st[1] ?? 0;
      let y1 = st[2] ?? 0;
      let y2 = st[3] ?? 0;
      let u1 = st[4] ?? 0;
      let u2 = st[5] ?? 0;
      let v1 = st[6] ?? 0;
      let v2 = st[7] ?? 0;
      let peak = this.samplePeak;
      for (let i = 0; i < n; i++) {
        const xi = x[i] ?? 0;
        const a = Math.abs(xi);
        if (a > peak) peak = a;
        const y = s1.b0 * xi + s1.b1 * x1 + s1.b2 * x2 - s1.a1 * y1 - s1.a2 * y2;
        x2 = x1;
        x1 = xi;
        y2 = y1;
        y1 = y;
        const v = s2.b0 * y + s2.b1 * u1 + s2.b2 * u2 - s2.a1 * v1 - s2.a2 * v2;
        u2 = u1;
        u1 = y;
        v2 = v1;
        v1 = v;
        if (w !== 0) sq[i] = (sq[i] ?? 0) + w * v * v;
      }
      this.samplePeak = peak;
      st.set([x1, x2, y1, y2, u1, u2, v1, v2]);
      if (this.truePeak) this.peaks[c]?.push(x.subarray(0, n));
    }
    for (let i = 0; i < n; i++) {
      this.subSum += sq[i] ?? 0;
      this.subFrames++;
      if (this.subFrames === this.subLength) this.closeSubBlock();
    }
    this.frames += n;
  }

  private closeSubBlock() {
    const energy = this.subSum / this.subFrames;
    this.subSum = 0;
    this.subFrames = 0;
    if (this.recent.length === 3) {
      // A 400 ms block is four consecutive 100 ms sub-blocks (75% overlap between blocks).
      const [a = 0, b = 0, c = 0] = this.recent;
      this.blocks.push((a + b + c + energy) / 4);
      this.recent.shift();
    }
    this.recent.push(energy);
  }

  result(): LoudnessResult {
    let truePeak = this.samplePeak;
    if (this.truePeak) {
      for (const p of this.peaks) {
        p.flush();
        truePeak = Math.max(truePeak, p.peak);
      }
    }
    return {
      integrated: gatedLoudness(this.blocks),
      samplePeak: toDb(this.samplePeak),
      truePeak: toDb(truePeak),
      seconds: this.frames / this.sampleRate,
    };
  }
}

/** BS.1770-4 gating over 400 ms block energies. */
export function gatedLoudness(blocks: readonly number[]): number {
  const aboveAbs = blocks.filter((z) => lufs(z) > ABSOLUTE_GATE);
  if (aboveAbs.length === 0) return SILENT;
  const mean = (xs: readonly number[]) => xs.reduce((s, z) => s + z, 0) / xs.length;
  const relative = lufs(mean(aboveAbs)) + RELATIVE_GATE;
  const gated = aboveAbs.filter((z) => lufs(z) > relative);
  return gated.length > 0 ? lufs(mean(gated)) : SILENT;
}

/** "−16.2 LUFS" style: one decimal, a real minus sign, a non-breaking space, "silent" for −∞. */
export function formatLevel(value: number, unit: "LUFS" | "dBTP" | "dB" | "dBFS"): string {
  if (!Number.isFinite(value)) return unit === "LUFS" ? "silent" : `−∞\u00a0${unit}`;
  const r = Math.round(value * 10) / 10;
  const s = Math.abs(r).toFixed(1);
  const sign = r < 0 ? "−" : unit === "dB" && r > 0 ? "+" : "";
  return `${sign}${s}\u00a0${unit}`;
}
