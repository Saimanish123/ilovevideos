/**
 * Faces found on sampled frames, followed through time. Pure; unit-tested in
 * tests/unit/vision-track.test.ts and measured on the face fixtures (tests/e2e/blur-faces.spec.ts).
 *
 * The whole file is known before tracking, so this works offline:
 * 1. Forward pass (every track ends at a cut between shots): each track predicts its box at the
 *    next sample (constant velocity from its last two detections, halved, as faces drift rather
 *    than fly); a detection joins the track it overlaps best (IoU at least `minIou`, or centres
 *    closer than `maxJump` of the face size, for quick moves between samples). Best pairs first.
 *    Unmatched detections start tracks. After `maxGapSec` unseen, a track only takes a detection
 *    in the place it was last seen (IoU at least `bridgeIou`: a head that turned away and back,
 *    covered in between, which is what a person blurring by hand would do); after `bridgeSec` it
 *    ends.
 * 2. Evidence: a track needs `minHits` detections, or one detection scoring at least `sureScore`
 *    (a face seen once for a fifth of a second is real; a one-off weak box is usually not).
 * 3. Smoothing: centre and size are smoothed with a Gaussian-weighted local straight-line fit over
 *    the detections (sigma in samples; size more than position), so the box neither lags nor
 *    jitters, at the ends of a track included. Between detections, gaps included, the box moves in
 *    a straight line (`boxAt`).
 */
import { type FaceBox, iou } from "./yunet";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SampleFaces {
  /** Seconds. */
  t: number;
  faces: FaceBox[];
}

/** A smoothed detection. */
export interface TrackPoint extends Box {
  t: number;
}

export interface Track {
  id: number;
  points: TrackPoint[];
  /** Best detection score on the track. */
  score: number;
  hits: number;
}

export interface TrackOptions {
  minIou: number;
  /** Centre distance, as a share of the larger side of the box, that still matches. */
  maxJump: number;
  maxGapSec: number;
  bridgeSec: number;
  bridgeIou: number;
  minHits: number;
  sureScore: number;
  /** Gaussian sigma, in samples, for the centre and for the size. */
  sigmaPosition: number;
  sigmaSize: number;
}

export const DEFAULT_TRACK: TrackOptions = {
  minIou: 0.2,
  maxJump: 0.75,
  maxGapSec: 1,
  bridgeSec: 3,
  bridgeIou: 0.3,
  minHits: 2,
  sureScore: 0.85,
  sigmaPosition: 0.8,
  sigmaSize: 1.5,
};

interface Live {
  id: number;
  dets: (Box & { t: number; score: number })[];
}

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Smallest mean grey difference (0 to 255, 32×18 copies) between samples that can be a cut. */
export const CUT_MIN_DIFF = 28;

/**
 * Cuts between shots, from the mean grey difference of each sample to the one before: at least
 * `CUT_MIN_DIFF` and twice the median of the three differences on each side. Local, because a pan
 * between samples a fifth of a second apart differs as much everywhere (about 23 at 133 px/s in
 * 720p) while a cut stands out from its neighbours (50 to 66 on the fixtures). A false cut only
 * splits a face's region in two with no gap; a missed one lets a region slide off a face.
 */
export function sampleCuts(diffs: readonly { t: number; d: number }[]): number[] {
  return diffs
    .filter((x, i) => {
      if (x.d < CUT_MIN_DIFF) return false;
      const around = [...diffs.slice(Math.max(0, i - 3), i), ...diffs.slice(i + 1, i + 4)]
        .map((y) => y.d)
        .sort((p, q) => p - q);
      if (around.length === 0) return true;
      const m = around.length;
      const median =
        m % 2 ? (around[(m - 1) / 2] ?? 0) : ((around[m / 2 - 1] ?? 0) + (around[m / 2] ?? 0)) / 2;
      return x.d >= 2 * median;
    })
    .map((x) => x.t);
}

/** Where a track's face should be at `t`. */
function predict(l: Live, t: number): Box {
  const last = l.dets[l.dets.length - 1] as Box & { t: number };
  const prev = l.dets[l.dets.length - 2];
  if (!prev || last.t <= prev.t) return last;
  const k = (0.5 * (t - last.t)) / (last.t - prev.t);
  return {
    x: last.x + (last.x - prev.x) * k,
    y: last.y + (last.y - prev.y) * k,
    width: last.width,
    height: last.height,
  };
}

/** How well a detection fits a prediction: IoU, or a weaker score from centre distance. */
function affinity(pred: Box, det: Box, o: TrackOptions): number {
  const overlap = iou(pred, det);
  if (overlap >= o.minIou) return 1 + overlap;
  const a = centre(pred);
  const b = centre(det);
  const size = Math.max(pred.width, pred.height, det.width, det.height);
  const ratio = Math.max(det.width / pred.width, pred.width / det.width);
  const dist = Math.hypot(a.x - b.x, a.y - b.y) / size;
  if (dist > o.maxJump || ratio > 1.6) return 0;
  return 1 - dist / o.maxJump;
}

/**
 * Smooths a series with a Gaussian-weighted straight-line fit around each point (local linear
 * regression): jitter averages out, and a steady move, ends included, is not pulled back.
 */
function smooth(times: number[], values: number[], sigma: number): number[] {
  if (sigma <= 0 || values.length < 3) return values;
  const r = Math.ceil(sigma * 3);
  return values.map((v, i) => {
    let sw = 0;
    let st = 0;
    let sv = 0;
    let stt = 0;
    let stv = 0;
    const t0 = times[i] ?? 0;
    for (let j = Math.max(0, i - r); j <= Math.min(values.length - 1, i + r); j++) {
      const w = Math.exp(-((j - i) ** 2) / (2 * sigma * sigma));
      const t = (times[j] ?? 0) - t0;
      const y = values[j] ?? 0;
      sw += w;
      st += w * t;
      sv += w * y;
      stt += w * t * t;
      stv += w * t * y;
    }
    const det = sw * stt - st * st;
    // The fit's value at t0 (the intercept); a plain weighted mean where the times do not spread.
    return Math.abs(det) > 1e-12 ? (stt * sv - st * stv) / det : sw > 0 ? sv / sw : v;
  });
}

/** Tracks from detections on samples (sorted by time), numbered from 1 in order of appearance. */
export function trackFaces(
  samples: SampleFaces[],
  o: TrackOptions = DEFAULT_TRACK,
  /** Sample times that start a new shot: every track ends before them. */
  cuts: readonly number[] = [],
): Track[] {
  let nextId = 1;
  const live: Live[] = [];
  const done: Live[] = [];
  const cutAt = new Set(cuts);
  for (const s of samples) {
    if (cutAt.has(s.t)) done.push(...live.splice(0));
    // Retire tracks unseen for too long.
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i] as Live;
      const lastT = (l.dets[l.dets.length - 1] as { t: number }).t;
      if (s.t - lastT > o.bridgeSec) {
        done.push(l);
        live.splice(i, 1);
      }
    }
    const pairs: { l: Live; d: number; a: number }[] = [];
    for (const l of live) {
      const last = l.dets[l.dets.length - 1] as Box & { t: number };
      const bridging = s.t - last.t > o.maxGapSec;
      const pred = predict(l, s.t);
      s.faces.forEach((f, d) => {
        const a = bridging
          ? iou(last, f) >= o.bridgeIou
            ? iou(last, f)
            : 0
          : affinity(pred, f, o);
        if (a > 0) pairs.push({ l, d, a });
      });
    }
    pairs.sort((p, q) => q.a - p.a);
    const usedTracks = new Set<Live>();
    const usedDets = new Set<number>();
    for (const p of pairs) {
      if (usedTracks.has(p.l) || usedDets.has(p.d)) continue;
      const f = s.faces[p.d] as FaceBox;
      p.l.dets.push({ t: s.t, x: f.x, y: f.y, width: f.width, height: f.height, score: f.score });
      usedTracks.add(p.l);
      usedDets.add(p.d);
    }
    s.faces.forEach((f, d) => {
      if (usedDets.has(d)) return;
      live.push({
        id: nextId++,
        dets: [{ t: s.t, x: f.x, y: f.y, width: f.width, height: f.height, score: f.score }],
      });
    });
  }
  done.push(...live);

  const tracks: Track[] = [];
  for (const l of done.sort((a, b) => a.id - b.id)) {
    const best = Math.max(...l.dets.map((d) => d.score));
    if (l.dets.length < o.minHits && best < o.sureScore) continue;
    const times = l.dets.map((d) => d.t);
    const cx = smooth(
      times,
      l.dets.map((d) => d.x + d.width / 2),
      o.sigmaPosition,
    );
    const cy = smooth(
      times,
      l.dets.map((d) => d.y + d.height / 2),
      o.sigmaPosition,
    );
    const w = smooth(
      times,
      l.dets.map((d) => d.width),
      o.sigmaSize,
    );
    const h = smooth(
      times,
      l.dets.map((d) => d.height),
      o.sigmaSize,
    );
    const points: TrackPoint[] = l.dets.map((d, i) => {
      const ww = w[i] ?? d.width;
      const hh = h[i] ?? d.height;
      return {
        t: d.t,
        x: (cx[i] ?? 0) - ww / 2,
        y: (cy[i] ?? 0) - hh / 2,
        width: ww,
        height: hh,
      };
    });
    tracks.push({ id: tracks.length + 1, points, score: best, hits: l.dets.length });
  }
  return tracks;
}

/** A track's box at `t` (straight lines between points; held before the first and after the last). */
export function boxAt(track: Track, t: number): Box {
  const p = track.points;
  const first = p[0] as TrackPoint;
  if (t <= first.t || p.length === 1) return first;
  const last = p[p.length - 1] as TrackPoint;
  if (t >= last.t) return last;
  let i = 1;
  while (i < p.length - 1 && (p[i] as TrackPoint).t < t) i++;
  const a = p[i - 1] as TrackPoint;
  const b = p[i] as TrackPoint;
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  const mix = (u: number, v: number) => u + (v - u) * k;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    width: mix(a.width, b.width),
    height: mix(a.height, b.height),
  };
}
