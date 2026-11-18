import { describe, expect, it } from "vitest";
import {
  atempoChain,
  atempoFilter,
  audioFilter,
  clampPlaybackRate,
  clampSpeed,
  expectedFrames,
  formatSpeed,
  formatSpeedDuration,
  outputDuration,
} from "@/tools/engines/speed/math";

describe("speed math", () => {
  it("chains atempo in 0.5–2.0 steps whose product is the speed", () => {
    expect(atempoChain(2)).toEqual([2]);
    expect(atempoChain(4)).toEqual([2, 2]);
    expect(atempoChain(0.25)).toEqual([0.5, 0.5]);
    expect(atempoChain(0.1)).toEqual([0.5, 0.5, 0.5, 0.8]);
    expect(atempoChain(1.5)).toEqual([1.5]);
    for (const s of [0.1, 0.3, 0.75, 1, 1.25, 3, 6.5, 8]) {
      const product = atempoChain(s).reduce((a, b) => a * b, 1);
      expect(product).toBeCloseTo(s, 5);
      for (const f of atempoChain(s)) {
        expect(f).toBeGreaterThanOrEqual(0.5);
        expect(f).toBeLessThanOrEqual(2);
      }
    }
    expect(atempoFilter(4)).toBe("atempo=2,atempo=2");
  });
  it("shifts pitch through asetrate when pitch is not kept", () => {
    expect(audioFilter(2, true, 48_000)).toBe("atempo=2");
    expect(audioFilter(2, false, 48_000)).toBe("asetrate=96000,aresample=48000");
  });
  it("computes durations and frames", () => {
    expect(outputDuration(60, 2)).toBe(30);
    expect(outputDuration(3, 0.5)).toBe(6);
    expect(expectedFrames(3, 30, 2)).toBe(45);
    expect(expectedFrames(3, 0, 1)).toBe(90);
  });
  it("formats", () => {
    expect(formatSpeedDuration(1.5)).toBe("1.5 s");
    expect(formatSpeedDuration(90)).toBe("1:30");
    expect(formatSpeed(2)).toBe("2×");
    expect(formatSpeed(0.75)).toBe("0.75×");
    expect(formatSpeed(1.333333)).toBe("1.33×");
  });
  it("clamps", () => {
    expect(clampSpeed(0)).toBe(0.1);
    expect(clampSpeed(100)).toBe(8);
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(clampPlaybackRate(0.01)).toBe(0.0625);
    expect(clampPlaybackRate(20)).toBe(16);
    expect(clampPlaybackRate(2)).toBe(2);
  });
});
