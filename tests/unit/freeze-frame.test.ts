import { describe, expect, it } from "vitest";
import {
  FreezeOptions,
  frameAt,
  freezeCommand,
  gridTimes,
  heldFrameAt,
  outputLength,
  pausedTime,
  planHolds,
} from "@/tools/engines/freeze-frame/options";

const times = gridTimes(3, 30); // 90 frames, 0 … 89/30

describe("freeze frame plan", () => {
  it("finds the frame shown at a time", () => {
    expect(frameAt(times, 0)).toBe(0);
    expect(frameAt(times, 1.5)).toBe(45);
    expect(frameAt(times, 1.51)).toBe(45);
    expect(frameAt(times, 10)).toBe(89);
    // Variable rate: the frame that started before the moment.
    expect(frameAt([0, 0.04, 0.1, 0.5], 0.3)).toBe(2);
  });

  it("holds start where the held frame ends and merge on one frame", () => {
    const p = planHolds(
      [
        { at: 2, seconds: 1 },
        { at: 1.5, seconds: 2 },
        { at: 1.51, seconds: 0.5 },
      ],
      times,
      3,
    );
    expect(p.map((h) => [h.frame, h.seconds])).toEqual([
      [45, 2.5],
      [60, 1],
    ]);
    expect(p[0]?.from).toBeCloseTo(46 / 30, 9);
  });

  it("the last frame's hold runs from the end", () => {
    const [h] = planHolds([{ at: 2.99, seconds: 2 }], times, 3);
    expect(h?.frame).toBe(89);
    expect(h?.from).toBe(3);
    expect(outputLength(planHolds([{ at: 2.99, seconds: 2 }], times, 3), 3, "pause")).toBe(5);
  });

  it("pause mode shifts later frames by the holds before them", () => {
    const p = planHolds([{ at: 1, seconds: 2 }], times, 3);
    expect(pausedTime(p, 1)).toBe(1); // the held frame itself
    expect(pausedTime(p, 31 / 30)).toBeCloseTo(31 / 30 + 2, 9);
    expect(outputLength(p, 3, "over")).toBe(3);
  });

  it("over mode replaces the frames under each hold", () => {
    const p = planHolds([{ at: 1, seconds: 0.5 }], times, 3);
    expect(heldFrameAt(p, 1)).toBeUndefined();
    expect(heldFrameAt(p, 31 / 30)).toBe(30);
    expect(heldFrameAt(p, 31 / 30 + 0.49)).toBe(30);
    expect(heldFrameAt(p, 31 / 30 + 0.5)).toBeUndefined();
  });

  it("refuses no holds and holds out of range", () => {
    expect(FreezeOptions.safeParse({ holds: [] }).success).toBe(false);
    expect(FreezeOptions.safeParse({ holds: [{ at: 1, seconds: 31 }] }).success).toBe(false);
    expect(FreezeOptions.parse({ holds: [{ at: 1, seconds: 2 }] }).mode).toBe("pause");
  });

  it("writes ffmpeg commands with the last hold looped first", () => {
    const p = planHolds(
      [
        { at: 1, seconds: 2 },
        { at: 2, seconds: 1 },
      ],
      times,
      3,
    );
    const pause = freezeCommand({
      input: "a.mp4",
      output: "a-freeze.mp4",
      planned: p,
      mode: "pause",
      fps: 30,
      kbps: 900,
      duration: 3,
      sound: { rate: 44100, channels: 2 },
    });
    expect(pause).toContain("loop=loop=30:size=1:start=60,loop=loop=60:size=1:start=30");
    expect(pause).toContain("aevalsrc=0:c=stereo:s=44100:d=2[s0]");
    expect(pause).toContain("concat=n=5:v=0:a=1[a]");
    const over = freezeCommand({
      input: "a.mp4",
      output: "a-freeze.mp4",
      planned: p,
      mode: "over",
      fps: 30,
      kbps: 900,
      duration: 3,
      sound: { rate: 44100, channels: 2 },
    });
    expect(over).toContain("split=3[m][r0][r1]");
    expect(over).toContain("[m][r0]freezeframes=first=31:last=90:replace=30[f0]");
    expect(over).toContain("-map 0:a -c:a copy");
  });
});
