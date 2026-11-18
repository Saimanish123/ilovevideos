import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  BlurRegionOptions,
  blurGraph,
  defaultRegion,
  effectSize,
  keyAt,
  keyExpr,
  placeAll,
  placeRegion,
  type Region,
  setMoving,
  withoutKey,
  withRect,
} from "@/tools/engines/blur-region/options";

const hd = { width: 1920, height: 1080 };
const frame = 1 / 30;

const moving: Region = {
  id: 1,
  shape: "rect",
  moving: true,
  start: 0,
  keys: [
    { t: 1, x: 0.25, y: 0.5, w: 0.1, h: 0.2 },
    { t: 3, x: 0.75, y: 0.5, w: 0.3, h: 0.2 },
  ],
};

describe("blur regions: placement over time", () => {
  it("holds before the first key frame and after the last, moves in a straight line between", () => {
    expect(keyAt(moving, 0)).toMatchObject({ x: 0.25, w: 0.1 });
    expect(keyAt(moving, 2)).toMatchObject({ x: 0.5, w: 0.2 });
    expect(keyAt(moving, 2.5).x).toBeCloseTo(0.625, 6);
    expect(keyAt(moving, 9)).toMatchObject({ x: 0.75, w: 0.3 });
    // A key past the end of the video still steers the motion towards it.
    const past = { ...moving, keys: [...moving.keys, { t: 99, x: 1, y: 0.5, w: 0.3, h: 0.2 }] };
    expect(keyAt(past, 51).x).toBeCloseTo(0.875, 6);
  });

  it("uses only the first key while not following a subject, and unsorted keys still work", () => {
    expect(keyAt({ ...moving, moving: false }, 2.5)).toMatchObject({ x: 0.25 });
    const shuffled = { ...moving, keys: [moving.keys[1], moving.keys[0]] } as Region;
    expect(keyAt(shuffled, 2).x).toBeCloseTo(0.5, 6);
  });

  it("places in picture pixels, shows only inside its range, and grows a zero region to 4 px", () => {
    expect(placeRegion(moving, 2, hd)).toEqual({
      id: 1,
      shape: "rect",
      x: 768,
      y: 432,
      width: 384,
      height: 216,
    });
    const timed = { ...moving, start: 1, end: 2 };
    expect(placeRegion(timed, 0.99, hd)).toBeNull();
    expect(placeRegion(timed, 2, hd)).toBeNull();
    expect(placeRegion(timed, 1.5, hd)).not.toBeNull();
    const zero = { ...moving, moving: false, keys: [{ t: 0, x: 0, y: 0, w: 0, h: 0 }] };
    expect(placeRegion(zero, 0, hd)).toMatchObject({ x: -2, y: -2, width: 4, height: 4 });
    expect(placeAll({ regions: [timed, moving] }, 0.5, hd).map((r) => r.id)).toEqual([1]);
  });

  it("moving a still region moves it everywhere; moving a following one sets a key frame", () => {
    const still = defaultRegion(2, hd);
    const moved = withRect(still, { x: 0, y: 0, width: 100, height: 50 }, hd, 2, frame);
    expect(moved.keys).toHaveLength(1);
    expect(moved.keys[0]).toMatchObject({ t: 0, w: 100 / 1920 });
    const keyed = withRect(moving, { x: 0, y: 0, width: 100, height: 50 }, hd, 2, frame);
    expect(keyed.keys.map((k) => k.t)).toEqual([1, 2, 3]);
    // Within half a frame of an existing key: that key is replaced, not doubled.
    const again = withRect(keyed, { x: 10, y: 0, width: 100, height: 50 }, hd, 2.01, frame);
    expect(again.keys.map((k) => k.t)).toEqual([1, 2.01, 3]);
    expect(withoutKey(again, 2.01, frame).keys).toHaveLength(2);
    const one = { ...moving, keys: moving.keys.slice(0, 1) };
    expect(withoutKey(one, 1, frame)).toBe(one);
  });

  it("turning following off keeps the region where it is at the playhead", () => {
    const off = setMoving(moving, false, 2);
    expect(off.keys).toEqual([{ t: 0, x: 0.5, y: 0.5, w: 0.2, h: 0.2 }]);
    const on = setMoving(off, true, 1.5);
    expect(on.keys).toEqual([{ t: 1.5, x: 0.5, y: 0.5, w: 0.2, h: 0.2 }]);
  });

  it("starts with one square region in the middle of the picture", () => {
    const r = defaultRegion(1, hd);
    expect(placeRegion(r, 0, hd)).toEqual({
      id: 1,
      shape: "rect",
      x: 720,
      y: 300,
      width: 480,
      height: 480,
    });
  });
});

describe("blur regions: strength", () => {
  const o = BlurRegionOptions.parse({});
  it("scales with the region's shorter side, and with the frame when inverted", () => {
    expect(effectSize(o, { width: 400, height: 100 }, hd)).toEqual({
      sigma: 20,
      block: 25,
      feather: 0,
    });
    expect(effectSize({ ...o, feather: 0.2 }, { width: 400, height: 100 }, hd).feather).toBe(20);
    expect(effectSize(o, hd, hd, true)).toMatchObject({ sigma: 27, block: 27 });
    // Never below a sigma of 1.5 px or a 2 px block.
    expect(effectSize(o, { width: 4, height: 4 }, hd)).toMatchObject({ sigma: 1.5, block: 2 });
  });
});

describe("blur regions: the ffmpeg command", () => {
  it("writes a held, then linear, then held expression", () => {
    expect(
      keyExpr([
        { t: 1, v: 10 },
        { t: 3, v: 30 },
      ]),
    ).toBe("if(lt(t,1),10,if(lt(t,3),10+20*(t-1)/2,30))");
    expect(keyExpr([{ t: 0, v: 5.4 }])).toBe("5");
  });

  it("builds a graph local ffmpeg accepts, for each effect, shape and the inverted mode", () => {
    let ffmpeg = true;
    try {
      execFileSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" });
    } catch {
      ffmpeg = false;
    }
    const src = { width: 320, height: 180 };
    const regions: Region[] = [
      { ...moving, end: 0.5 },
      { ...defaultRegion(2, src), shape: "ellipse" },
    ];
    for (const effect of ["blur", "pixelate", "box"] as const)
      for (const invert of [false, true]) {
        const graph = blurGraph(BlurRegionOptions.parse({ regions, effect, invert }), src, 1);
        expect(graph.endsWith("[v]")).toBe(true);
        if (!ffmpeg) continue;
        execFileSync("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x180:rate=10:duration=1",
          "-filter_complex",
          graph,
          "-map",
          "[v]",
          "-f",
          "null",
          "-",
        ]);
      }
  });
});
