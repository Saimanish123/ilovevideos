/**
 * Tempo and key of a piece of music, from one streaming pass over its sound (any length; memory grows
 * by about 700 bytes per second of sound for the onset curve, nothing else).
 *
 * Tempo: an onset-strength curve (rectified rise of log-compressed spectra, 2048-point frames every
 * 256 samples at 44.1 and 48 kHz, scaled with the rate) is autocorrelated in 24 s windows; periods
 * from 30 to 300 BPM are scored with their double and half (a beat is strongest where its subdivisions
 * and bars agree) and weighted towards 120 BPM by one octave either way, which picks the level people
 * tap along to. The best period is then refined to 0.01 BPM by a comb over the whole curve (the
 * average onset strength on a grid of beats, best phase). The same comb in 16 s windows gives the
 * local tempo; when it moves by more than 2% across the piece, the result says so and gives the range.
 *
 * Key: spectral peaks (16 384-point frames every 8192 samples, interpolated, 55 Hz to 4.2 kHz) are
 * gathered into a 10-cent pitch-class histogram, weighted by compressed magnitude; the tuning is
 * the histogram's circular mean, and the 12-class chroma read around it is correlated with
 * Temperley's major and minor profiles in all 24 keys. Confidence comes from how far the best key
 * stands above the next.
 *
 * Pure: no DOM, no mediabunny. The analysis worker feeds it decoded blocks.
 */
import { hann, RealFft } from "./fft";

/**
 * The onset curve reads up to 4 kHz with log(1 + 10·|X|): measured on synthetic tracks, a curve to
 * 11 kHz with stronger compression let quiet broadband hi-hats outweigh the kick and doubled slow
 * tempos (75 → 150 BPM).
 */
const ONSET_MAX_HZ = 4000;
const ONSET_COMPRESSION = 10;
/** Preferred tempo: a log-normal weight centred here, one octave wide. */
const PRIOR_BPM = 130;

/* ---------- streaming features ---------- */

export interface MusicFeatures {
  /** Onset strength per frame. */
  onset: Float32Array;
  /** Frames per second of `onset`. */
  frameRate: number;
  /** Pitch-class histogram, 120 bins (10 cents each), bin 0 centred on C. */
  pitch: Float64Array;
  /** Seconds of sound read. */
  seconds: number;
  /** Seconds above −60 dBFS (in 0.1 s steps): is there music at all. */
  audibleSeconds: number;
}

export class MusicFeatureReader {
  private readonly rate: number;
  private readonly onsetN: number;
  private readonly hop: number;
  private readonly chromaN: number;
  private readonly chromaHop: number;
  private readonly onsetFft: RealFft;
  private readonly chromaFft: RealFft;
  readonly onsetWin: Float64Array;
  readonly chromaWin: Float64Array;
  /** Mono samples not yet consumed by both analyses, from absolute index `base`. */
  private buf = new Float32Array(1 << 16);
  private len = 0;
  private base = 0;
  private nextOnset = 0;
  private nextChroma = 0;
  prevLog: Float64Array;
  private onset: number[] = [];
  private readonly pitch = new Float64Array(120);
  private total = 0;
  private audible = 0;
  private blockEnergy = 0;
  private blockCount = 0;
  readonly frame: Float64Array;
  readonly cframe: Float64Array;
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly cre: Float64Array;
  readonly cim: Float64Array;
  private readonly bins: number;

  constructor(sampleRate: number) {
    this.rate = sampleRate;
    const scale = sampleRate < 32_000 ? 0.5 : sampleRate > 64_000 ? 2 : 1;
    this.onsetN = 2048 * scale;
    this.hop = 256 * scale;
    this.chromaN = 16_384 * scale;
    this.chromaHop = this.chromaN / 2;
    this.onsetFft = new RealFft(this.onsetN);
    this.chromaFft = new RealFft(this.chromaN);
    this.onsetWin = hann(this.onsetN);
    this.chromaWin = hann(this.chromaN);
    this.frame = new Float64Array(this.onsetN);
    this.cframe = new Float64Array(this.chromaN);
    this.re = new Float64Array(this.onsetN / 2 + 1);
    this.im = new Float64Array(this.onsetN / 2 + 1);
    this.cre = new Float64Array(this.chromaN / 2 + 1);
    this.cim = new Float64Array(this.chromaN / 2 + 1);
    // Onset bins up to 11 kHz.
    this.bins = Math.min(this.onsetN / 2, Math.round((ONSET_MAX_HZ / sampleRate) * this.onsetN));
    this.prevLog = new Float64Array(this.bins);
  }

  /** Planar blocks of any channel count; mixed to mono. */
  push(planes: Float32Array[], frames: number) {
    if (frames <= 0) return;
    if (this.len + frames > this.buf.length) {
      const next = new Float32Array(Math.max(this.len + frames, 2 * this.buf.length));
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    const ch = planes.length || 1;
    const blockSize = Math.round(this.rate / 10);
    for (let i = 0; i < frames; i++) {
      let v = 0;
      for (const p of planes) v += p[i] ?? 0;
      v /= ch;
      this.buf[this.len + i] = v;
      this.blockEnergy += v * v;
      if (++this.blockCount === blockSize) {
        if (this.blockEnergy / blockSize > 1e-6) this.audible += 0.1;
        this.blockEnergy = 0;
        this.blockCount = 0;
      }
    }
    this.len += frames;
    this.total += frames;
    this.run(false);
  }

  private at(abs: number) {
    const i = abs - this.base;
    return i >= 0 && i < this.len ? (this.buf[i] as number) : 0;
  }

  private run(final: boolean) {
    const end = this.base + this.len;
    // Frames are centred on their position; the first is centred on sample 0.
    while (this.nextOnset + this.onsetN / 2 <= end || (final && this.nextOnset < end)) {
      this.onsetFrame(this.nextOnset);
      this.nextOnset += this.hop;
    }
    while (this.nextChroma + this.chromaN / 2 <= end || (final && this.nextChroma < end)) {
      this.chromaFrame(this.nextChroma);
      this.nextChroma += this.chromaHop;
    }
    const keep = Math.min(this.nextOnset - this.onsetN / 2, this.nextChroma - this.chromaN / 2);
    const drop = keep - this.base;
    if (drop > 0 && drop <= this.len) {
      this.buf.copyWithin(0, drop, this.len);
      this.len -= drop;
      this.base += drop;
    }
  }

  private onsetFrame(centre: number) {
    const { onsetN: n, frame, onsetWin: w, re, im, prevLog, bins } = this;
    for (let i = 0; i < n; i++) frame[i] = this.at(centre - n / 2 + i) * (w[i] as number);
    this.onsetFft.forward(frame, re, im);
    let flux = 0;
    for (let k = 1; k < bins; k++) {
      const mag = Math.hypot(re[k] as number, im[k] as number);
      const l = Math.log1p(ONSET_COMPRESSION * mag);
      const d = l - (prevLog[k] as number);
      if (d > 0) flux += d;
      prevLog[k] = l;
    }
    this.onset.push(flux);
  }

  private chromaFrame(centre: number) {
    const { chromaN: n, cframe, chromaWin: w, cre, cim, rate } = this;
    for (let i = 0; i < n; i++) cframe[i] = this.at(centre - n / 2 + i) * (w[i] as number);
    this.chromaFft.forward(cframe, cre, cim);
    const lo = Math.max(2, Math.floor((55 / rate) * n));
    const hi = Math.min(n / 2 - 2, Math.ceil((4200 / rate) * n));
    const mag = new Float64Array(hi + 2);
    let max = 0;
    for (let k = lo - 1; k <= hi + 1; k++) {
      mag[k] = Math.hypot(cre[k] as number, cim[k] as number);
      if ((mag[k] as number) > max) max = mag[k] as number;
    }
    if (max <= 1e-9) return;
    for (let k = lo; k <= hi; k++) {
      const m = mag[k] as number;
      if (m < max * 0.01 || m <= (mag[k - 1] as number) || m < (mag[k + 1] as number)) continue;
      // Parabolic interpolation on log magnitude for the peak's frequency.
      const a = Math.log((mag[k - 1] as number) + 1e-12);
      const b = Math.log(m + 1e-12);
      const c = Math.log((mag[k + 1] as number) + 1e-12);
      const den = a - 2 * b + c;
      const d = den !== 0 ? (0.5 * (a - c)) / den : 0;
      const hz = ((k + d) * rate) / n;
      const midi = 69 + 12 * Math.log2(hz / 440);
      const pc = (((midi % 12) + 12) % 12) * 10;
      const idx = Math.round(pc) % 120;
      this.pitch[idx] = (this.pitch[idx] as number) + Math.sqrt(m / max);
    }
  }

  finish(): MusicFeatures {
    this.run(true);
    return {
      onset: Float32Array.from(this.onset),
      frameRate: this.rate / this.hop,
      pitch: this.pitch,
      seconds: this.total / this.rate,
      audibleSeconds: this.audible,
    };
  }
}

/* ---------- tempo ---------- */

export interface TempoResult {
  /** Beats per minute, to 0.1; undefined when no steady beat was found. */
  bpm?: number;
  /** Half and double, for music counted the other way. */
  half?: number;
  double?: number;
  /** When the tempo moves through the piece: the lowest and highest local tempo. */
  range?: { min: number; max: number };
  /** 0–1: how much the beat grid stands out of the onset curve. */
  strength: number;
}

/** The onset curve made zero-mean and positive: rises above the local average only. */
function prepare(onset: Float32Array, frameRate: number): Float64Array {
  const n = onset.length;
  const out = new Float64Array(n);
  const half = Math.max(1, Math.round(frameRate * 0.25));
  let sum = 0;
  let count = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < n; i++) {
    while (hi < Math.min(n - 1, i + half)) {
      hi++;
      sum += onset[hi] as number;
      count++;
    }
    while (lo < i - half) {
      sum -= onset[lo] as number;
      lo++;
      count--;
    }
    out[i] = Math.max(0, (onset[i] as number) - sum / count);
  }
  return out;
}

/** Autocorrelation of `x[from..from+len)` for lags 0..maxLag (direct; maxLag is small). */
function autocorr(x: Float64Array, from: number, len: number, maxLag: number, out: Float64Array) {
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = from; i < from + len - lag; i++) s += (x[i] as number) * (x[i + lag] as number);
    out[lag] = (out[lag] as number) + s / Math.max(1, len - lag);
  }
}

/**
 * How strongly a beat grid of `period` frames fits `x[from..to)`: the curve folded modulo the period
 * into one-frame phase bins; the best bin's mean (with its neighbours, a beat need not land on a
 * frame). A slightly wrong period drifts across the bins over a long piece and scores lower, which
 * is what makes the refinement precise. O(length).
 */
function comb(x: Float64Array, from: number, to: number, period: number): number {
  const bins = Math.max(8, Math.round(period));
  const sum = new Float64Array(bins);
  const count = new Float64Array(bins);
  for (let i = from; i < to; i++) {
    const phase = ((i - from) % period) / period;
    const b = Math.min(bins - 1, Math.floor(phase * bins));
    sum[b] = (sum[b] as number) + (x[i] as number);
    count[b] = (count[b] as number) + 1;
  }
  let best = 0;
  for (let b = 0; b < bins; b++) {
    const l = (b + bins - 1) % bins;
    const r = (b + 1) % bins;
    const c = (count[l] as number) + (count[b] as number) + (count[r] as number);
    const s = (sum[l] as number) + (sum[b] as number) + (sum[r] as number);
    if (c > 0 && s / c > best) best = s / c;
  }
  return best;
}

/** Best period near `around` (frames), searched ±`spread` (share) in `steps`, by the comb. */
function refine(
  x: Float64Array,
  from: number,
  to: number,
  around: number,
  spread: number,
  steps: number,
) {
  let best = around;
  let bestScore = -1;
  for (let i = -steps; i <= steps; i++) {
    const period = around * (1 + (spread * i) / steps);
    const s = comb(x, from, to, period);
    if (s > bestScore) {
      bestScore = s;
      best = period;
    }
  }
  return { period: best, score: bestScore };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function estimateTempo(f: MusicFeatures): TempoResult {
  const fr = f.frameRate;
  const x = prepare(f.onset, fr);
  const n = x.length;
  if (n < fr * 6 || f.audibleSeconds < 4) return { strength: 0 };
  const minLag = Math.floor((60 * fr) / 300);
  const maxLag = Math.ceil((60 * fr) / 30);
  // Autocorrelation summed over 24 s windows (half overlapping), so a long file costs little.
  const win = Math.min(n, Math.round(fr * 24));
  const ac = new Float64Array(maxLag * 2 + 2);
  let windows = 0;
  for (let from = 0; from + win <= n; from += Math.max(1, Math.round(win / 2))) {
    autocorr(x, from, win, Math.min(ac.length - 1, win - 1), ac);
    windows++;
    if (windows > 400) break;
  }
  const zero = ac[0] as number;
  if (!(zero > 0)) return { strength: 0 };
  // Score each period with its double and half, weighted towards 120 BPM (one octave either way).
  let bestLag = 0;
  let bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fr) / lag;
    const prior = Math.exp(-0.5 * Math.log2(bpm / PRIOR_BPM) ** 2);
    const s = (ac[lag] as number) * prior;
    if (s > bestScore) {
      bestScore = s;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return { strength: 0 };
  // Refine on the whole curve: coarse then fine.
  const coarse = refine(x, 0, n, bestLag, 0.04, 40);
  const fine = refine(x, 0, n, coarse.period, 0.004, 40);
  // How much the grid stands out: against grids at periods unrelated to it (not ×2, ×3/2 or their
  // inverses) on the same curve, which any curve fits about as well by chance. Measured: synthetic
  // tracks 0.9 and above, white noise about 0.1.
  const off = [0.77, 0.83, 0.91, 1.09, 1.17, 1.23, 1.29, 1.41];
  let baseline = 0;
  for (const m of off) baseline += comb(x, 0, n, fine.period * m) / off.length;
  const strength = fine.score > 0 ? Math.max(0, Math.min(1, 1 - baseline / fine.score)) : 0;
  if (strength < 0.35) return { strength };
  const bpm = (60 * fr) / fine.period;
  // Local tempo in 16 s windows, at the same metrical level.
  const local: number[] = [];
  const lw = Math.round(fr * 16);
  if (n >= lw * 2) {
    for (let from = 0; from + lw <= n; from += Math.round(lw / 2)) {
      const r = refine(x, from, from + lw, fine.period, 0.12, 60);
      local.push((60 * fr) / r.period);
    }
  }
  let range: TempoResult["range"];
  if (local.length >= 3) {
    const sorted = [...local].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.1)] as number;
    const hi = sorted[Math.ceil(sorted.length * 0.9) - 1] as number;
    if ((hi - lo) / bpm > 0.02) {
      range = { min: round1(lo), max: round1(hi) };
    }
  }
  // A moving tempo: the average of the local tempos, which the global comb only approximates.
  const reported = range ? local.reduce((s, v) => s + v, 0) / local.length : bpm;
  return {
    bpm: round1(reported),
    half: round1(reported / 2),
    double: round1(reported * 2),
    range,
    strength,
  };
}

/* ---------- key ---------- */

/**
 * Key profiles of Temperley's Kostka–Payne corpus (Temperley 2007). Measured on 24 synthetic keys
 * (tests/unit/sound-music.test.ts), both these and Krumhansl–Kessler's name every key, but these
 * hold the runner-up 0.13 to 0.22 below the winner where Krumhansl–Kessler's leave the parallel key
 * within 0.01 to 0.14 (every note's fifth harmonic adds a major third).
 */
const MAJOR_PROFILE = [
  0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4,
];
const MINOR_PROFILE = [
  0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133, 0.33,
];

/** Note names by pitch class; sharps for the sharp keys, flats for the flat ones. */
const SHARP = [
  "C",
  "C-sharp",
  "D",
  "D-sharp",
  "E",
  "F",
  "F-sharp",
  "G",
  "G-sharp",
  "A",
  "A-sharp",
  "B",
];
const FLAT = ["C", "D-flat", "D", "E-flat", "E", "F", "G-flat", "G", "A-flat", "A", "B-flat", "B"];

export interface Key {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  mode: "major" | "minor";
}

export interface KeyResult {
  key?: Key;
  /** "A minor". */
  name?: string;
  /** The relative key ("C major" for A minor). */
  relative?: string;
  /** Camelot wheel code, "8A". */
  camelot?: string;
  confidence: "high" | "medium" | "low";
  /** The runner-up key. */
  next?: string;
  /** Tuning of the recording against A = 440 Hz, in cents. */
  tuningCents: number;
}

/**
 * "A minor", "E-flat major", "F-sharp minor": sharps or flats as the key signature has them, spelled
 * out (the symbols fall back to another font and read badly in screen readers).
 */
export function keyName(k: Key): string {
  // Keys written with flats: F, B-flat, E-flat, A-flat, D-flat major; D, G, C, F, B-flat, E-flat minor.
  const flatMajor = [5, 10, 3, 8, 1];
  const flatMinor = [2, 7, 0, 5, 10, 3];
  const flats = k.mode === "major" ? flatMajor.includes(k.tonic) : flatMinor.includes(k.tonic);
  const names = flats ? FLAT : SHARP;
  return `${names[k.tonic]} ${k.mode}`;
}

export const relativeKey = (k: Key): Key =>
  k.mode === "major"
    ? { tonic: (k.tonic + 9) % 12, mode: "minor" }
    : { tonic: (k.tonic + 3) % 12, mode: "major" };

/** Camelot code: C major 8B, A minor 8A; one step clockwise per fifth. */
export function camelot(k: Key): string {
  const major = k.mode === "major" ? k.tonic : (k.tonic + 3) % 12;
  const fifths = (major * 7) % 12;
  return `${((fifths + 7) % 12) + 1}${k.mode === "major" ? "B" : "A"}`;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Correlation of a 12-class chroma with every key, best first. */
export function rankKeys(chroma: number[]): { key: Key; r: number }[] {
  const out: { key: Key; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++)
    for (const mode of ["major", "minor"] as const) {
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      const rotated = Array.from(
        { length: 12 },
        (_, i) => profile[(i - tonic + 12) % 12] as number,
      );
      out.push({ key: { tonic, mode }, r: pearson(chroma, rotated) });
    }
  return out.sort((a, b) => b.r - a.r);
}

export function estimateKey(f: MusicFeatures): KeyResult {
  const h = f.pitch;
  let total = 0;
  for (const v of h) total += v;
  if (!(total > 0) || f.audibleSeconds < 2) return { confidence: "low", tuningCents: 0 };
  // Tuning: circular mean of the 10-cent bins within each semitone.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < 120; i++) {
    const a = (2 * Math.PI * (i % 10)) / 10;
    sx += (h[i] as number) * Math.cos(a);
    sy += (h[i] as number) * Math.sin(a);
  }
  let tuning = (Math.atan2(sy, sx) / (2 * Math.PI)) * 10; // in bins (10 cents)
  if (tuning > 5) tuning -= 10;
  // Chroma: each semitone's five bins on either side of its tuned centre.
  const chroma = Array.from({ length: 12 }, (_, pc) => {
    let s = 0;
    for (let d = -5; d < 5; d++) {
      const i = (((Math.round(pc * 10 + tuning) + d) % 120) + 120) % 120;
      s += h[i] as number;
    }
    return s;
  });
  const ranked = rankKeys(chroma);
  const best = ranked[0] as { key: Key; r: number };
  const rel = relativeKey(best.key);
  const rival = ranked[1] as { key: Key; r: number };
  const margin = best.r - rival.r;
  const confidence =
    best.r > 0.6 && margin >= 0.1 ? "high" : best.r > 0.45 && margin >= 0.05 ? "medium" : "low";
  return {
    key: best.key,
    name: keyName(best.key),
    relative: keyName(rel),
    camelot: camelot(best.key),
    confidence,
    next: keyName(rival.key),
    tuningCents: Math.round(tuning * 10),
  };
}
