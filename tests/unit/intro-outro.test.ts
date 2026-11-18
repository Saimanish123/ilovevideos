import { describe, expect, it } from "vitest";
import {
  crossGains,
  fadeShare,
  fitRect,
  gridTimes,
  IntroOutroOptions,
  introOutroCommand,
  outputSize,
  suggestedTitle,
  timeline,
  titleInk,
} from "@/tools/engines/intro-outro/options";

const title = { kind: "title" as const, text: "Hello", background: "#000000", durationSec: 3 };
const o = (x: Partial<IntroOutroOptions> = {}) => IntroOutroOptions.parse(x);

describe("intro and outro timeline", () => {
  it("overlaps each join by the crossfade", () => {
    const tl = timeline(o({ intro: title, outro: { ...title, durationSec: 2 } }), 10);
    expect(tl).toMatchObject({ fadeIn: 0.5, fadeOut: 0.5, mainStart: 2.5, mainEnd: 12.5 });
    expect(tl.outroStart).toBe(12);
    expect(tl.total).toBe(14);
  });

  it("joins end to end with a cut", () => {
    const tl = timeline(o({ intro: title, transition: "cut" }), 10);
    expect(tl).toMatchObject({ mainStart: 3, mainEnd: 13, total: 13, fadeIn: 0 });
  });

  it("keeps each fade within half of either side", () => {
    const tl = timeline(o({ intro: { ...title, durationSec: 0.6 }, fadeSec: 2 }), 0.4);
    expect(tl.fadeIn).toBeCloseTo(0.2, 9);
  });

  it("puts frames on the grid between two times", () => {
    expect(gridTimes(0, 0.1, 30).length).toBe(3);
    expect(gridTimes(2.5, 2.6, 30)[0]).toBeCloseTo(2.5, 9);
    expect(gridTimes(1 / 3, 0.4, 30)).toEqual([10 / 30, 11 / 30]);
  });

  it("fades with equal power", () => {
    const [a, b] = crossGains(0.5);
    expect(a * a + b * b).toBeCloseTo(1, 9);
    expect(fadeShare(2.75, 2.5, 0.5)).toBe(0.5);
    expect(fadeShare(1, 2, 0)).toBe(0);
  });

  it("fits a picture inside or over the frame", () => {
    expect(fitRect({ width: 100, height: 100 }, { width: 1920, height: 1080 }, "contain")).toEqual({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080,
    });
    expect(fitRect({ width: 100, height: 100 }, { width: 1920, height: 1080 }, "cover").width).toBe(
      1920,
    );
    expect(outputSize({ width: 641, height: 361 })).toEqual({ width: 640, height: 360 });
  });

  it("chooses text that reads on the card", () => {
    expect(titleInk("#000000")).toBe("#ffffff");
    expect(titleInk("#ffd60a")).toBe("#111111");
  });

  it("suggests a title only from readable names", () => {
    expect(suggestedTitle("Trip to Lisbon.mp4")).toBe("Trip to Lisbon");
    expect(suggestedTitle("my_cooking-video.mov")).toBe("my cooking video");
    expect(suggestedTitle("IMG_4031.MOV")).toBe("");
    expect(suggestedTitle("PXL_20261101_120000.mp4")).toBe("");
    expect(suggestedTitle("20261101_120000.mp4")).toBe("");
    expect(suggestedTitle("x.mp4", "Our wedding")).toBe("Our wedding");
  });

  it("writes an ffmpeg command with xfade and acrossfade", () => {
    const cmd = introOutroCommand(
      o({ intro: title }),
      { name: "a.mp4", size: { width: 640, height: 360 }, fps: 30, durationSec: 3, hasAudio: true },
      "a-with-intro.mp4",
      2000,
    );
    expect(cmd).toContain("xfade=transition=fade:duration=0.5:offset=2.500");
    expect(cmd).toContain("acrossfade=d=0.5");
    expect(cmd).toContain("color=c=0x000000:s=640x360:r=30");
  });
});
