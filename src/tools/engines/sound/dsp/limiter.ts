/**
 * Look-ahead peak limiter, linked across channels. It keeps the 4× oversampled peak (./true-peak) at
 * or under a ceiling by turning the gain down before a peak arrives (5 ms look-ahead, so no sample
 * is ever over), then lets it back up over about 80 ms. Below the ceiling it does nothing: the gain
 * stays exactly 1.
 *
 * How the gain is formed, per frame n with look-ahead L frames:
 *   needed[n] = min(1, ceiling / peak[n])
 *   held[n]   = min(needed[n .. n + L])          (sliding minimum: every peak is seen L frames early)
 *   ramp[n]   = mean(held[n − L .. n])           (a linear ramp down; ramp[n] ≤ needed[n] is guaranteed)
 *   gain[n]   = ramp[n] when it falls, else eases back up towards it with the release time constant
 * The output is the input delayed by L frames plus the envelope's own lag; `process` compensates, so
 * output frame i is input frame i and the stream keeps its length and its sync (`flush` returns the tail).
 * Pure: no DOM, no mediabunny.
 */
import { TruePeakEnvelope } from "./true-peak";

export const LOOKAHEAD_SEC = 0.005;
export const RELEASE_SEC = 0.08;

export class Limiter {
  private readonly lookahead: number;
  private readonly release: number;
  private readonly env: TruePeakEnvelope;
  /** Delay line of the signal per channel (lag + lookahead + 1 frames). */
  private readonly delay: Float32Array[];
  private readonly delayLength: number;
  private delayPos = 0;
  /** Sliding minimum over the needed gain: a monotonic deque of (index, value). */
  private readonly dqIndex: number[] = [];
  private readonly dqValue: number[] = [];
  /** Ring of the held values for the ramp's moving average. */
  private readonly heldRing: Float64Array;
  private heldSum = 0;
  private gain = 1;
  /** Frames pushed into the envelope, and frames of gain formed. */
  private t = 0;
  private emitted = 0;
  /** Frames to drop at the start so output i lines up with input i. */
  private toSkip: number;
  /** Deepest gain reduction applied, as a linear factor (1 = none). */
  minGain = 1;

  constructor(
    private readonly channels: number,
    sampleRate: number,
    /** Linear ceiling for the oversampled peak, e.g. 10^(−1/20) for −1 dBTP. */
    private readonly ceiling: number,
  ) {
    this.lookahead = Math.max(1, Math.round(LOOKAHEAD_SEC * sampleRate));
    this.release = 1 - Math.exp(-1 / (RELEASE_SEC * sampleRate));
    this.env = new TruePeakEnvelope(channels);
    this.delayLength = TruePeakEnvelope.LAG + this.lookahead + 1;
    this.delay = Array.from({ length: channels }, () => new Float32Array(this.delayLength));
    this.heldRing = new Float64Array(this.lookahead + 1).fill(1);
    this.heldSum = this.lookahead + 1;
    this.toSkip = TruePeakEnvelope.LAG + this.lookahead;
  }

  /** Limits `n` frames; returns the limited frames that are ready (fewer than `n` on the first call). */
  process(planes: Float32Array[], n: number): Float32Array[] {
    const peak = new Float32Array(n);
    this.env.process(planes, n, peak, this.ceiling);
    return this.step(planes, n, peak);
  }

  /** The last frames still in the delay line: after it, exactly as many frames came out as went in. */
  flush(): Float32Array[] {
    const n = TruePeakEnvelope.LAG + this.lookahead;
    const zeros = Array.from({ length: this.channels }, () => new Float32Array(n));
    const peak = new Float32Array(n);
    this.env.process(zeros, n, peak, this.ceiling);
    return this.step(zeros, n, peak);
  }

  private step(planes: Float32Array[], n: number, peak: Float32Array) {
    const L = this.lookahead;
    const out = Array.from({ length: this.channels }, () => new Float32Array(n));
    let written = 0;
    for (let i = 0; i < n; i++) {
      // peak[i] describes the input frame LAG frames back; its needed gain enters the deque now.
      const p = peak[i] ?? 0;
      const needed = p > this.ceiling ? this.ceiling / p : 1;
      const idx = this.t++;
      while (this.dqValue.length > 0 && (this.dqValue.at(-1) ?? 1) >= needed) {
        this.dqValue.pop();
        this.dqIndex.pop();
      }
      this.dqValue.push(needed);
      this.dqIndex.push(idx);
      // held[idx − L] = min(needed[idx − L .. idx]).
      const oldest = idx - L;
      while ((this.dqIndex[0] ?? idx) < oldest) {
        this.dqIndex.shift();
        this.dqValue.shift();
      }
      const held = oldest >= 0 ? (this.dqValue[0] ?? 1) : 1;
      if (idx === L + TruePeakEnvelope.LAG) {
        // The first real frame: the ramp's window reaches back before the start, where no peak was
        // seen yet. Those slots take this frame's held value, so the first peaks are limited too.
        this.heldRing.fill(held);
        this.heldSum = held * (L + 1);
      } else {
        const slot = this.emitted % (L + 1);
        this.heldSum += held - (this.heldRing[slot] ?? 1);
        this.heldRing[slot] = held;
      }
      const ramp = this.heldSum / (L + 1);
      this.gain = ramp < this.gain ? ramp : this.gain + (ramp - this.gain) * this.release;
      if (this.gain < this.minGain) this.minGain = this.gain;
      this.emitted++;

      // Delay line: store the incoming frame, read the frame LAG + L back and apply the gain to it.
      const readPos = (this.delayPos + 1) % this.delayLength;
      for (let c = 0; c < this.channels; c++) {
        const line = this.delay[c];
        const x = planes[c] ?? planes[0];
        if (!line) continue;
        line[this.delayPos] = x?.[i] ?? 0;
      }
      if (this.toSkip > 0) {
        this.toSkip--;
      } else {
        for (let c = 0; c < this.channels; c++) {
          const line = this.delay[c];
          const o = out[c];
          if (line && o) o[written] = (line[readPos] ?? 0) * this.gain;
        }
        written++;
      }
      this.delayPos = readPos;
    }
    return out.map((o) => o.subarray(0, written));
  }
}
