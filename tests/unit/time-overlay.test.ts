import { describe, expect, it } from "vitest";
import {
  barProgress,
  barRect,
  cellEm,
  formatSteps,
  parseClock,
  shownSteps,
  TimeOverlayOptions,
  timeCommand,
  timeRange,
  timerBlock,
  timerRect,
  timerTemplate,
  timerText,
} from "@/tools/engines/time-overlay/options";

const base = (o: Partial<TimeOverlayOptions> = {}) => TimeOverlayOptions.parse(o);
const f30 = 1 / 30;

describe("progress bar", () => {
  it("is empty on the first frame and full on the last", () => {
    const r = { start: 0, end: 10 };
    expect(barProgress(r, f30, 0)).toBe(0);
    expect(barProgress(r, f30, 10 - f30)).toBeCloseTo(1, 9);
    expect(barProgress(r, f30, 5 - f30 / 2)).toBeCloseTo(0.5, 9);
  });

  it("holds outside the range and fills a one-frame range", () => {
    const r = { start: 2, end: 4 };
    expect(barProgress(r, f30, 1)).toBe(0);
    expect(barProgress(r, f30, 5)).toBe(1);
    expect(barProgress({ start: 1, end: 1 + f30 }, f30, 1)).toBe(1);
  });

  it("sits on the even output frame, measured from the shorter side", () => {
    expect(barRect(base(), { width: 1920, height: 1080 })).toEqual({
      x: 0,
      y: 1069,
      width: 1920,
      height: 11,
    });
    // Odd source: the bar ends on the encoded edge (640×360), not on the dropped row.
    expect(barRect(base({ edge: "bottom" }), { width: 641, height: 361 })).toMatchObject({
      y: 360 - 4,
      width: 640,
    });
    expect(barRect(base({ edge: "top", inset: 0.05 }), { width: 1080, height: 1920 })).toEqual({
      x: 0,
      y: 54,
      width: 1080,
      height: 11,
    });
  });

  it("clamps a range past the end of the video", () => {
    expect(timeRange({ range: { start: 3, end: 99 } }, 10)).toEqual({ start: 3, end: 10 });
    expect(timeRange({ range: { start: 30, end: 40 } }, 10)).toEqual({ start: 10, end: 10 });
  });
});

describe("timer", () => {
  it("counts up from 0:00, rounding down", () => {
    const o = base({ kind: "timer" });
    const r = { start: 0, end: 10 };
    expect(timerText(o, r, f30, 0)).toBe("0:00");
    expect(timerText(o, r, f30, 0.999)).toBe("0:00");
    expect(timerText(o, r, f30, 1)).toBe("0:01");
    // 30 frames at exact 1/30 s steps: float error must not drop a second.
    expect(timerText(o, r, f30, 30 * f30)).toBe("0:01");
    expect(timerText(o, r, f30, 10 - f30)).toBe("0:09");
  });

  it("counts down to 0:00 on the last frame, rounding up", () => {
    const o = base({ kind: "timer", direction: "down" });
    const r = { start: 0, end: 10 };
    expect(timerText(o, r, f30, 0)).toBe("0:10");
    expect(timerText(o, r, f30, 0.5)).toBe("0:10");
    // The span ends on the last frame's start, so 0:09 begins one frame before 1 s.
    expect(timerText(o, r, f30, 1 - 2 * f30)).toBe("0:10");
    expect(timerText(o, r, f30, 1 - f30)).toBe("0:09");
    expect(timerText(o, r, f30, 10 - f30)).toBe("0:00");
  });

  it("starts from a typed value and never goes below zero", () => {
    const up = base({ kind: "timer", from: 3595 });
    expect(timerText(up, { start: 0, end: 10 }, f30, 6)).toBe("60:01");
    const hms = base({ kind: "timer", from: 3595, format: "h:mm:ss" });
    expect(timerText(hms, { start: 0, end: 10 }, f30, 6)).toBe("1:00:01");
    const down = base({ kind: "timer", direction: "down", from: 2 });
    expect(timerText(down, { start: 0, end: 10 }, f30, 5)).toBe("0:00");
  });

  it("shows tenths in s.t", () => {
    const o = base({ kind: "timer", format: "s.t" });
    expect(timerText(o, { start: 1, end: 20 }, f30, 13.35)).toBe("12.3");
    const d = base({ kind: "timer", format: "s.t", direction: "down", from: 5 });
    expect(timerText(d, { start: 0, end: 20 }, f30, 0.04)).toBe("5.0");
    expect(timerText(d, { start: 0, end: 20 }, f30, 0.11)).toBe("4.9");
  });

  it("formats steps", () => {
    expect(formatSteps(0, "m:ss")).toBe("0:00");
    expect(formatSteps(3725, "m:ss")).toBe("62:05");
    expect(formatSteps(3725, "h:mm:ss")).toBe("1:02:05");
    expect(formatSteps(125, "s.t")).toBe("12.5");
    expect(shownSteps(9.9999999, "m:ss", "down")).toBe(10);
  });

  it("sizes the block for the widest value, in fixed cells", () => {
    const o = base({ kind: "timer" });
    // 0:00 to 10:59 shows five cells at most.
    expect(timerTemplate(o, { start: 0, end: 660 }, f30)).toBe("00:00");
    expect(timerTemplate(o, { start: 0, end: 30 }, f30)).toBe("0:00");
    const px = 80;
    const b = timerBlock("00:00", px);
    expect(b.width).toBe(
      Math.ceil((4 * cellEm("0") + cellEm(":")) * px + 2 * Math.round(px * 0.3)),
    );
    // Every digit is as wide as every other.
    expect(cellEm("1")).toBe(cellEm("8"));
  });

  it("places the block with the watermark's anchors", () => {
    const o = base({ kind: "timer", anchor: "tr", margin: 0.04 });
    const v = { width: 1920, height: 1080 };
    const r = timerRect(o, { start: 0, end: 30 }, f30, v);
    expect(r.x + r.width).toBe(1920 - Math.round(1080 * 0.04));
    expect(r.y).toBe(Math.round(1080 * 0.04));
  });

  it("reads typed times", () => {
    expect(parseClock("1:30")).toBe(90);
    expect(parseClock("0:01:30")).toBe(90);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("12.5")).toBe(12.5);
    expect(parseClock("1:75")).toBeUndefined();
    expect(parseClock("abc")).toBeUndefined();
  });

  it("writes a matching ffmpeg command", () => {
    const cmd = timeCommand(
      base({ kind: "timer", direction: "down" }),
      { name: "a.mp4", durationSec: 10, fps: 30, video: { width: 641, height: 360 } },
      "a-timer.mp4",
      4000,
      "copy",
    );
    expect(cmd).toContain("drawtext=fontfile=Geist-Bold.ttf");
    expect(cmd).toContain("ceil(");
    expect(cmd).toContain("crop=640:360:0:0");
    const bar = timeCommand(
      base(),
      { name: "a.mp4", durationSec: 10, fps: 30, video: { width: 640, height: 360 } },
      "a-progress-bar.mp4",
      4000,
      "none",
    );
    expect(bar).toContain("overlay=x='-w+w*clip((t-0)/9.967,0,1)'");
    expect(bar).toContain(" -an ");
  });
});
