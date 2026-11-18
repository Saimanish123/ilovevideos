import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_SECONDS,
  defaultRange,
  effectiveFps,
  estimateGifBytes,
  frameCount,
  frameDelaysCs,
  frameTimestamps,
  gifDimensions,
} from "@/tools/engines/video-to-gif/math";

describe("video-to-gif math", () => {
  it("scales to the width preset with even dimensions and never upscales", () => {
    expect(gifDimensions(1920, 1080, 480)).toEqual({ width: 480, height: 270 });
    expect(gifDimensions(640, 360, 480)).toEqual({ width: 480, height: 270 });
    expect(gifDimensions(1080, 1920, 360)).toEqual({ width: 360, height: 640 });
    expect(gifDimensions(320, 240, 480)).toEqual({ width: 320, height: 240 });
    expect(gifDimensions(1280, 720, "original")).toEqual({ width: 1280, height: 720 });
    expect(gifDimensions(853, 480, 480)).toEqual({ width: 480, height: 270 });
  });
  it("falls back to sane dimensions when the source reports none", () => {
    expect(gifDimensions(0, 0, 240).width).toBe(240);
  });
  it("caps the default range and keeps short clips whole", () => {
    expect(defaultRange(3)).toEqual({ start: 0, end: 3 });
    expect(defaultRange(120)).toEqual({ start: 0, end: DEFAULT_MAX_SECONDS });
    expect(defaultRange(Number.NaN).end).toBe(DEFAULT_MAX_SECONDS);
  });
  it("counts frames and spaces timestamps at the target rate", () => {
    expect(frameCount(0, 3, 12)).toBe(36);
    expect(frameCount(1.5, 1.5, 12)).toBe(1);
    const ts = frameTimestamps(2, 3, 10);
    expect(ts).toHaveLength(10);
    expect(ts[0]).toBe(2);
    expect(ts[9]).toBeCloseTo(2.9, 6);
  });
  it("spreads delays in hundredths so the GIF lasts exactly as long as the range", () => {
    // QA 2026-10-08: 24 frames at 12 fps were 24 × 8 cs = 1.92 s for a 2.0 s range.
    const d12 = frameDelaysCs(24, 12);
    expect(d12.reduce((a, b) => a + b, 0)).toBe(200);
    expect(new Set(d12)).toEqual(new Set([8, 9]));
    expect(d12.slice(0, 6)).toEqual([8, 9, 8, 8, 9, 8]);
    for (const fps of [5, 10, 12, 15, 20, 24, 25, 30]) {
      for (const n of [1, 7, 36, 180]) {
        const total = frameDelaysCs(n, fps).reduce((a, b) => a + b, 0);
        expect(total).toBe(Math.round((n * 100) / fps));
      }
    }
    expect(frameDelaysCs(3, 10)).toEqual([10, 10, 10]);
    // Browsers play delays under 2 cs as 10 cs: 2 cs is the floor.
    expect(Math.min(...frameDelaysCs(10, 100))).toBe(2);
    expect(effectiveFps(12)).toBe(12);
    expect(effectiveFps(100)).toBe(50);
  });
  it("estimates size monotonically in frames, pixels and quality", () => {
    const small = estimateGifBytes(240, 135, 36, "fast");
    const wide = estimateGifBytes(480, 270, 36, "fast");
    const longer = estimateGifBytes(480, 270, 72, "fast");
    const best = estimateGifBytes(480, 270, 36, "best");
    expect(small).toBeLessThan(wide);
    expect(wide).toBeLessThan(longer);
    expect(wide).toBeLessThan(best);
    expect(wide).toBeGreaterThan(500_000);
    expect(wide).toBeLessThan(3_000_000);
  });
  it("follows a measured sample frame when the page has one", () => {
    // QA 2026-10-08: a flat test pattern, 24 frames at 480×270, came out 328 kB; the content-blind
    // estimate said about 1 MB. A sample of one of its frames measures 0.10 bytes per pixel.
    const sampled = estimateGifBytes(480, 270, 24, "fast", 0.103);
    expect(sampled).toBeGreaterThan(328_392 * 0.8);
    expect(sampled).toBeLessThan(328_392 * 1.2);
    expect(estimateGifBytes(480, 270, 24, "best", 0.103)).toBeGreaterThan(sampled);
    // No sample: the median of the measured sources.
    expect(estimateGifBytes(480, 270, 24, "fast", 0)).toBe(estimateGifBytes(480, 270, 24, "fast"));
  });
});

describe("video-to-gif size sample", () => {
  it("measures a frame the way the fast path encodes it: flat is cheap, noise is not", async () => {
    const { sampleGifBytesPerPixel } = await import("@/tools/engines/video-to-gif/sample-size");
    const w = 160;
    const h = 90;
    const flat = new Uint8ClampedArray(w * h * 4).fill(200);
    let seed = 7;
    const noise = Uint8ClampedArray.from({ length: w * h * 4 }, () => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
      return seed >> 23;
    });
    const a = sampleGifBytesPerPixel(flat, w, h);
    const b = sampleGifBytesPerPixel(noise, w, h);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(0.05);
    expect(b).toBeGreaterThan(0.7);
    expect(sampleGifBytesPerPixel(flat, 0, 0)).toBe(0);
  });
});
