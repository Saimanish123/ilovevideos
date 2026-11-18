import { describe, expect, it } from "vitest";
import { fitPart, suggestPart } from "@/tools/engines/ringtone/options";

describe("ringtone part", () => {
  it("suggests the loudest 30 s, on tenths of a second", () => {
    // 60 s of 10 ms levels: quiet, with a loud stretch from 20.37 s to 50.37 s.
    const levels = new Float32Array(6000).fill(-40);
    for (let i = 2037; i < 5037; i++) levels[i] = -10;
    const p = suggestPart(levels, 60);
    expect(Math.abs(p.start - 20.4)).toBeLessThanOrEqual(1);
    expect(Math.round(p.start * 10)).toBe(p.start * 10);
    expect(Math.round(p.end * 10) / 10).toBe(p.end);
    expect(p.end - p.start).toBeCloseTo(30, 5);
  });
  it("takes the whole sound when it is shorter than 30 s", () => {
    expect(suggestPart(new Float32Array(1200).fill(-20), 12)).toEqual({ start: 0, end: 12 });
  });
  it("keeps a part inside the sound and at least one second long", () => {
    expect(fitPart({ start: 50, end: 80 }, 60)).toEqual({ start: 50, end: 60 });
    expect(fitPart({ start: 59.8, end: 59.9 }, 60)).toEqual({ start: 58.9, end: 59.9 });
  });
});
