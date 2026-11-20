/**
 * Silence detection for jump cuts. The sound is reduced to a level per 10 ms window (mean square
 * across channels, in dBFS); a pause is a run of windows under the threshold at least `minSilence`
 * long, where blips shorter than 40 ms (a click, a breath's edge) do not break the run. Each pause
 * keeps `padding` seconds of itself on both sides, so words are not clipped; what is left of it is
 * cut. Pure: no DOM, no mediabunny. The panel and the engine call the same function, so the cuts
 * shown before running are the cuts made.
 */

/** Length of one level window. */
export const WINDOW_SEC = 0.01;
/** Louder moments shorter than this inside a pause do not end it. */
const BLIP_SEC = 0.04;
/** Cuts shorter than this after padding are not worth a jump. */
const MIN_CUT_SEC = 0.05;

export interface SilenceOptions {
  /** dBFS under which a window counts as silent. */
  thresholdDb: number;
  /** Seconds a pause must last to be cut. */
  minSilence: number;
  /** Seconds of each pause kept on either side. */
  padding: number;
}

export interface Span {
  start: number;
  end: number;
}

/** Streaming level meter: mean square per 10 ms window across channels, as dBFS values. */
export class LevelWindows {
  private readonly size: number;
  private sum = 0;
  private count = 0;
  readonly levels: number[] = [];
  constructor(sampleRate: number) {
    this.size = Math.max(1, Math.round(sampleRate * WINDOW_SEC));
  }
  push(planes: Float32Array[], n = planes[0]?.length ?? 0) {
    const ch = Math.max(1, planes.length);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const p of planes) {
        const v = p[i] ?? 0;
        s += v * v;
      }
      this.sum += s / ch;
      if (++this.count === this.size) this.close();
    }
  }
  /** Closes a partial last window. */
  finish(): Float32Array {
    if (this.count > 0) this.close();
    return Float32Array.from(this.levels);
  }
  private close() {
    const ms = this.sum / this.count;
    this.levels.push(ms > 1e-12 ? 10 * Math.log10(ms) : -120);
    this.sum = 0;
    this.count = 0;
  }
}

/**
 * A threshold to start from: 8 dB above the recording's noise floor (the 10th percentile of its
 * levels, ignoring digital silence), kept between −55 and −30 dBFS. Rounded to whole dB.
 */
export function suggestThreshold(levels: Float32Array): number {
  const audible = Array.from(levels).filter((l) => l > -100);
  if (audible.length === 0) return -40;
  audible.sort((a, b) => a - b);
  const floor = audible[Math.floor(audible.length * 0.1)] ?? -60;
  return Math.round(Math.min(-30, Math.max(-55, floor + 8)));
}

/** Pauses: runs of windows under the threshold, at least `minSilence` long, blips bridged. */
export function findPauses(levels: Float32Array, o: SilenceOptions): Span[] {
  const quiet: Span[] = [];
  let runStart = -1;
  for (let i = 0; i <= levels.length; i++) {
    const silent = i < levels.length && (levels[i] ?? 0) < o.thresholdDb;
    if (silent && runStart < 0) runStart = i;
    if (!silent && runStart >= 0) {
      quiet.push({ start: runStart * WINDOW_SEC, end: i * WINDOW_SEC });
      runStart = -1;
    }
  }
  // Bridge blips: two quiet runs with less than BLIP_SEC of sound between them are one pause.
  const merged: Span[] = [];
  for (const q of quiet) {
    const last = merged.at(-1);
    if (last && q.start - last.end < BLIP_SEC) last.end = q.end;
    else merged.push({ ...q });
  }
  return merged.filter((p) => p.end - p.start >= o.minSilence);
}

/**
 * What to cut: each pause minus the padding at both ends. A pause at the very start or end keeps
 * padding only on its inner side (there is no word before the first one). Clamped to `duration`.
 */
export function silenceCuts(levels: Float32Array, o: SilenceOptions, duration: number): Span[] {
  const end = Math.min(duration, levels.length * WINDOW_SEC);
  return cutsFromPauses(findPauses(levels, o), o.padding, duration, end);
}

/**
 * Pauses (from levels or from speech, ./speech) to cuts: each pause minus `padding` at both ends; a
 * pause at the very start or end (reaching `end`, the end of the measured sound) keeps padding only
 * on its inner side. Clamped to `duration`; cuts shorter than 50 ms are dropped.
 */
export function cutsFromPauses(
  pauses: readonly Span[],
  padding: number,
  duration: number,
  end = duration,
): Span[] {
  return pauses
    .map((p) => ({
      start: p.start <= 1e-9 ? 0 : p.start + padding,
      end: p.end >= end - 1e-9 ? duration : p.end - padding,
    }))
    .map((c) => ({ start: Math.max(0, c.start), end: Math.min(duration, c.end) }))
    .filter((c) => c.end - c.start >= MIN_CUT_SEC);
}

/** The parts kept between the cuts, in order. */
export function keptSpans(cuts: readonly Span[], duration: number): Span[] {
  const kept: Span[] = [];
  let at = 0;
  for (const c of cuts) {
    if (c.start > at + 1e-9) kept.push({ start: at, end: c.start });
    at = Math.max(at, c.end);
  }
  if (duration > at + 1e-9) kept.push({ start: at, end: duration });
  return kept;
}

/** Seconds removed by a set of cuts. */
export const removedSeconds = (cuts: readonly Span[]) =>
  cuts.reduce((s, c) => s + (c.end - c.start), 0);

/**
 * Moves every cut edge onto a video frame time (the nearest one), so picture and sound are cut at the
 * same instants and never drift apart however many cuts there are. `frames` are ascending times.
 */
export function snapToFrames(cuts: readonly Span[], frames: readonly number[]): Span[] {
  if (frames.length === 0) return [...cuts];
  const nearest = (t: number) => {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((frames[mid] ?? 0) < t) lo = mid + 1;
      else hi = mid;
    }
    const a = frames[lo] ?? t;
    const b = frames[lo - 1];
    return b !== undefined && Math.abs(b - t) < Math.abs(a - t) ? b : a;
  };
  return cuts
    .map((c) => ({
      start: nearest(c.start),
      end: c.end >= (frames.at(-1) ?? 0) ? c.end : nearest(c.end),
    }))
    .filter((c) => c.end - c.start > 1e-6);
}
