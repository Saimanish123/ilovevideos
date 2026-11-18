import { describe, expect, it } from "vitest";
import {
  cleanPartName,
  cutPoints,
  nearestKeyframe,
  partFileNames,
  partName,
  partsFrom,
  requestedPoints,
  snapPoints,
} from "@/tools/engines/split/math";

const base = { mode: "equal" as const, parts: 2, every: 30, points: [], precise: false };

describe("split math", () => {
  it("places equal parts and every-N points inside the file", () => {
    expect(requestedPoints({ ...base, parts: 3 }, 9)).toEqual([3, 6]);
    expect(requestedPoints({ ...base, mode: "every", every: 4 }, 10)).toEqual([4, 8]);
    // A part length equal to the duration leaves nothing to cut.
    expect(requestedPoints({ ...base, mode: "every", every: 10 }, 10)).toEqual([]);
    expect(requestedPoints({ ...base, mode: "points", points: [5, 0, 2, 2, 12] }, 10)).toEqual([
      2, 5,
    ]);
  });

  it("snaps to the nearest key frame, earlier on a tie", () => {
    const kf = [0, 1, 2, 3];
    expect(nearestKeyframe(1.4, kf)).toBe(1);
    expect(nearestKeyframe(1.5, kf)).toBe(1);
    expect(nearestKeyframe(1.6, kf)).toBe(2);
    expect(nearestKeyframe(9, kf)).toBe(3);
    expect(nearestKeyframe(1, [])).toBeUndefined();
  });

  it("drops cuts that collapse onto the first key frame or onto each other", () => {
    const kf = [0, 2, 4];
    expect(snapPoints([0.4, 1.9, 2.2, 3.9], 6, { precise: false, fps: 30, keyframes: kf })).toEqual(
      [2, 4],
    );
    // Frame-accurate cuts snap to frame boundaries instead.
    const precise = snapPoints([1.01, 2.5], 3, { precise: true, fps: 30 });
    expect(precise[0]).toBeCloseTo(1, 5);
    expect(precise[1]).toBeCloseTo(2.5, 5);
  });

  it("turns cuts into contiguous parts that cover the whole file", () => {
    const pts = cutPoints({ ...base, parts: 3 }, 3, { fps: 30, keyframes: [0, 1, 2] });
    expect(pts).toEqual([1, 2]);
    const parts = partsFrom(pts, 3);
    expect(parts).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
    expect(parts.reduce((s, p) => s + p.end - p.start, 0)).toBe(3);
  });

  it("names parts so they sort in order", () => {
    expect(partName("clip.mov", 0, 3, "mov")).toBe("clip-part-01.mov");
    expect(partName("clip.mp4", 99, 100, "mp4")).toBe("clip-part-100.mp4");
    expect(partName("clip.mp4", 4, 100, "mp4")).toBe("clip-part-005.mp4");
  });

  it("cleans typed names and never repeats a file name", () => {
    expect(cleanPartName(' ../intro: "take 2" ')).toBe("intro take 2");
    expect(cleanPartName("...")).toBe("");
    expect(partFileNames("clip.mp4", 3, "mp4", ["Intro", "", "intro.mp4"])).toEqual([
      "Intro.mp4",
      "clip-part-02.mp4",
      "intro-2.mp4",
    ]);
  });
});
