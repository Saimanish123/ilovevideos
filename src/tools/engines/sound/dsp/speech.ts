/**
 * Pauses found by speech, not loudness: the sound is mixed to mono, brought to 16 kHz and read by
 * Silero VAD (./silero-vad) every 32 ms; a pause is a run of frames the model calls non-speech.
 * Silero's own hysteresis is used (speech starts at a probability of 0.5 and ends below 0.35), so a
 * word whose middle dips does not split. Pure: no DOM, no network; the model is handed in.
 */

import type { Span } from "./silence";
import { type SileroVad, VAD_CHUNK, VAD_FRAME_SEC, VAD_RATE } from "./silero-vad";

/** Speech starts at or above this probability (Silero's default). */
export const SPEECH_ON = 0.5;
/** And ends below this one (Silero's `neg_threshold`, 0.15 under the start). */
export const SPEECH_OFF = 0.35;

/**
 * Brings any rate to 16 kHz for the model, cheaply: a Kaiser-windowed low-pass (cutoff 7.2 kHz,
 * about 16 taps per output sample's span) evaluated only at the two input frames around each output
 * position, then linear interpolation between them. Silero's own pipeline simply drops samples for
 * 48 kHz; this keeps what folds back above 8 kHz out, at a seventh of the cost of the full sinc
 * resampler (../dsp/resample), which matters on hour-long files. Measured against ffmpeg's resampler
 * in tests/unit/speech.test.ts.
 */
export class VadFeed {
  private readonly step: number;
  private readonly taps: Float32Array;
  private readonly half: number;
  /** Mono input with `half` frames of history in front. */
  private buf: Float32Array;
  private len: number;
  /** Input frame index of buf[0]. */
  private base: number;
  /** Next output position, in input frames. */
  private pos = 0;
  private readonly chunk = new Float32Array(VAD_CHUNK);
  private filled = 0;
  readonly probs: number[] = [];

  constructor(
    private readonly vad: SileroVad,
    rate: number,
  ) {
    this.step = rate / VAD_RATE;
    if (this.step <= 1.0001) {
      this.half = 0;
      this.taps = new Float32Array([1]);
    } else {
      const cutoff = 7200 / rate;
      this.half = Math.ceil(8 * this.step);
      const n = 2 * this.half + 1;
      const t = new Float32Array(n);
      const beta = 6;
      const i0 = (x: number) => {
        let s = 1;
        let term = 1;
        for (let k = 1; k < 32; k++) {
          term *= (x * x) / (4 * k * k);
          s += term;
        }
        return s;
      };
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const m = i - this.half;
        const sinc = m === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * m) / (Math.PI * m);
        const r = m / this.half;
        const v = sinc * (i0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0(beta));
        t[i] = v;
        sum += v;
      }
      for (let i = 0; i < n; i++) t[i] = (t[i] as number) / sum;
      this.taps = t;
    }
    this.buf = new Float32Array(8192);
    this.len = this.half;
    this.base = -this.half;
    vad.reset();
  }

  /** Low-passed input at integer frame `i` (zero outside what was given). */
  private at(i: number): number {
    const h = this.half;
    let s = 0;
    const from = i - h - this.base;
    for (let k = 0; k <= 2 * h; k++) {
      const j = from + k;
      if (j >= 0 && j < this.len) s += (this.taps[k] as number) * (this.buf[j] as number);
    }
    return s;
  }

  /** Feeds planar blocks at the source rate (any channel count; mixed to mono). */
  push(planes: Float32Array[], frames = planes[0]?.length ?? 0) {
    if (frames === 0) return;
    if (this.len + frames > this.buf.length) {
      const next = new Float32Array(Math.max(this.len + frames, this.buf.length * 2));
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    const ch = Math.max(1, planes.length);
    for (let i = 0; i < frames; i++) {
      let s = 0;
      for (const p of planes) s += p[i] ?? 0;
      this.buf[this.len + i] = s / ch;
    }
    this.len += frames;
    this.drain(this.base + this.len - this.half - 2);
  }

  /** Output samples whose filter reach is buffered (up to input frame `limit`). */
  private drain(limit: number) {
    while (this.pos <= limit) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const a = this.at(i);
      const v = f > 1e-9 ? a + (this.at(i + 1) - a) * f : a;
      this.chunk[this.filled++] = v;
      if (this.filled === VAD_CHUNK) {
        this.probs.push(this.vad.process(this.chunk));
        this.filled = 0;
      }
      this.pos += this.step;
    }
    // Keep only what the filter can still reach.
    const keepFrom = Math.floor(this.pos) - this.half - 1;
    const drop = keepFrom - this.base;
    if (drop > 4096) {
      this.buf.copyWithin(0, drop, this.len);
      this.len -= drop;
      this.base += drop;
    }
  }

  /** The probabilities, one per 32 ms from the sound's start; the last chunk is padded with silence. */
  finish(): Float32Array {
    const end = this.base + this.len;
    this.drain(end - 1);
    if (this.filled > 0) {
      this.chunk.fill(0, this.filled);
      this.probs.push(this.vad.process(this.chunk));
      this.filled = 0;
    }
    return Float32Array.from(this.probs);
  }
}

/**
 * Pauses in speech: runs of non-speech at least `minSilence` long, from the per-32 ms probabilities.
 * `sensitivity` moves both thresholds (0.5 / 0.35 by default): higher numbers need more certainty
 * before a moment counts as speech.
 */
export function speechPauses(
  probs: Float32Array,
  o: { minSilence: number; threshold?: number },
  duration: number,
): Span[] {
  const on = o.threshold ?? SPEECH_ON;
  const off = Math.max(0.01, on - (SPEECH_ON - SPEECH_OFF));
  const pauses: Span[] = [];
  let speaking = false;
  let quietFrom = 0;
  for (let i = 0; i <= probs.length; i++) {
    const p = i < probs.length ? (probs[i] as number) : 0;
    const t = Math.min(duration, i * VAD_FRAME_SEC);
    if (i === probs.length) {
      if (!speaking) pauses.push({ start: quietFrom, end: duration });
      break;
    }
    if (speaking) {
      if (p < off) {
        speaking = false;
        quietFrom = t;
      }
    } else if (p >= on) {
      speaking = true;
      if (t > quietFrom) pauses.push({ start: quietFrom, end: t });
    }
  }
  return pauses.filter((q) => q.end - q.start >= o.minSilence - 1e-9);
}

/** Share of frames called speech, for a status line or a test. */
export function speechShare(probs: Float32Array, threshold = SPEECH_ON): number {
  if (probs.length === 0) return 0;
  let n = 0;
  for (const p of probs) if (p >= threshold) n++;
  return n / probs.length;
}
