import { describe, expect, it } from "vitest";
import {
  frameSize,
  insetAtCorner,
  insetFromBox,
  LayoutOptions,
  layoutCommand,
  mainVisible,
  outputLength,
  placeIn,
  placement,
  secondTime,
} from "@/tools/engines/layout/options";

const hd = { width: 1920, height: 1080 };
const sd = { width: 640, height: 360 };
const tall = { width: 1080, height: 1920 };
const base = LayoutOptions.parse({});

describe("two-video layouts", () => {
  it("auto frames keep both pictures whole", () => {
    expect(frameSize({ layout: "pip", frame: "auto" }, hd, sd)).toEqual(hd);
    // Side by side at the smaller height: 640×360 next to 640×360.
    expect(frameSize({ layout: "side", frame: "auto" }, hd, sd)).toEqual({
      width: 1280,
      height: 360,
    });
    expect(frameSize({ layout: "side", frame: "auto" }, hd, hd)).toEqual({
      width: 3840,
      height: 1080,
    });
    expect(frameSize({ layout: "stack", frame: "auto" }, hd, hd)).toEqual({
      width: 1080,
      height: 1216,
    });
    // Two 4K pictures do not make an 8K frame.
    const uhd = { width: 3840, height: 2160 };
    const f = frameSize({ layout: "side", frame: "auto" }, uhd, uhd);
    expect(Math.max(f.width, f.height)).toBeLessThanOrEqual(3840);
    expect(frameSize({ layout: "pip", frame: "auto" }, uhd, sd)).toEqual(hd);
  });

  it("fixed frames are their shape at up to 1080 on the short edge", () => {
    expect(frameSize({ layout: "stack", frame: "9:16" }, hd, hd)).toEqual(tall);
    expect(frameSize({ layout: "side", frame: "1:1" }, sd, sd)).toEqual({
      width: 360,
      height: 360,
    });
    expect(frameSize({ layout: "side", frame: "16:9" }, tall, sd)).toEqual(hd);
  });

  it("cover cuts the picture to the cell's shape; contain fits it whole", () => {
    const cell = { x: 0, y: 0, width: 960, height: 1080 };
    const c = placeIn(hd, cell, "cover");
    expect(c.from.width / c.from.height).toBeCloseTo(960 / 1080, 9);
    expect(c.from.x).toBeCloseTo((1920 - 960) / 2, 6);
    const k = placeIn(hd, cell, "contain");
    expect(k.to.width).toBe(960);
    expect(k.to.height).toBeCloseTo(540, 9);
    expect(k.to.y).toBeCloseTo(270, 9);
  });

  it("the inset keeps the second picture's shape and stays inside the frame", () => {
    const p = placement({ ...base, inset: { x: 1, y: 1, width: 0.3 } }, hd, sd);
    expect(p.second.width).toBeCloseTo(576, 6);
    expect(p.second.height).toBeCloseTo(324, 6);
    expect(p.second.x + p.second.width).toBeCloseTo(1920, 6);
    expect(p.second.y + p.second.height).toBeCloseTo(1080, 6);
    const corner = insetAtCorner("tl", 0.3, hd, sd);
    const q = placement({ ...base, inset: corner }, hd, sd);
    expect(q.second.x).toBeCloseTo(0.04 * 1080, 6);
    expect(q.second.y).toBeCloseTo(0.04 * 1080, 6);
    const back = insetFromBox(q.second, hd, 0.3);
    expect(back.x).toBeCloseTo(corner.x, 9);
  });

  it("side by side splits at the pictures' widths with a gap", () => {
    const p = placement({ ...base, layout: "side", border: 0.01 }, sd, { width: 480, height: 480 });
    expect(p.frame).toEqual({ width: 1000, height: 360 });
    expect(p.main.width + p.second.width + p.border).toBeCloseTo(1000, 6);
    expect(p.main.width).toBeCloseTo(640 - p.border / 2, 6);
  });

  it("times the second clip by its offset, held or hidden outside its run", () => {
    expect(outputLength({ ...base, layout: "pip", offset: 5 }, 10, 20)).toBe(10);
    expect(outputLength({ ...base, layout: "side", offset: 5 }, 10, 20)).toBe(25);
    expect(outputLength({ ...base, layout: "side", offset: -5 }, 10, 20)).toBe(15);
    expect(secondTime({ offset: 2, ended: "hold" }, 1, 5)).toEqual({ time: 0, visible: true });
    expect(secondTime({ offset: 2, ended: "hide" }, 1, 5)).toEqual({ time: 0, visible: false });
    expect(secondTime({ offset: -1, ended: "hide" }, 1, 5)).toEqual({ time: 2, visible: true });
    expect(secondTime({ offset: 0, ended: "hide" }, 6, 5).visible).toBe(false);
    expect(mainVisible({ ended: "hide" }, 11, 10)).toBe(false);
  });

  it("writes an ffmpeg graph with both inputs placed", () => {
    const o = { ...base, layout: "side" as const, offset: 1.5, sound: "both" as const };
    const cmd = layoutCommand({
      options: o,
      mainName: "a.mp4",
      secondName: "b.mp4",
      output: "a-side-by-side.mp4",
      place: placement(o, sd, sd),
      fps: 30,
      kbps: 3000,
      durationSec: 4.5,
      sound: { main: true, second: true },
    });
    expect(cmd).toContain("color=black:s=1280x360");
    expect(cmd).toContain("setpts=PTS+1.5/TB");
    expect(cmd).toContain("adelay=1500:all=1");
    expect(cmd).toContain("alimiter=limit=0.891");
  });
});
