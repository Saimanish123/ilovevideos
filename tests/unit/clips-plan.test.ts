import { describe, expect, it } from "vitest";
import {
  addCut,
  blurFit,
  clipCommand,
  clipName,
  clipsFromCuts,
  cropWindow,
  isVertical,
  moveCut,
  outputFrame,
  pauseCandidates,
  proposeCuts,
  removeCut,
  sceneCandidates,
} from "@/tools/engines/clips/plan";

describe("clip proposals", () => {
  it("cuts at the cap when nothing better is found", () => {
    expect(proposeCuts(150, 60, [])).toEqual([60, 120]);
    expect(proposeCuts(60, 60, [])).toEqual([]);
    // No 1 s scrap at the end: 61 s splits in the middle.
    expect(proposeCuts(61, 60, [])).toEqual([30.5]);
    expect(proposeCuts(100, 60, sceneCandidates([59]))).toEqual([59]);
    expect(proposeCuts(62, 60, sceneCandidates([59]))).toEqual([31]);
  });

  it("prefers a long pause late in the window, and a scene cut over a pause", () => {
    const pauses = pauseCandidates([
      { start: 40, end: 41.2 },
      { start: 55, end: 55.4 },
    ]);
    expect(proposeCuts(100, 60, pauses)[0]).toBeCloseTo(40.6, 6);
    const withScene = [...pauses, ...sceneCandidates([50])];
    expect(proposeCuts(100, 60, withScene)[0]).toBe(50);
    // Candidates before half the cap are not used (clips stay long enough).
    expect(proposeCuts(100, 60, sceneCandidates([10]))[0]).toBe(60);
  });

  it("never proposes a clip longer than the cap", () => {
    const cands = sceneCandidates([31, 64, 99, 140, 170]);
    const cuts = proposeCuts(200, 60, cands);
    const clips = clipsFromCuts(cuts, 200);
    for (const c of clips) expect(c.end - c.start).toBeLessThanOrEqual(60 + 1e-9);
    expect(clips[0]?.start).toBe(0);
    expect(clips.at(-1)?.end).toBe(200);
  });

  it("moves, adds and removes boundaries without overlaps", () => {
    const clips = clipsFromCuts([60, 120], 150);
    const moved = moveCut(clips, 0, 200);
    expect(moved[0]?.end).toBe(119);
    expect(moved[1]?.start).toBe(119);
    const split = addCut(clips, 30);
    expect(split.map((c) => c.start)).toEqual([0, 30, 60, 120]);
    expect(addCut(clips, 60.5).length).toBe(3);
    const joined = removeCut(clips, 0);
    expect(joined.map((c) => [c.start, c.end])).toEqual([
      [0, 120],
      [120, 150],
    ]);
  });
});

describe("vertical frames", () => {
  const hd = { width: 1920, height: 1080 };
  it("crops a 9:16 window of the full height, never enlarged", () => {
    expect(outputFrame(hd, "crop")).toEqual({ width: 606, height: 1080 });
    expect(outputFrame({ width: 3840, height: 2160 }, "crop")).toEqual({
      width: 1080,
      height: 1920,
    });
    const w = cropWindow(hd, 0);
    expect(w.x).toBe(0);
    expect(w.width).toBeCloseTo(606, 6);
    expect(cropWindow(hd, 1).x + cropWindow(hd, 1).width).toBeCloseTo(1920, 6);
  });

  it("blurred bars put the picture across a 9:16 frame", () => {
    const f = outputFrame(hd, "blur");
    expect(f).toEqual({ width: 1080, height: 1920 });
    const fit = blurFit(hd, f);
    expect(fit.height).toBeCloseTo(607.5, 6);
    expect(fit.y).toBeCloseTo((1920 - 607.5) / 2, 6);
  });

  it("keeps a vertical source as it is", () => {
    expect(isVertical({ width: 1080, height: 1920 })).toBe(true);
    expect(outputFrame({ width: 1080, height: 1920 }, "crop")).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(outputFrame({ width: 641, height: 361 }, "none")).toEqual({ width: 640, height: 360 });
  });

  it("names clips in order and writes a trim command", () => {
    expect(clipName("talk", 2, 12)).toBe("talk-clip-03.mp4");
    const cmd = clipCommand({
      input: "talk.mp4",
      output: "talk-clip-01.mp4",
      clip: { start: 0, end: 59.5, include: true, focus: 0.5 },
      src: hd,
      reframe: "crop",
      kbps: 4000,
      sound: true,
    });
    expect(cmd).toContain("-ss 0 -to 59.5 -i talk.mp4");
    expect(cmd).toContain("crop=606:1080:657:0,scale=606:1080");
  });
});

describe("scene changes from key frames", () => {
  it("counts a key frame far above the usual change, and never a small one", async () => {
    const { sceneCutsFrom, SCENE_MIN_DIFF } = await import("@/tools/engines/clips/scenes");
    const steady = Array.from({ length: 20 }, (_, i) => ({ t: i + 1, d: 4 }));
    expect(sceneCutsFrom([...steady, { t: 30, d: 60 }])).toEqual([30]);
    // A busy handheld shot: every key frame changes a lot; only a jump three times that counts.
    const busy = Array.from({ length: 20 }, (_, i) => ({ t: i + 1, d: 25 }));
    expect(sceneCutsFrom([...busy, { t: 30, d: 40 }])).toEqual([]);
    expect(sceneCutsFrom([...busy, { t: 30, d: 80 }])).toEqual([30]);
    expect(sceneCutsFrom([{ t: 1, d: SCENE_MIN_DIFF - 1 }])).toEqual([]);
  });
});
