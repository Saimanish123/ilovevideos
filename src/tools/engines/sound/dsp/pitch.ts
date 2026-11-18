/**
 * Pitch shifting with the length kept: the sound is read p times faster by the band-limited
 * resampler (./resample: every frequency × p, length ÷ p), then stretched back to its exact length
 * by a phase vocoder with identity phase locking (Laroche and Dolson, 1999). Frequency accuracy comes
 * from the resampler's exact ratio; the vocoder keeps frequencies, so a tone lands within a small
 * fraction of a cent of its target (tests/unit/sound-pitch.test.ts).
 *
 * The vocoder: 4096-point frames at 44.1 and 48 kHz (scaled with the rate), Hann windows, a synthesis
 * hop of an eighth of a frame. Each frame's peaks advance their phase by their own measured frequency;
 * the bins around a peak keep their phase offset to it, which keeps partials coherent.
 *
 * Attacks: a plain vocoder spreads a drum hit over its whole 90 ms window (measured: echo 11 dB under
 * the hit in the 40 ms before it). Here attacks are found in the sound (a jump in short-window
 * energy of its first difference), and no frame mixes sound from both sides of one: each frame reads
 * and writes only between the attacks around its centre, the first frame after an attack takes the
 * analysis phases as they are, and the overlap-add divides by the window weight each sample actually
 * received. Steady sound, where there are no attacks, is processed exactly as before.
 *
 * Stereo is processed as mid and side, so what sits in the centre stays there. Streaming and exact:
 * `process` takes blocks and returns what is final; `flush` returns the rest, so the output has exactly
 * as many frames as the input, aligned with it (no delay). Pure: no DOM, no mediabunny.
 */
import { hann, RealFft } from "./fft";
import { SincResampler } from "./resample";

export const MIN_SEMITONES = -12;
export const MAX_SEMITONES = 12;

/** The frequency ratio of a shift: 2^((semitones + cents/100) / 12). */
export const pitchRatio = (semitones: number, cents = 0) => 2 ** ((semitones + cents / 100) / 12);

/** Frame size for a sample rate: 4096 at 32 to 64 kHz, 2048 below, 8192 above. */
export function frameSizeFor(sampleRate: number): number {
  return sampleRate < 32_000 ? 2048 : sampleRate > 64_000 ? 8192 : 4096;
}

const TWO_PI = 2 * Math.PI;
const princarg = (x: number) => x - TWO_PI * Math.round(x / TWO_PI);

/**
 * Finds attacks in a stream: 3 ms windows, energy of the first difference (which favours the high
 * frequencies attacks carry); an attack is a window more than 8 times (9 dB) the mean of the eight
 * before it, above a floor, at least 40 ms after the last. Positions are sample indexes, refined to
 * the first sample of the window whose step exceeds a quarter of the window's largest.
 */
export class OnsetFinder {
  readonly onsets: number[] = [];
  private readonly size: number;
  private readonly gap: number;
  private readonly history: number[] = [];
  /** The previous window and this one, back to back (the refinement looks into both). */
  private readonly buf: Float32Array;
  private fill: number;
  private pos = 0;
  private peak = 0;

  constructor(sampleRate: number) {
    this.size = Math.max(64, Math.round(sampleRate * 0.003));
    this.gap = Math.round(sampleRate * 0.04);
    this.buf = new Float32Array(2 * this.size + 1);
    this.fill = this.size + 1;
  }

  push(x: Float32Array) {
    for (let i = 0; i < x.length; i++) {
      this.buf[this.fill++] = x[i] as number;
      if (this.fill === this.buf.length) this.window();
    }
  }

  private window() {
    const { buf, size } = this;
    // buf[0] is the sample before the previous window; this window is buf[size + 1 ..].
    let e = 0;
    for (let i = size + 1; i < buf.length; i++) {
      const d = (buf[i] as number) - (buf[i - 1] as number);
      e += d * d;
    }
    this.peak = Math.max(this.peak * 0.9999, e);
    const h = this.history;
    const mean = h.length ? h.reduce((sum, v) => sum + v, 0) / h.length : 0;
    const start = this.pos;
    const floor = Math.max(1e-7 * size, this.peak * 1e-4);
    const lastOnset = this.onsets[this.onsets.length - 1] ?? Number.NEGATIVE_INFINITY;
    if (h.length === 8 && e > floor && e > 8 * mean && start - lastOnset >= this.gap) {
      // The attack may have begun late in the previous window: find the first step, in either,
      // above a quarter of the largest and well above the steps before the attack.
      let big = 0;
      for (let i = 1; i < buf.length; i++)
        big = Math.max(big, Math.abs((buf[i] as number) - (buf[i - 1] as number)));
      const quiet = Math.sqrt(mean / size) * 3;
      let at = start;
      for (let i = 1; i < buf.length; i++) {
        const d = Math.abs((buf[i] as number) - (buf[i - 1] as number));
        if (d > big / 4 && d > quiet) {
          at = start - size - 1 + i;
          break;
        }
      }
      if (at - lastOnset >= this.gap) this.onsets.push(at);
    }
    h.push(e);
    if (h.length > 8) h.shift();
    this.pos += size;
    buf.copyWithin(0, size);
    this.fill = size + 1;
  }
}

/** Ramp length, in samples, where a frame is cut at an attack. */
const EDGE = 32;

/**
 * Time-stretch of one channel by `ratio` (output ≈ input × ratio), streaming. Analysis frames are
 * centred at m·Ha in the input and written centred at m·Hs in the output, m from the first frame
 * that reaches time 0, so output time t matches input time t / ratio.
 */
class Stretcher {
  private readonly n: number;
  private readonly hs: number;
  private readonly ha: number;
  private readonly win: Float64Array;
  readonly fft: RealFft;
  private readonly bins: number;
  /** Window weight one output sample gets in steady sound (Σ w² over the overlapping frames). */
  private readonly norm: number;
  // Input: buffered samples from absolute index `inBase`.
  private input = new Float32Array(0);
  private inLen = 0;
  private inBase = 0;
  private inTotal = 0;
  private ended = false;
  // Output: overlap-add of samples and of window weights, from absolute index `outBase`.
  private acc: Float64Array;
  private wacc: Float64Array;
  private outBase: number;
  /**
   * Frame k is centred at aAnchor + k·Ha in the input and written at sAnchor + k·Hs. The grid starts
   * at 0 and is moved onto each attack, so the frame that starts after it begins exactly there and
   * is written exactly where the attack belongs in the output (its input time × ratio).
   */
  private aAnchor = 0;
  private sAnchor = 0;
  private k: number;
  private prevCentre = Number.NEGATIVE_INFINITY;
  private prevSynth = Number.NEGATIVE_INFINITY;
  private started = false;
  /** The attack the last frame started after (index into `onsets`), for the phase reset. */
  private lastLeft = -1;
  readonly frame: Float64Array;
  readonly mask: Float64Array;
  private readonly smask: Float64Array;
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly mag: Float64Array;
  readonly phase: Float64Array;
  readonly prevPhase: Float64Array;
  readonly synth: Float64Array;
  private readonly peakSynth: Float64Array;
  private readonly out: Float64Array;

  constructor(
    n: number,
    readonly ratio: number,
    /** Attack positions in this channel's input, ascending (shared, appended while streaming). */
    readonly onsets: readonly number[],
  ) {
    this.n = n;
    this.hs = n / 8;
    this.ha = this.hs / ratio;
    this.win = hann(n);
    this.fft = new RealFft(n);
    this.bins = n / 2 + 1;
    let s2 = 0;
    for (let off = 0; off < n; off += this.hs) s2 += (this.win[off] as number) ** 2;
    this.norm = s2;
    this.frame = new Float64Array(n);
    this.mask = new Float64Array(n);
    this.smask = new Float64Array(n);
    this.re = new Float64Array(this.bins);
    this.im = new Float64Array(this.bins);
    this.mag = new Float64Array(this.bins);
    this.phase = new Float64Array(this.bins);
    this.prevPhase = new Float64Array(this.bins);
    this.synth = new Float64Array(this.bins);
    this.peakSynth = new Float64Array(this.bins);
    this.out = new Float64Array(n);
    // First frame whose window reaches output 0: k·Hs + n/2 > 0.
    this.k = -(n / 2 / this.hs) + 1;
    this.outBase = this.k * this.hs - n / 2;
    this.acc = new Float64Array(4 * n);
    this.wacc = new Float64Array(4 * n);
  }

  push(samples: Float32Array) {
    const n = samples.length;
    if (this.inLen + n > this.input.length) {
      const next = new Float32Array(Math.max(this.inLen + n, 2 * this.input.length, 2 * this.n));
      next.set(this.input.subarray(0, this.inLen));
      this.input = next;
    }
    this.input.set(samples, this.inLen);
    this.inLen += n;
    this.inTotal += n;
  }

  end() {
    this.ended = true;
  }

  private sample(abs: number): number {
    if (abs < 0 || abs >= this.inTotal) return 0;
    return (this.input[abs - this.inBase] as number) ?? 0;
  }

  /** Runs every frame whose input is available; returns output samples now final. */
  pull(): Float64Array {
    const half = this.n / 2;
    while (true) {
      let centre = Math.round(this.aAnchor + this.k * this.ha);
      // An attack since the last frame: move the grid onto it.
      const o = this.onsetAfter(this.prevCentre);
      if (o !== undefined && o < centre && this.started) {
        this.aAnchor = o;
        this.sAnchor = o * this.ratio;
        this.k = 0;
        centre = o;
      }
      const synth = Math.max(this.prevSynth + 1, Math.round(this.sAnchor + this.k * this.hs));
      if (!this.ended && centre + half > this.inTotal) break;
      // After the end, frames continue until the output past the input's stretched end is written.
      if (this.ended && synth - half >= this.inTotal * this.ratio + this.n) break;
      this.analyse(centre, synth);
      this.prevCentre = centre;
      this.prevSynth = synth;
      this.k++;
      // Input no frame will read again (the next frame is centred after this one).
      const drop = centre - half - this.inBase;
      if (drop > 0 && drop <= this.inLen) {
        this.input.copyWithin(0, drop, this.inLen);
        this.inLen -= drop;
        this.inBase += drop;
      }
    }
    // Final: everything before the earliest start of the next frame (written after this one).
    const ready = Number.isFinite(this.prevSynth) ? this.prevSynth + 1 - half : this.outBase;
    const count = Math.max(0, ready - this.outBase);
    // Output before time 0 (the first frames reach back past it) is not part of the sound.
    const skip = Math.min(count, Math.max(0, -this.outBase));
    const result = new Float64Array(count - skip);
    // Where an attack cut frames short, fewer windows overlap: divide by what each sample received.
    const floor = this.norm * 0.05;
    for (let i = skip; i < count; i++) {
      const w = this.wacc[i] as number;
      result[i - skip] = (this.acc[i] as number) / (w > floor ? w : this.norm);
    }
    this.acc.copyWithin(0, count);
    this.acc.fill(0, this.acc.length - count);
    this.wacc.copyWithin(0, count);
    this.wacc.fill(0, this.wacc.length - count);
    this.outBase += count;
    return result;
  }

  /** The first attack after input position `t`. */
  private onsetAfter(t: number): number | undefined {
    const { onsets } = this;
    for (let i = onsets.length - 1; i >= 0; i--) {
      const o = onsets[i] as number;
      if (o <= t) return onsets[i + 1];
    }
    return onsets[0];
  }

  /**
   * The parts of the frame between the attacks around it, as 0–1 masks with short ramps: `mask` in
   * the input (frame centred at `centre`), `smask` in the output (written centred at `synthPos`, where
   * an attack at input time o belongs at o · ratio). Returns the index (into `onsets`) of the newest
   * attack at or before the centre, −1 for none.
   */
  private between(centre: number, synthPos: number): number {
    const { n, mask, smask, onsets, ratio } = this;
    const half = n / 2;
    let before = -1;
    let after = -1;
    for (let i = onsets.length - 1; i >= 0; i--) {
      const o = onsets[i] as number;
      if (o > centre) {
        after = i;
        continue;
      }
      before = i;
      break;
    }
    const fill = (m: Float64Array, lo: number, hi: number) => {
      for (let i = 0; i < n; i++) {
        const a = i < lo ? 0 : i < lo + EDGE && lo > 0 ? (i - lo + 0.5) / EDGE : 1;
        const b = i >= hi ? 0 : i >= hi - EDGE && hi < n ? (hi - i - 0.5) / EDGE : 1;
        m[i] = Math.max(0, Math.min(a, b));
      }
    };
    const oB = before >= 0 ? (onsets[before] as number) : undefined;
    const oA = after >= 0 ? (onsets[after] as number) : undefined;
    const lo = oB === undefined ? 0 : Math.max(0, oB - centre + half);
    const hi = oA === undefined ? n : Math.min(n, oA - centre + half);
    fill(mask, lo, hi);
    // In the output, a frame writes neither past what it read nor across where the attack belongs.
    fill(
      smask,
      oB === undefined ? 0 : Math.max(lo, Math.round(oB * ratio) - synthPos + half),
      oA === undefined ? n : Math.min(hi, Math.round(oA * ratio) - synthPos + half),
    );
    return before;
  }

  private analyse(centre: number, synthPos: number) {
    const { n, win, fft, re, im, mag, phase, prevPhase, synth, bins, frame, mask } = this;
    const half = n / 2;
    const before = this.between(centre, synthPos);
    // Windowed frame, rotated so its centre is sample 0 (phases measured at the frame centre).
    for (let i = 0; i < n; i++)
      frame[(i + half) % n] =
        this.sample(centre - half + i) * (win[i] as number) * (mask[i] as number);
    fft.forward(frame, re, im);
    let maxMag = 0;
    for (let k = 0; k < bins; k++) {
      const a = re[k] as number;
      const b = im[k] as number;
      const mm = Math.hypot(a, b);
      mag[k] = mm;
      phase[k] = Math.atan2(b, a);
      if (mm > maxMag) maxMag = mm;
    }
    const dA = centre - this.prevCentre;
    const hs = synthPos - this.prevSynth;
    const reset = !this.started || dA <= 0 || hs <= 0 || before !== this.lastLeft;
    this.lastLeft = before;
    if (reset) {
      // First frame, or the first after an attack: the analysis phases as they are.
      for (let k = 0; k < bins; k++) synth[k] = phase[k] as number;
    } else {
      // Peaks: local maxima over ±2 bins above a floor 100 dB under the frame's maximum.
      const floor = maxMag * 1e-5;
      const peaks: number[] = [];
      for (let k = 2; k < bins - 2; k++) {
        const v = mag[k] as number;
        if (
          v > floor &&
          v > (mag[k - 1] as number) &&
          v >= (mag[k + 1] as number) &&
          v > (mag[k - 2] as number) &&
          v >= (mag[k + 2] as number)
        )
          peaks.push(k);
      }
      if (peaks.length === 0) {
        for (let k = 0; k < bins; k++) {
          const omega = (TWO_PI * k) / n;
          const dev = princarg((phase[k] as number) - (prevPhase[k] as number) - omega * dA);
          synth[k] = (synth[k] as number) + (omega + dev / dA) * hs;
        }
      } else {
        // New phases at the peaks (each from the previous synthesis phase at that bin).
        const peakSynth = this.peakSynth;
        for (const k of peaks) {
          const omega = (TWO_PI * k) / n;
          const dev = princarg((phase[k] as number) - (prevPhase[k] as number) - omega * dA);
          peakSynth[k] = (synth[k] as number) + (omega + dev / dA) * hs;
        }
        // Each bin keeps its phase offset to the peak on its side of the lowest point between peaks.
        let from = 0;
        for (let p = 0; p < peaks.length; p++) {
          const pk = peaks[p] as number;
          let to = bins;
          const nextPk = peaks[p + 1];
          if (nextPk !== undefined) {
            to = pk;
            for (let j = pk; j <= nextPk; j++) if ((mag[j] as number) < (mag[to] as number)) to = j;
          }
          const ps = peakSynth[pk] as number;
          const pa = phase[pk] as number;
          for (let k = from; k < to; k++) synth[k] = ps + ((phase[k] as number) - pa);
          from = to;
        }
      }
    }
    for (let k = 0; k < bins; k++) {
      synth[k] = princarg(synth[k] as number);
      prevPhase[k] = phase[k] as number;
      const mm = mag[k] as number;
      re[k] = mm * Math.cos(synth[k] as number);
      im[k] = mm * Math.sin(synth[k] as number);
    }
    im[0] = 0;
    im[bins - 1] = 0;
    this.started = true;
    const out = this.out;
    fft.inverse(re, im, out);
    // Un-rotate, window, cut at the same attacks, and add at the synthesis position.
    const start = synthPos - half - this.outBase;
    if (start + n > this.acc.length) {
      const size = Math.max(start + n, 2 * this.acc.length);
      const a = new Float64Array(size);
      a.set(this.acc);
      this.acc = a;
      const w = new Float64Array(size);
      w.set(this.wacc);
      this.wacc = w;
    }
    for (let i = 0; i < n; i++) {
      const g = (win[i] as number) * (this.smask[i] as number);
      this.acc[start + i] = (this.acc[start + i] as number) + (out[(i + half) % n] as number) * g;
      this.wacc[start + i] = (this.wacc[start + i] as number) + g * g;
    }
  }
}

export interface PitchShifterOptions {
  sampleRate: number;
  channels: number;
  semitones: number;
  cents?: number;
  /** Keep attacks sharp (default on). Off processes every frame alike. */
  transients?: boolean;
}

/**
 * Streaming pitch shifter for planar float audio. `process` returns what is final (it holds back
 * about one frame); `flush` returns the rest, so the total equals the input's frame count exactly.
 */
export class PitchShifter {
  readonly ratio: number;
  private readonly channels: number;
  private readonly bypass: boolean;
  private readonly resampler?: SincResampler;
  private readonly stretchers: Stretcher[] = [];
  private readonly finder?: OnsetFinder;
  private readonly midSide: boolean;
  /** Output channels' final samples not yet handed out. */
  private pending: Float64Array[];
  private received = 0;
  private emitted = 0;

  constructor(o: PitchShifterOptions) {
    this.ratio = pitchRatio(o.semitones, o.cents ?? 0);
    this.channels = o.channels;
    this.bypass = Math.abs(this.ratio - 1) < 1e-9;
    this.midSide = o.channels === 2;
    this.pending = Array.from({ length: o.channels }, () => new Float64Array(0));
    if (this.bypass) return;
    this.resampler = new SincResampler(this.ratio, o.channels);
    const n = frameSizeFor(o.sampleRate);
    // Attacks are found on the sound as read (after the resampler), in the vocoder's own positions.
    this.finder = o.transients === false ? undefined : new OnsetFinder(o.sampleRate);
    const onsets = this.finder?.onsets ?? [];
    for (let c = 0; c < o.channels; c++) this.stretchers.push(new Stretcher(n, this.ratio, onsets));
  }

  private feed(planes: Float32Array[]) {
    let p = planes;
    if (this.midSide) {
      const l = p[0] as Float32Array;
      const r = (p[1] ?? l) as Float32Array;
      const mid = new Float32Array(l.length);
      const side = new Float32Array(l.length);
      for (let i = 0; i < l.length; i++) {
        mid[i] = ((l[i] as number) + (r[i] as number)) / 2;
        side[i] = ((l[i] as number) - (r[i] as number)) / 2;
      }
      p = [mid, side];
    }
    if (this.finder) {
      // Mono or mid; for more channels, their average.
      const first = p[0] as Float32Array;
      if (this.midSide || p.length === 1) this.finder.push(first);
      else {
        const sum = new Float32Array(first.length);
        for (const q of p)
          for (let i = 0; i < sum.length; i++) sum[i] = (sum[i] as number) + (q[i] ?? 0) / p.length;
        this.finder.push(sum);
      }
    }
    for (let c = 0; c < this.channels; c++)
      this.stretchers[c]?.push(p[c] ?? (p[0] as Float32Array));
  }

  private collect(): void {
    const outs = this.stretchers.map((s) => s.pull());
    const count = Math.min(...outs.map((o) => o.length));
    // Stretchers move in lockstep (same input lengths), so their outputs are equally long.
    this.pending = this.pending.map((prev, c) => {
      const add = (outs[c] as Float64Array).subarray(0, count);
      const joined = new Float64Array(prev.length + add.length);
      joined.set(prev);
      joined.set(add, prev.length);
      return joined;
    });
  }

  /** Hands out up to `limit` final frames (never more than came in, so the length stays exact). */
  private take(limit: number): Float32Array[] {
    const have = this.pending[0]?.length ?? 0;
    const count = Math.max(0, Math.min(have, limit));
    const out = Array.from({ length: this.channels }, () => new Float32Array(count));
    if (this.midSide) {
      const m = this.pending[0] as Float64Array;
      const s = this.pending[1] as Float64Array;
      const l = out[0] as Float32Array;
      const r = out[1] as Float32Array;
      for (let i = 0; i < count; i++) {
        l[i] = (m[i] as number) + (s[i] as number);
        r[i] = (m[i] as number) - (s[i] as number);
      }
    } else {
      for (let c = 0; c < this.channels; c++)
        (out[c] as Float32Array).set((this.pending[c] as Float64Array).subarray(0, count));
    }
    this.pending = this.pending.map((p) => p.slice(count));
    this.emitted += count;
    return out;
  }

  process(planes: Float32Array[], frames: number): Float32Array[] {
    if (this.bypass) return planes.map((p) => p.subarray(0, frames));
    this.received += frames;
    const read = (this.resampler as SincResampler).process(
      planes.map((p) => p.subarray(0, frames)),
    );
    this.feed(read);
    this.collect();
    return this.take(this.received - this.emitted);
  }

  flush(): Float32Array[] {
    if (this.bypass) return Array.from({ length: this.channels }, () => new Float32Array(0));
    this.feed((this.resampler as SincResampler).flush());
    for (const s of this.stretchers) s.end();
    this.collect();
    const missing = this.received - this.emitted;
    const out = this.take(missing);
    // The vocoder writes past the end; if it ever came out short, pad with silence to the exact length.
    const got = out[0]?.length ?? 0;
    if (got < missing)
      return out.map((p) => {
        const full = new Float32Array(missing);
        full.set(p);
        return full;
      });
    return out;
  }
}

/** Shifts whole planes at once (tests and the page's audition). */
export function shiftAll(
  planes: Float32Array[],
  sampleRate: number,
  semitones: number,
  cents = 0,
  transients = true,
): Float32Array[] {
  const s = new PitchShifter({ sampleRate, channels: planes.length, semitones, cents, transients });
  const frames = planes[0]?.length ?? 0;
  const parts: Float32Array[][] = [];
  const block = 4096;
  for (let i = 0; i < frames; i += block)
    parts.push(
      s.process(
        planes.map((p) => p.subarray(i, Math.min(frames, i + block))),
        Math.min(block, frames - i),
      ),
    );
  parts.push(s.flush());
  return planes.map((_, c) => {
    const out = new Float32Array(frames);
    let at = 0;
    for (const part of parts) {
      const p = part[c] as Float32Array;
      out.set(p.subarray(0, Math.min(p.length, frames - at)), at);
      at += p.length;
    }
    return out;
  });
}
