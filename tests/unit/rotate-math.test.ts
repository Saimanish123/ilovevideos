import { describe, expect, it } from "vitest";
import {
  addRotation,
  isMetadataRotation,
  rotateCommand,
  rotatedDimensions,
  rotateFilter,
} from "@/tools/engines/rotate/math";

describe("rotate math", () => {
  it("swaps width and height for quarter turns only", () => {
    expect(rotatedDimensions(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(rotatedDimensions(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(rotatedDimensions(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    expect(rotatedDimensions(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
  });
  it("adds quarter turns and wraps", () => {
    expect(addRotation(0, 90)).toBe(90);
    expect(addRotation(270, 90)).toBe(0);
    expect(addRotation(0, -90)).toBe(270);
    expect(addRotation(90, -90)).toBe(0);
  });
  it("is a metadata rotation only for MP4/MOV without a flip", () => {
    expect(isMetadataRotation("mp4", "none")).toBe(true);
    expect(isMetadataRotation("mov", "none")).toBe(true);
    expect(isMetadataRotation("webm", "none")).toBe(false);
    expect(isMetadataRotation("mp4", "horizontal")).toBe(false);
  });
  it("builds the ffmpeg filter with rotation before flip", () => {
    expect(rotateFilter(90, "none")).toBe("transpose=1");
    expect(rotateFilter(270, "vertical")).toBe("transpose=2,vflip");
    expect(rotateFilter(0, "horizontal")).toBe("hflip");
    expect(rotateCommand("a.mp4", "b.mp4", 90, "none", true)).toBe(
      "ffmpeg -i a.mp4 -c copy -metadata:s:v rotate=270 b.mp4",
    );
    expect(rotateCommand("a.mp4", "b.mp4", 0, "horizontal", false)).toBe(
      "ffmpeg -i a.mp4 -vf hflip -c:a copy b.mp4",
    );
  });
});
