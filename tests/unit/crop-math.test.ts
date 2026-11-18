import { describe, expect, it } from "vitest";
import { AspectRatioOptions, aspectPlan } from "@/tools/engines/aspect-ratio/options";
import {
  anchorOf,
  cropFilter,
  fullRect,
  geometryCommand,
  hasRatio,
  isFullFrame,
  largestRect,
  moveRect,
  normalizeRect,
  padFilter,
  padLayout,
  type Rect,
  refitToRatio,
  resizeRect,
  scaleRect,
} from "@/tools/engines/crop/math";
import {
  changesContainer,
  geometryContainer,
  needsFfmpeg,
  sourceName,
} from "@/tools/engines/crop/plan";
import { frameProgress, totalFrames } from "@/tools/engines/crop/progress";
import type { MediaInfo, Progress } from "@/tools/engines/types";

const hd = { width: 1920, height: 1080 };
const small = { width: 640, height: 360 };
const isEven = (r: Rect) =>
  [r.x, r.y, r.width, r.height].every((n) => Number.isInteger(n) && n % 2 === 0);

describe("crop rectangles", () => {
  it("full frame is the whole picture, even", () => {
    expect(fullRect(hd)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(fullRect({ width: 641, height: 361 })).toEqual({ x: 0, y: 0, width: 640, height: 360 });
    expect(isFullFrame(fullRect(hd), hd)).toBe(true);
    expect(isFullFrame({ x: 2, y: 0, width: 1918, height: 1080 }, hd)).toBe(false);
  });

  it("normalises odd, negative and oversized values into the picture", () => {
    const r = normalizeRect({ x: -5, y: 3, width: 641, height: 9999 }, small);
    expect(r).toEqual({ x: 0, y: 0, width: 640, height: 360 });
    const tiny = normalizeRect({ x: 101, y: 51, width: 3, height: 5 }, small);
    expect(tiny.width).toBe(16);
    expect(tiny.height).toBe(16);
    expect(isEven(tiny)).toBe(true);
    // A frame pushed past the right edge is moved back inside.
    expect(normalizeRect({ x: 600, y: 0, width: 100, height: 100 }, small).x).toBe(540);
  });

  it("largest window of a shape, anchored", () => {
    expect(largestRect(hd, 9 / 16)).toEqual({ x: 656, y: 0, width: 606, height: 1080 });
    expect(largestRect(hd, 1)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(largestRect(hd, 9 / 16, { x: 0, y: 0.5 }).x).toBe(0);
    expect(largestRect(hd, 9 / 16, { x: 1, y: 0.5 }).x).toBe(1314);
    expect(largestRect({ width: 1080, height: 1920 }, 16 / 9)).toEqual({
      x: 0,
      y: 656,
      width: 1080,
      height: 606,
    });
    expect(largestRect(small, 4 / 5)).toEqual({ x: 176, y: 0, width: 288, height: 360 });
  });

  it("anchor round-trips through a moved window", () => {
    const r = largestRect(hd, 9 / 16, { x: 0.25, y: 0.5 });
    const a = anchorOf(r, hd);
    expect(a.x).toBeCloseTo(0.25, 2);
    expect(a.y).toBe(0.5);
  });

  it("refits a shape around the current centre", () => {
    const r = refitToRatio({ x: 0, y: 0, width: 400, height: 400 }, hd, 9 / 16);
    expect(r.width).toBe(606);
    expect(r.x).toBe(0); // clamped: the centre (200) is closer to the edge than half the width
  });

  it("moves inside the picture only", () => {
    const start = { x: 100, y: 100, width: 200, height: 100 };
    expect(moveRect(start, 51, -500, small)).toEqual({ x: 150, y: 0, width: 200, height: 100 });
    expect(moveRect(start, 9999, 9999, small)).toEqual({ x: 440, y: 260, width: 200, height: 100 });
  });
});

describe("resizing from handles", () => {
  const start = { x: 100, y: 60, width: 200, height: 120 };

  it("free edges move on their own and stay even", () => {
    const r = resizeRect(start, "e", 33, 0, small, null);
    expect(r).toEqual({ x: 100, y: 60, width: 234, height: 120 });
    const w = resizeRect(start, "w", -41, 0, small, null);
    expect(w.x + w.width).toBe(300); // the right edge did not move
    expect(isEven(w)).toBe(true);
    const nw = resizeRect(start, "nw", -500, -500, small, null);
    expect(nw).toEqual({ x: 0, y: 0, width: 300, height: 180 });
  });

  it("free edges keep a minimum size", () => {
    const r = resizeRect(start, "e", -1000, 0, small, null);
    expect(r.width).toBe(16);
    expect(r.x).toBe(100);
  });

  it("a locked corner keeps the opposite corner and the shape", () => {
    const sq = { x: 100, y: 60, width: 120, height: 120 };
    const r = resizeRect(sq, "se", 40, 10, small, 1);
    expect(r).toEqual({ x: 100, y: 60, width: 160, height: 160 });
    const nw = resizeRect(sq, "nw", -40, -40, small, 1);
    expect(nw.x + nw.width).toBe(220);
    expect(nw.y + nw.height).toBe(180);
    expect(nw.width).toBe(nw.height);
    // Growing past the picture stops at the edge, shape kept.
    const big = resizeRect(sq, "se", 2000, 2000, small, 1);
    expect(big).toEqual({ x: 100, y: 60, width: 300, height: 300 });
  });

  it("a locked edge keeps the other axis centred", () => {
    const r = resizeRect({ x: 200, y: 100, width: 160, height: 90 }, "e", 32, 0, small, 16 / 9);
    expect(r.width).toBe(192);
    expect(r.height).toBe(108);
    // Centre stays put to within the 1 px that even offsets allow.
    expect(Math.abs(r.y + r.height / 2 - 145)).toBeLessThanOrEqual(1);
    expect(isEven(r)).toBe(true);
  });

  it("keyboard scaling keeps the centre and the shape", () => {
    const r = scaleRect({ x: 200, y: 100, width: 160, height: 90 }, 1.25, small, 16 / 9);
    expect(r.width).toBe(200);
    expect(r.height).toBe(112);
    expect(scaleRect(r, 100, small, 16 / 9).width).toBe(640);
  });
});

describe("pad layout", () => {
  it("keeps the source's long side and never enlarges", () => {
    expect(padLayout(hd, 9 / 16)).toEqual({
      width: 1080,
      height: 1920,
      inner: { x: 0, y: 656, width: 1080, height: 608 },
    });
    expect(padLayout(hd, 1)).toEqual({
      width: 1920,
      height: 1920,
      inner: { x: 0, y: 420, width: 1920, height: 1080 },
    });
    expect(padLayout(hd, 4 / 5)).toEqual({
      width: 1536,
      height: 1920,
      inner: { x: 0, y: 528, width: 1536, height: 864 },
    });
    expect(padLayout({ width: 1080, height: 1920 }, 16 / 9)).toEqual({
      width: 1920,
      height: 1080,
      inner: { x: 656, y: 0, width: 608, height: 1080 },
    });
    expect(padLayout(small, 9 / 16)).toEqual({
      width: 360,
      height: 640,
      inner: { x: 0, y: 218, width: 360, height: 202 },
    });
  });

  it("every output edge is even", () => {
    for (const r of [16 / 9, 9 / 16, 1, 4 / 5, 4 / 3]) {
      for (const src of [hd, small, { width: 1280, height: 720 }, { width: 720, height: 1280 }]) {
        const l = padLayout(src, r);
        expect(l.width % 2).toBe(0);
        expect(l.height % 2).toBe(0);
        expect(isEven(l.inner)).toBe(true);
        expect(l.inner.x + l.inner.width).toBeLessThanOrEqual(l.width);
        expect(l.inner.y + l.inner.height).toBeLessThanOrEqual(l.height);
      }
    }
  });

  it("detects a source that already has the shape", () => {
    expect(hasRatio(hd, 16 / 9)).toBe(true);
    expect(hasRatio(small, 16 / 9)).toBe(true);
    expect(hasRatio(hd, 9 / 16)).toBe(false);
  });
});

describe("ffmpeg commands", () => {
  it("crop and pad filters", () => {
    expect(cropFilter({ x: 656, y: 0, width: 606, height: 1080 })).toBe("crop=606:1080:656:0");
    expect(padFilter(padLayout(hd, 9 / 16), hd, "black")).toBe(
      "scale=1080:608,pad=1080:1920:0:656:color=black",
    );
    expect(padFilter(padLayout(hd, 1), hd, "white")).toBe("pad=1920:1920:0:420:color=white");
  });

  it("full command quotes names and copies AAC sound", () => {
    expect(geometryCommand("my clip.mp4", "my clip-cropped.mp4", "crop=2:2:0:0", 7465, true)).toBe(
      "ffmpeg -i 'my clip.mp4' -vf crop=2:2:0:0 -c:v libx264 -b:v 7465k -pix_fmt yuv420p -c:a copy -movflags +faststart 'my clip-cropped.mp4'",
    );
  });
});

describe("aspect-ratio plan", () => {
  it("fill crops the largest window; fit pads", () => {
    const fill = aspectPlan(AspectRatioOptions.parse({ ratio: "9:16", fit: "crop" }), hd);
    expect(fill).toEqual({ kind: "crop", rect: { x: 656, y: 0, width: 606, height: 1080 } });
    const fit = aspectPlan(AspectRatioOptions.parse({ ratio: "1:1" }), hd);
    expect(fit.kind).toBe("pad");
  });
});

describe("containers and progress", () => {
  const info = (container: string): MediaInfo => ({ container, durationSec: 3, sizeBytes: 1 });
  it("keeps MP4/MOV/MKV, writes everything else as MP4", () => {
    expect(geometryContainer("a.mov")).toBe("mov");
    expect(geometryContainer("a.mkv")).toBe("mkv");
    expect(geometryContainer("a.webm")).toBe("mp4");
    expect(sourceName(info("QuickTime"))).toBe("file.mov");
    expect(changesContainer("file.webm", info("WebM"))).toBe(true);
    expect(changesContainer("file.mp4", info("MP4"))).toBe(false);
    expect(needsFfmpeg(info("avi"), "clip.avi")).toBe(true);
    expect(needsFfmpeg(info("MP4"), "clip.mp4")).toBe(false);
  });

  it("reports frames, then time left from the measured rate", () => {
    const seen: Progress[] = [];
    let t = 0;
    const report = frameProgress(
      { signal: new AbortController().signal, onProgress: (p) => seen.push(p) },
      totalFrames(3, 30),
      () => t,
    );
    report({ phase: "processing", ratio: 0.1 });
    expect(seen.at(-1)?.detail).toBe("Frame 9 of 90");
    t = 4000;
    report({ phase: "processing", ratio: 0.5 });
    expect(seen.at(-1)?.detail).toBe("Frame 45 of 90 · about 0:04 left");
    report({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    expect(seen.at(-1)?.detail).toBe("Writing the file");
  });
});
