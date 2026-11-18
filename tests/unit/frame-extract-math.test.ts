import { describe, expect, it } from "vitest";
import {
  ffmpegQscale,
  frameFfmpegCommand,
  frameFilename,
  lastFrameTime,
  snapToFrame,
} from "@/tools/engines/frame-extract/math";

describe("frame-extract math", () => {
  it("snaps to the nearest frame at the file's frame rate", () => {
    expect(snapToFrame(1.5, 30, 3)).toBeCloseTo(1.5, 6);
    expect(snapToFrame(1.51, 30, 3)).toBeCloseTo(1.5, 6);
    expect(snapToFrame(1.52, 30, 3)).toBeCloseTo(1.5333, 3);
    expect(snapToFrame(0.019, 25, 10)).toBeCloseTo(0, 6);
    expect(snapToFrame(0.021, 25, 10)).toBeCloseTo(0.04, 6);
  });

  it("keeps the time inside the clip: never negative, never past the last frame", () => {
    expect(snapToFrame(-1, 30, 3)).toBe(0);
    expect(snapToFrame(3, 30, 3)).toBeCloseTo(89 / 30, 6);
    expect(snapToFrame(99, 30, 3)).toBeCloseTo(89 / 30, 6);
    expect(snapToFrame(Number.NaN, 30, 3)).toBe(0);
  });

  it("computes the last frame time and survives bad frame rates", () => {
    expect(lastFrameTime(3, 30)).toBeCloseTo(89 / 30, 6);
    expect(lastFrameTime(1, 24)).toBeCloseTo(23 / 24, 6);
    expect(lastFrameTime(0, 30)).toBe(0);
    expect(lastFrameTime(2, 0)).toBeCloseTo(59 / 30, 6);
    expect(lastFrameTime(2, Number.NaN)).toBeCloseTo(59 / 30, 6);
  });

  it("names the file with the timestamp so stills sort in order", () => {
    expect(frameFilename("clip", 12.34, "png")).toBe("clip-0m12s34.png");
    expect(frameFilename("clip", 0, "jpg")).toBe("clip-0m00s00.jpg");
    expect(frameFilename("clip", 61.5, "webp")).toBe("clip-1m01s50.webp");
    expect(frameFilename("clip", 3661.999, "png")).toBe("clip-61m02s00.png");
  });

  it("maps 0–100 quality onto ffmpeg's 2–31 scale and prints an honest command", () => {
    expect(ffmpegQscale(100)).toBe(2);
    expect(ffmpegQscale(0)).toBe(31);
    expect(ffmpegQscale(92)).toBe(4);
    expect(frameFfmpegCommand("in.mp4", "in-0m01s50.png", 1.5, "png", 92)).toBe(
      "ffmpeg -ss 1.500 -i in.mp4 -frames:v 1 in-0m01s50.png",
    );
    expect(frameFfmpegCommand("my clip.mov", "out.jpg", 2, "jpg", 80)).toBe(
      "ffmpeg -ss 2.000 -i 'my clip.mov' -frames:v 1 -q:v 8 out.jpg",
    );
    expect(frameFfmpegCommand("in.mp4", "out.webp", 0, "webp", 60)).toContain("-quality 60");
  });
});
