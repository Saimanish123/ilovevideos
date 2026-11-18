/**
 * True-peak estimation by 4× oversampling (ITU-R BS.1770-4 Annex 2 method; our own filter). Each
 * channel runs through a 49-tap Kaiser-windowed sinc interpolator split into four phases; the true
 * peak is the largest absolute value of the original and interpolated samples. Phase 0 is the
 * original sample itself, so the true peak is never below the sample peak.
 *
 * The filter is ours, not the Annex 2 coefficient table, so readings can differ from other meters
 * by a few hundredths of a dB on ordinary material and by more on synthetic signals near Nyquist.
 * Pure: no DOM, no mediabunny. Used by the loudness meter and the limiter.
 */

/** Oversampling factor and taps per phase: 4 × 12 + 1 = 49 taps. */
export const OVERSAMPLE = 4;
const TAPS_PER_PHASE = 12;
const HALF = (TAPS_PER_PHASE / 2) * OVERSAMPLE; // 24: the centre tap
const KAISER_BETA = 7;

/** Zeroth-order modified Bessel function of the first kind, by its series (for the Kaiser window). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 50; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

/**
 * The interpolator's phases: `phases[p][k]` weighs the input `k - 5` samples after the current one
 * (k = 0..11) to produce the value `p / 4` of a sample past it. Phase 0 is the identity.
 */
export const phases: Float64Array[] = (() => {
  const n = 2 * HALF + 1;
  const h = new Float64Array(n);
  const i0b = besselI0(KAISER_BETA);
  for (let i = 0; i < n; i++) {
    const x = (i - HALF) / OVERSAMPLE;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const r = (i - HALF) / HALF;
    const w = besselI0(KAISER_BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
    h[i] = sinc * w;
  }
  // Output at input position m + p/4 = sum over j of x[j] * h(HALF + (m - j) * 4 + p).
  const out: Float64Array[] = [];
  for (let p = 0; p < OVERSAMPLE; p++) {
    const taps = new Float64Array(TAPS_PER_PHASE);
    for (let k = 0; k < TAPS_PER_PHASE; k++) {
      // Input sample j = m + (k - 5): index HALF - (k - 5) * 4 + p... mirrored so taps run with j.
      const idx = HALF - (k - (TAPS_PER_PHASE / 2 - 1)) * OVERSAMPLE + p;
      taps[k] = idx >= 0 && idx < n ? (h[idx] ?? 0) : 0;
    }
    out.push(taps);
  }
  return out;
})();

/** Largest sum of absolute taps over the phases: how far an interpolated value can exceed its inputs. */
export const INTERPOLATION_GAIN = Math.max(
  ...phases.map((t) => t.reduce((s, v) => s + Math.abs(v), 0)),
);

/**
 * Streaming true-peak detector for one channel. `push` takes consecutive blocks; the interpolated
 * values between the last samples of a block are produced when the next block arrives (or `flush`).
 */
export class TruePeakChannel {
  /** Ring of the last TAPS_PER_PHASE input samples. */
  private readonly hist = new Float64Array(TAPS_PER_PHASE);
  private pos = 0;
  private seen = 0;
  peak = 0;

  /**
   * Feeds samples. `skipBelow`: when a whole block (with the history) is so quiet that no
   * interpolated value can reach it, only the sample peak is taken. Returns nothing; read `peak`.
   */
  push(x: Float32Array, skipBelow = this.peak): void {
    let blockMax = 0;
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i] ?? 0);
      if (a > blockMax) blockMax = a;
    }
    let histMax = 0;
    for (let i = 0; i < TAPS_PER_PHASE; i++)
      histMax = Math.max(histMax, Math.abs(this.hist[i] ?? 0));
    if (Math.max(blockMax, histMax) * INTERPOLATION_GAIN <= skipBelow) {
      // Nothing here can beat the current peak: keep the history current and move on.
      if (blockMax > this.peak) this.peak = blockMax;
      for (let i = Math.max(0, x.length - TAPS_PER_PHASE); i < x.length; i++) this.add(x[i] ?? 0);
      return;
    }
    for (let i = 0; i < x.length; i++) {
      this.add(x[i] ?? 0);
      this.evaluate();
    }
  }

  /** Pads with zeros so the interpolation after the last sample is evaluated too. */
  flush(): void {
    for (let i = 0; i < TAPS_PER_PHASE / 2; i++) {
      this.add(0);
      this.evaluate();
    }
  }

  private add(v: number) {
    this.hist[this.pos] = v;
    this.pos = (this.pos + 1) % TAPS_PER_PHASE;
    this.seen++;
  }

  /** Interpolated values between the sample 6 back and the one after it (the filter's delay). */
  private evaluate() {
    if (this.seen < TAPS_PER_PHASE) {
      // The first samples: the sample peak is exact; interpolation waits for a full history.
      const last = this.hist[(this.pos + TAPS_PER_PHASE - 1) % TAPS_PER_PHASE] ?? 0;
      this.peak = Math.max(this.peak, Math.abs(last));
      return;
    }
    for (let p = 0; p < OVERSAMPLE; p++) {
      const taps = phases[p];
      if (!taps) continue;
      let acc = 0;
      for (let k = 0; k < TAPS_PER_PHASE; k++)
        acc += (taps[k] ?? 0) * (this.hist[(this.pos + k) % TAPS_PER_PHASE] ?? 0);
      const a = Math.abs(acc);
      if (a > this.peak) this.peak = a;
    }
  }
}

/**
 * Per-sample true-peak envelope of a block across channels, for the limiter: `out[i]` is the largest
 * absolute original or interpolated value in the half-open interval [i, i + 1) of any channel.
 * Stateless per call except for `history` (the previous block's last samples, per channel), so a
 * sample near a block edge is interpolated with its real neighbours. Only computed at 4× where the
 * block could reach `worthAbove`; elsewhere the sample peak stands in.
 */
export class TruePeakEnvelope {
  private readonly history: Float64Array[];
  constructor(private readonly channels: number) {
    this.history = Array.from({ length: channels }, () => new Float64Array(TAPS_PER_PHASE));
  }

  /**
   * `planes` hold `n` frames. Because interpolation needs 6 samples after a position, the envelope is
   * delayed: `out[i]` describes input frame `i - 6` (the first 6 describe the previous block's tail).
   */
  process(planes: Float32Array[], n: number, out: Float32Array, worthAbove: number): void {
    out.fill(0, 0, n);
    const lag = TAPS_PER_PHASE / 2;
    for (let c = 0; c < this.channels; c++) {
      const x = planes[c] ?? planes[0];
      const hist = this.history[c];
      if (!x || !hist) continue;
      // Joined signal: 12 history samples followed by the block.
      const at = (j: number) =>
        j < TAPS_PER_PHASE ? (hist[j] ?? 0) : (x[j - TAPS_PER_PHASE] ?? 0);
      let blockMax = 0;
      for (let j = 0; j < TAPS_PER_PHASE + n; j++) blockMax = Math.max(blockMax, Math.abs(at(j)));
      const interpolate = blockMax * INTERPOLATION_GAIN > worthAbove;
      for (let i = 0; i < n; i++) {
        // Output i describes joined index m = i + lag (frame i - lag of this block).
        const m = i + lag;
        let v = Math.abs(at(m));
        if (interpolate) {
          for (let p = 1; p < OVERSAMPLE; p++) {
            const taps = phases[p];
            if (!taps) continue;
            let acc = 0;
            for (let k = 0; k < TAPS_PER_PHASE; k++)
              acc += (taps[k] ?? 0) * at(m + k - (TAPS_PER_PHASE / 2 - 1));
            v = Math.max(v, Math.abs(acc));
          }
        }
        if (v > (out[i] ?? 0)) out[i] = v;
      }
      // Keep the last 12 joined samples as the next block's history.
      const next = new Float64Array(TAPS_PER_PHASE);
      for (let k = 0; k < TAPS_PER_PHASE; k++) next[k] = at(n + k);
      hist.set(next);
    }
  }

  /** Frames of delay between input and envelope. */
  static readonly LAG = TAPS_PER_PHASE / 2;
}
