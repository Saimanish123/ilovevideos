import { describe, expect, it } from "vitest";
import {
  faceEllipse,
  reach,
  regionsFromTracks,
  THIN_LIMIT,
  thinKeys,
} from "@/tools/engines/blur-region/faces";
import { keyAt, keyRect, MAX_KEYS, showsAt } from "@/tools/engines/blur-region/options";
import { boxAt, type SampleFaces, trackFaces } from "@/tools/engines/vision/track";

const face = (x: number, y: number, w: number, h: number, score = 0.9) => ({
  x,
  y,
  width: w,
  height: h,
  score,
});

/** Samples every `dt` seconds over `n` samples, each with the faces `at(t)` gives. */
const samples = (n: number, dt: number, at: (t: number, i: number) => ReturnType<typeof face>[]) =>
  Array.from({ length: n }, (_, i): SampleFaces => ({ t: i * dt, faces: at(i * dt, i) }));

describe("face tracking", () => {
  it("follows two faces that move, without swapping them", () => {
    const s = samples(20, 0.2, (t) => [
      face(100 + 60 * t, 100, 50, 60),
      face(400 - 40 * t, 120, 40, 50, 0.8),
    ]);
    const tracks = trackFaces(s);
    expect(tracks).toHaveLength(2);
    const [a, b] = tracks;
    expect(a?.hits).toBe(20);
    expect(boxAt(a as NonNullable<typeof a>, 3.8).x).toBeCloseTo(100 + 60 * 3.8, 0);
    expect(boxAt(b as NonNullable<typeof b>, 3.8).x).toBeCloseTo(400 - 40 * 3.8, 0);
  });

  it("bridges a short gap and ends a track after a long one", () => {
    // Missed for 0.6 s (three samples), then seen again: one track.
    const gap = samples(15, 0.2, (_t, i) =>
      i >= 5 && i < 8 ? [] : [face(200 + i * 4, 100, 50, 60)],
    );
    expect(trackFaces(gap)).toHaveLength(1);
    // Gone for 1.4 s and back in the same place (a head turned away): still one track.
    const back = samples(20, 0.2, (_t, i) => (i >= 5 && i < 12 ? [] : [face(200, 100, 50, 60)]));
    expect(trackFaces(back)).toHaveLength(1);
    // Gone for 1.4 s and back somewhere else: two tracks.
    const moved = samples(20, 0.2, (_t, i) =>
      i >= 5 && i < 12 ? [] : [face(i < 5 ? 200 : 260, 100, 50, 60)],
    );
    expect(trackFaces(moved)).toHaveLength(2);
    // Gone for 3.4 s: two tracks even in the same place.
    const gone = samples(30, 0.2, (_t, i) => (i >= 5 && i < 22 ? [] : [face(200, 100, 50, 60)]));
    expect(trackFaces(gone)).toHaveLength(2);
  });

  it("follows a quick move between samples by distance when the boxes no longer overlap", () => {
    // 42 px per sample for a 60 px face: IoU 0.18, centres 0.7 of the size apart.
    const s = samples(10, 0.2, (_t, i) => [face(100 + 42 * i, 100, 60, 60)]);
    expect(trackFaces(s)).toHaveLength(1);
  });

  it("drops a weak box seen once and keeps a sure one", () => {
    const s = samples(10, 0.2, (_t, i) => [
      face(100, 100, 50, 60),
      ...(i === 3 ? [face(500, 300, 30, 30, 0.65)] : []),
      ...(i === 6 ? [face(700, 300, 40, 40, 0.92)] : []),
    ]);
    const tracks = trackFaces(s);
    expect(tracks.map((t) => t.hits)).toEqual([10, 1]);
    expect(tracks[1]?.points[0]?.x).toBe(700);
  });

  it("smooths jitter without lagging a steady move", () => {
    const s = samples(30, 0.2, (_t, i) => [face(100 + 10 * i + (i % 2 ? 4 : -4), 100, 50, 60)]);
    const [tr] = trackFaces(s);
    const mid = tr?.points[15];
    // Centre of the true path at sample 15: 100 + 150 + 25.
    expect(Math.abs((mid?.x ?? 0) + 25 - 275)).toBeLessThan(2);
  });
});

describe("face regions", () => {
  it("draws an ellipse that holds the face box with room to spare", () => {
    const f = { x: 100, y: 100, width: 50, height: 60 };
    const e = faceEllipse(f);
    expect(reach(e, f)).toBeCloseTo(0.87, 2);
    expect(e.y).toBeLessThan(f.y - 0.3 * f.height);
    // A face box the size of the region does not fit an ellipse.
    expect(reach(f, f)).toBeCloseTo(Math.SQRT2, 6);
  });

  it("thins key frames only where every sample stays covered", () => {
    // Straight-line motion needs only two key frames; a turn needs one more.
    const times = Array.from({ length: 11 }, (_, i) => i * 0.2);
    const line = times.map((t) => ({ x: 100 + 50 * t, y: 100, width: 50, height: 60 }));
    expect(thinKeys(times, line, line.map(faceEllipse))).toEqual([0, 10]);
    const turn = times.map((t) => ({
      x: 100 + 100 * Math.min(t, 1),
      y: 100 + 100 * Math.max(0, t - 1),
      width: 50,
      height: 60,
    }));
    const kept = thinKeys(times, turn, turn.map(faceEllipse));
    expect(kept).toContain(5);
    // Between kept keys every sample stays within the limit.
    const ell = turn.map(faceEllipse);
    for (let k = 0; k < times.length; k++) {
      const i = Math.max(...kept.filter((j) => j <= k));
      const j = Math.min(...kept.filter((x) => x >= k));
      const f = j === i ? 0 : (k - i) / (j - i);
      const a = ell[i];
      const b = ell[j];
      if (!a || !b) throw new Error("keys");
      const box = {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        width: a.width + (b.width - a.width) * f,
        height: a.height + (b.height - a.height) * f,
      };
      expect(reach(box, turn[k] as (typeof turn)[number])).toBeLessThanOrEqual(THIN_LIMIT);
    }
  });

  it("turns tracks into moving ellipses with a time range one sample wider", () => {
    const tracks = trackFaces(
      samples(25, 0.2, (t) => (t >= 1 && t <= 3 ? [face(100 + 50 * t, 100, 50, 60)] : [])),
    );
    const src = { width: 640, height: 360 };
    const [r] = regionsFromTracks({
      tracks,
      source: src,
      durationSec: 5,
      sampleSec: 0.2,
      firstId: 3,
    });
    if (!r) throw new Error("no region");
    expect(r).toMatchObject({ id: 3, shape: "ellipse", moving: true, face: 1 });
    expect(r.start).toBeCloseTo(0.8, 6);
    expect(r.end).toBeCloseTo(3.2, 6);
    expect(showsAt(r, 0.9) && !showsAt(r, 3.3)).toBe(true);
    // At a sample the region holds the face.
    const at = keyRect(keyAt(r, 2), src);
    expect(reach(at, { x: 200, y: 100, width: 50, height: 60 })).toBeLessThanOrEqual(THIN_LIMIT);
  });

  it("runs to the end of the video when the face is there at the end", () => {
    const tracks = trackFaces(samples(10, 0.2, () => [face(100, 100, 50, 60)]));
    const [r] = regionsFromTracks({
      tracks,
      source: { width: 640, height: 360 },
      durationSec: 1.9,
      sampleSec: 0.2,
      firstId: 1,
    });
    expect(r?.end).toBeUndefined();
    expect(r?.keys).toHaveLength(2);
  });

  it("splits a track with more key frames than a region holds", () => {
    // A zigzag needs a key at every sample.
    const n = MAX_KEYS + 40;
    const tracks = trackFaces(
      samples(n, 0.1, (_t, i) => [face(100 + (i % 2) * 30, 100, 50, 60)]),
      {
        minIou: 0.1,
        maxJump: 1,
        maxGapSec: 1,
        bridgeSec: 3,
        bridgeIou: 0.3,
        minHits: 2,
        sureScore: 0.85,
        sigmaPosition: 0,
        sigmaSize: 0,
      },
    );
    const regions = regionsFromTracks({
      tracks,
      source: { width: 640, height: 360 },
      durationSec: 100,
      sampleSec: 0.1,
      firstId: 1,
    });
    expect(regions).toHaveLength(2);
    expect(regions[0]?.keys).toHaveLength(MAX_KEYS);
    expect(regions[0]?.end).toBeCloseTo(regions[1]?.start ?? -1, 6);
  });
});

describe("face tracking across a cut", () => {
  it("ends every track at a cut even where a face in the next shot is close by", () => {
    const s = samples(10, 0.2, (_t, i) => [face(i < 5 ? 100 : 130, 100, 50, 60)]);
    expect(trackFaces(s)).toHaveLength(1);
    expect(trackFaces(s, undefined, [1])).toHaveLength(2);
  });
});

describe("cuts between shots", () => {
  it("finds cuts that stand out from their neighbours, not a steady pan or a quick move", async () => {
    const { sampleCuts } = await import("@/tools/engines/vision/track");
    // The faces-pan fixture's differences, sample to sample (5 a second).
    const d = [
      0.8, 2.1, 3.1, 4.1, 5.5, 5.9, 6.8, 7.1, 6.8, 6.0, 5.0, 4.0, 3.1, 1.9, 65.9, 23.6, 23.0, 23.3,
      24.7, 24.7, 24.8, 24.3, 24.4, 23.9, 23.5, 23.7, 23.7, 23.7, 23.3, 49.7, 4.9, 5.0, 5.2, 5.1,
      52.8, 40.0, 39.4, 39.7, 37.4,
    ].map((v, i) => ({ t: Math.round((i + 1) * 2) / 10, d: v }));
    expect(sampleCuts(d)).toEqual([3, 6, 7]);
    // A still shot that starts a fast pan is not a cut.
    const pan = [2, 2, 2, 2, 40, 41, 40, 42, 40].map((v, i) => ({ t: i, d: v }));
    expect(sampleCuts(pan)).toEqual([]);
  });
});
