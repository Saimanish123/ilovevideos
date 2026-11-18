import { describe, expect, it } from "vitest";
import {
  clampKey,
  deepestZoom,
  keyFromRect,
  keyRect,
  linesOfDetail,
  rectAt,
  viewAt,
  ZoomOptions,
  zoomCommand,
  zoomIsNoop,
} from "@/tools/engines/zoom-pan/options";

const size = { width: 1920, height: 1080 };
const keys = [
  { t: 0, x: 0.5, y: 0.5, zoom: 1 },
  { t: 4, x: 0.5, y: 0.5, zoom: 4 },
];

describe("zoom and pan", () => {
  it("holds before the first and after the last key frame", () => {
    expect(viewAt(keys, -1, "linear").zoom).toBe(1);
    expect(viewAt(keys, 9, "linear").zoom).toBe(4);
  });

  it("zooms on a log scale: halfway in time is the geometric mean", () => {
    expect(viewAt(keys, 2, "linear").zoom).toBeCloseTo(2, 9);
    expect(viewAt(keys, 1, "linear").zoom).toBeCloseTo(Math.SQRT2, 9);
    // Smooth starts slower and is symmetric about the middle.
    expect(viewAt(keys, 1, "smooth").zoom).toBeLessThan(Math.SQRT2);
    expect(viewAt(keys, 2, "smooth").zoom).toBeCloseTo(2, 9);
  });

  it("the view keeps the picture's shape and stays inside it", () => {
    const r = rectAt(keys, 2, "linear", size);
    expect(r.width / r.height).toBeCloseTo(16 / 9, 9);
    expect(r.width).toBeCloseTo(960, 6);
    const edge = clampKey({ t: 0, x: 0.99, y: 0.01, zoom: 2 });
    expect(edge.x).toBe(0.75);
    expect(edge.y).toBe(0.25);
    const r2 = rectAt([edge], 0, "linear", size);
    expect(r2.x + r2.width).toBeCloseTo(1920, 6);
    expect(r2.y).toBeCloseTo(0, 6);
  });

  it("pans in a straight line", () => {
    const pan = [
      { t: 0, x: 0.25, y: 0.5, zoom: 2 },
      { t: 2, x: 0.75, y: 0.5, zoom: 2 },
    ];
    expect(viewAt(pan, 1, "linear").x).toBeCloseTo(0.5, 9);
    expect(viewAt(pan, 0.5, "linear").x).toBeCloseTo(0.375, 9);
  });

  it("a frame drawn on the picture becomes a key frame and back", () => {
    const k = { t: 1, x: 0.3, y: 0.6, zoom: 2.5 };
    const back = keyFromRect(1, keyRect(k, size), size);
    expect(back.zoom).toBeCloseTo(2.5, 9);
    expect(back.x).toBeCloseTo(0.3, 9);
    expect(back.y).toBeCloseTo(0.6, 9);
  });

  it("reports the detail left at the closest view", () => {
    expect(deepestZoom(keys)).toBe(4);
    expect(linesOfDetail(1080, 2.5)).toBe(432);
    expect(zoomIsNoop([{ t: 0, x: 0.5, y: 0.5, zoom: 1 }])).toBe(true);
    expect(zoomIsNoop(keys)).toBe(false);
  });

  it("validates options and writes a scale-and-crop command", () => {
    expect(ZoomOptions.safeParse({ keys: [] }).success).toBe(false);
    expect(ZoomOptions.safeParse({ keys: [{ t: 0, x: 0.5, y: 0.5, zoom: 9 }] }).success).toBe(
      false,
    );
    const cmd = zoomCommand({
      input: "a.mp4",
      output: "a-zoom.mp4",
      keys,
      ease: "smooth",
      size,
      kbps: 5000,
      sound: "copy",
    });
    expect(cmd).toContain("eval=frame:flags=lanczos,crop=1920:1080");
    expect(cmd).toContain("-c:a copy");
  });
});
