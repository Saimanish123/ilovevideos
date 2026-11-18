import { describe, expect, it } from "vitest";
import {
  effectiveRange,
  markRect,
  markSize,
  overlayFilter,
  showsAt,
  toFractions,
  WatermarkOptions,
  watermarkCommand,
} from "@/tools/engines/watermark/options";

const hd = { width: 1920, height: 1080 };
const o = (patch: Partial<WatermarkOptions> = {}) =>
  WatermarkOptions.parse({ aspect: 2.5, ...patch });

describe("watermark geometry", () => {
  it("sizes the mark from the picture width and its own shape, inside the picture", () => {
    expect(markSize(o(), hd)).toEqual({ width: 288, height: 115 });
    expect(markSize(o({ size: 1, aspect: 0.5 }), hd)).toEqual({ width: 540, height: 1080 });
  });

  it("places the nine positions with a margin of 3% of the shorter side", () => {
    // 3% of 1080 = 32 px (rounded).
    expect(markRect(o({ anchor: "br" }), hd)).toEqual({ x: 1600, y: 933, width: 288, height: 115 });
    expect(markRect(o({ anchor: "tl" }), hd)).toMatchObject({ x: 32, y: 32 });
    expect(markRect(o({ anchor: "mc" }), hd)).toMatchObject({ x: 816, y: 483 });
    expect(markRect(o({ anchor: "tc", margin: 0 }), hd)).toMatchObject({ x: 816, y: 0 });
  });

  it("keeps a dragged mark where it was dropped, as a share of the free space", () => {
    const dropped = { x: 400, y: 300, width: 288, height: 115 };
    const f = toFractions(dropped, hd);
    expect(markRect(o({ anchor: "custom", ...f }), hd)).toEqual(dropped);
    // Dragged past the edge: clamped inside the picture.
    const out = toFractions({ ...dropped, x: -50, y: 5000 }, hd);
    expect(markRect(o({ anchor: "custom", ...out }), hd)).toMatchObject({ x: 0, y: 965 });
  });

  it("limits the time range to the video and treats a full range as the whole video", () => {
    expect(effectiveRange(o({ range: { start: 1, end: 2 } }), 3)).toEqual({ start: 1, end: 2 });
    expect(effectiveRange(o({ range: { start: 0, end: 9 } }), 3)).toBeUndefined();
    expect(effectiveRange(o(), 3)).toBeUndefined();
    const r = { start: 1, end: 2 };
    expect([0.5, 1, 1.5, 2].map((t) => showsAt(r, t))).toEqual([false, true, true, false]);
    expect(showsAt(undefined, 99)).toBe(true);
  });

  it("gives ffmpeg the same position, size and opacity", () => {
    const rect = markRect(o({ anchor: "br", opacity: 0.8, size: 0.25 }), {
      width: 640,
      height: 360,
    });
    expect(overlayFilter(rect, 0.8)).toBe(
      "[1:v]scale=160:64,format=rgba,colorchannelmixer=aa=0.80[m];[0:v][m]overlay=469:285[v]",
    );
    expect(overlayFilter(rect, 0.5, { start: 1, end: 2.5 })).toContain(
      "overlay=469:285:enable='between(t,1.000,2.500)'",
    );
    expect(watermarkCommand("my clip.avi", "logo.png", "out.mp4", "F", 900, true)).toBe(
      `ffmpeg -i 'my clip.avi' -i logo.png -filter_complex "F" -map "[v]" -map '0:a?' -c:v libx264 -b:v 900k -pix_fmt yuv420p -c:a copy out.mp4`,
    );
  });
});
