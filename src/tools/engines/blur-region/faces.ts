/**
 * Found faces to blur regions (ADR-0113): each face track (../vision/track) becomes an ellipse
 * region that follows it with key frames, which the user then reviews with the ordinary region
 * tools. Pure; shared by the page and the unit tests.
 *
 * - The ellipse is the face box (YuNet's runs from the brows to the chin) widened 1.7× and made
 *   1.8× taller around a centre 8% of the box higher, to take in forehead, hair and ears. It holds
 *   the face box's corners at 0.87 of the way to its edge, which leaves room for the straight-line
 *   motion between key frames and between samples.
 * - Key frames are thinned (a split-at-the-worst-point simplification, as Ramer–Douglas–Peucker)
 *   only where the region between the kept key frames still holds the face box at every sample,
 *   with its corners at no more than 0.95 of the ellipse. So fewer key frames never uncover a face
 *   at a sampled moment.
 * - A region shows from one sample interval before the face was first found to one after it was
 *   last found (the face may have come in or left anywhere between two samples), moving on at the
 *   face's own speed over those intervals (`extended`).
 */
import type { Box, Track, TrackPoint } from "../vision/track";
import { MAX_KEYS, type Region, type RegionKey, type Size } from "./options";

/**
 * Frames looked at per second of video. Measured on tests/fixtures/faces/faces-pan.mp4 (a face
 * moving 400 px/s in 720p, a 133 px/s pan, cuts): 3 a second hid 77% of face-frames fully, 4 hid
 * 98%, 5 and 8 hid all; 6 leaves room for faster movement.
 */
export const SAMPLE_FPS = 6;

export const WIDEN = 1.7;
export const TALLEN = 1.8;
export const LIFT = 0.08;
/** Corners of the face box may reach this share of the ellipse when key frames are thinned. */
export const THIN_LIMIT = 0.95;

/** The ellipse's bounding rectangle for a face box, in picture pixels. */
export function faceEllipse(face: Box): Box {
  const width = face.width * WIDEN;
  const height = face.height * TALLEN;
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2 - LIFT * face.height;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/**
 * How far out the face box's corners reach in the ellipse inscribed in `region`: 1 is on its edge,
 * above 1 a corner is outside.
 */
export function reach(region: Box, face: Box): number {
  const a = region.width / 2;
  const b = region.height / 2;
  if (a <= 0 || b <= 0) return Number.POSITIVE_INFINITY;
  const cx = region.x + a;
  const cy = region.y + b;
  let worst = 0;
  for (const x of [face.x, face.x + face.width])
    for (const y of [face.y, face.y + face.height])
      worst = Math.max(worst, ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2);
  return Math.sqrt(worst);
}

const lerpBox = (p: Box, q: Box, k: number): Box => ({
  x: p.x + (q.x - p.x) * k,
  y: p.y + (q.y - p.y) * k,
  width: p.width + (q.width - p.width) * k,
  height: p.height + (q.height - p.height) * k,
});

/** Indexes of the key frames kept (always the first and last). */
export function thinKeys(
  times: number[],
  faces: Box[],
  regions: Box[],
  limit = THIN_LIMIT,
): number[] {
  const n = times.length;
  if (n <= 2) return times.map((_, i) => i);
  const keep = new Set([0, n - 1]);
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop() as [number, number];
    let worst = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const span = (times[j] ?? 0) - (times[i] ?? 0);
      const f = span > 0 ? ((times[k] ?? 0) - (times[i] ?? 0)) / span : 0;
      const r = reach(lerpBox(regions[i] as Box, regions[j] as Box, f), faces[k] as Box);
      if (r > worst) {
        worst = r;
        at = k;
      }
    }
    if (at >= 0 && worst > limit) {
      keep.add(at);
      stack.push([i, at], [at, j]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

export interface FaceRegionsInput {
  tracks: Track[];
  source: Size;
  durationSec: number;
  /** Seconds between samples. */
  sampleSec: number;
  /** Id of the first new region (the next free id). */
  firstId: number;
}

/**
 * The track's points with one more at each end, a sample interval out (inside the video), moved on
 * at the speed of the nearest two points: a face found moving keeps moving while it is between
 * samples, before it was first found and after it was last found.
 */
export function extended(tr: Track, sampleSec: number, durationSec: number) {
  const p = tr.points;
  const times = p.map((x) => x.t);
  const faces: Box[] = p.map(({ x, y, width, height }) => ({ x, y, width, height }));
  const step = (a: TrackPoint, b: TrackPoint, dt: number): Box => {
    const k = b.t > a.t ? dt / (b.t - a.t) : 0;
    return {
      x: b.x + (b.x - a.x) * k,
      y: b.y + (b.y - a.y) * k,
      width: b.width,
      height: b.height,
    };
  };
  const first = p[0] as TrackPoint;
  const last = p[p.length - 1] as TrackPoint;
  const before = Math.max(0, first.t - sampleSec);
  if (before < first.t) {
    times.unshift(before);
    faces.unshift(p[1] ? step(p[1], first, first.t - before) : { ...(faces[0] as Box) });
  }
  const after = Math.min(durationSec, last.t + sampleSec);
  if (after > last.t) {
    times.push(after);
    const prev = p[p.length - 2];
    faces.push(prev ? step(prev, last, after - last.t) : { ...(faces[faces.length - 1] as Box) });
  }
  return { times, faces };
}

/** A key from a rectangle in picture pixels (shares of the picture). */
const keyOf = (t: number, r: Box, src: Size): RegionKey => ({
  t,
  x: (r.x + r.width / 2) / src.width,
  y: (r.y + r.height / 2) / src.height,
  w: r.width / src.width,
  h: r.height / src.height,
});

/**
 * One moving ellipse region per track (a track needing more than `MAX_KEYS` key frames becomes
 * consecutive regions), in the order the faces first appear, numbered from 1 in that order.
 */
export function regionsFromTracks(input: FaceRegionsInput): Region[] {
  const { source, durationSec, sampleSec } = input;
  let id = input.firstId;
  const out: Region[] = [];
  const tracks = [...input.tracks].sort(
    (a, b) => (a.points[0]?.t ?? 0) - (b.points[0]?.t ?? 0) || a.id - b.id,
  );
  for (const tr of tracks) {
    const { times, faces } = extended(tr, sampleSec, durationSec);
    const ellipses = faces.map(faceEllipse);
    const kept = thinKeys(times, faces, ellipses);
    const keys = kept.map((i) => keyOf(times[i] ?? 0, ellipses[i] as Box, source));
    const start = times[0] ?? 0;
    const lastT = times[times.length - 1] ?? 0;
    const end = lastT >= durationSec - 1e-6 ? undefined : lastT;
    for (let k = 0; k < keys.length; k += MAX_KEYS) {
      const part = keys.slice(k, k + MAX_KEYS);
      const isFirst = k === 0;
      const isLast = k + MAX_KEYS >= keys.length;
      out.push({
        id: id++,
        shape: "ellipse",
        moving: true,
        face: out.length + 1,
        keys: part,
        start: isFirst ? start : (part[0]?.t ?? start),
        end: isLast ? end : keys[k + MAX_KEYS]?.t,
      });
    }
  }
  return out;
}
