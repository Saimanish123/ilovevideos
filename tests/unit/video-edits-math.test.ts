import { describe, expect, it } from "vitest";
import { codecBitrate, codecContainer, planCodec } from "@/tools/engines/codec/plan";
import {
  encodedSize,
  evenCropFilter,
  evenSizeNote,
  oddEdgeWords,
  padFilter,
  withEvenCrop,
  withEvenCropOut,
} from "@/tools/engines/crop/math";
import { reencodeBitrate } from "@/tools/engines/crop/plan";
import { cadence, defaultTarget, formatFps, presetsBelow } from "@/tools/engines/framerate/math";
import { playLength, plays } from "@/tools/engines/loop/math";
import {
  borderDetail,
  borderHow,
  borderLayout,
  borderPx,
  borderTooThick,
  borderWhat,
} from "@/tools/engines/pad/options";
import {
  decodeCost,
  maxReversedSound,
  reverseWindows,
  windowFrames,
} from "@/tools/engines/reverse/math";
import type { MediaInfo } from "@/tools/engines/types";
import { fadeFilters } from "@/tools/engines/video-fade/math";
import {
  adjustTransform,
  applyPixel,
  compose,
  contrast,
  ffmpegColorFilter,
  IDENTITY,
  saturation,
  svgMatrixValues,
  withFade,
} from "@/tools/engines/video-filter/color";
import {
  matrixCorrection,
  sameColorTags,
  targetColorTags,
} from "@/tools/engines/video-filter/color-tags";
import { looks, lookTransform } from "@/tools/engines/video-filter/looks";
import { fadeAmount, filterIsNoop, fitFades } from "@/tools/engines/video-filter/options";
import {
  pictureBitrate,
  pictureSize,
  sizeWords,
  soundPlan,
} from "@/tools/engines/video-filter/plan";

const close = (a: number[], b: number[], eps = 1e-3) => {
  for (const [i, v] of a.entries()) expect(v).toBeCloseTo(b[i] ?? Number.NaN, -Math.log10(eps));
};

describe("colour transforms", () => {
  it("saturation 0 is Rec. 709 grey and keeps white white", () => {
    const [r, g, b] = applyPixel({ gamma: [1, 1, 1], matrix: saturation(0) }, 1, 0, 0);
    close([r, g, b], [0.2126, 0.2126, 0.2126]);
    close(applyPixel({ gamma: [1, 1, 1], matrix: saturation(0) }, 1, 1, 1), [1, 1, 1]);
  });

  it("contrast pivots on mid grey and clamps", () => {
    const t = { gamma: [1, 1, 1] as [number, number, number], matrix: contrast(2) };
    close(applyPixel(t, 0.5, 0.5, 0.5), [0.5, 0.5, 0.5]);
    close(applyPixel(t, 0.9, 0.1, 0.75), [1, 0, 1]);
  });

  it("compose applies the first matrix, then the second", () => {
    // Grey, then contrast 2: a mid-dark red becomes darker grey.
    const m = compose(saturation(0), contrast(2));
    const [r] = applyPixel({ gamma: [1, 1, 1], matrix: m }, 0.8, 0, 0);
    expect(r).toBeCloseTo(Math.max(0, (0.8 * 0.2126 - 0.5) * 2 + 0.5), 5);
  });

  it("brightness is a midtone lift: black and white stay put", () => {
    const t = adjustTransform({ brightness: 1, contrast: 0, saturation: 0 });
    close(applyPixel(t, 0, 0, 0), [0, 0, 0]);
    close(applyPixel(t, 1, 1, 1), [1, 1, 1]);
    close(applyPixel(t, 0.25, 0.25, 0.25), [0.5, 0.5, 0.5]);
  });

  it("a fade at 0 is the fade colour and at 1 the picture", () => {
    close(applyPixel(withFade(IDENTITY, 0, [1, 1, 1]), 0.2, 0.4, 0.6), [1, 1, 1]);
    close(applyPixel(withFade(IDENTITY, 0.5, [0, 0, 0]), 0.2, 0.4, 0.6), [0.1, 0.2, 0.3]);
    expect(withFade(IDENTITY, 1, [0, 0, 0])).toBe(IDENTITY);
  });

  it("writes the same transform for ffmpeg and for the SVG preview", () => {
    expect(ffmpegColorFilter(IDENTITY)).toBe("");
    const sepia = looks.sepia.transform;
    expect(ffmpegColorFilter(sepia)).toBe(
      "colorchannelmixer=rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131",
    );
    const faded = ffmpegColorFilter(looks.faded.transform);
    expect(faded).toMatch(/^colorchannelmixer=.*,lutrgb=r='clip\(val\+[\d.]+,0,255\)'/);
    expect(ffmpegColorFilter(looks.soft.transform)).toMatch(
      /^lutrgb=r='pow\(val\/255,0\.9\)\*255'/,
    );
    expect(svgMatrixValues(IDENTITY.matrix)).toBe("1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0");
  });

  it("a look at strength 0 does nothing; at 1 it is the look", () => {
    expect(
      filterIsNoop({
        job: "look",
        look: "sepia",
        strength: 0,
        brightness: 0,
        contrast: 0,
        saturation: 0,
      }),
    ).toBe(true);
    expect(lookTransform("sepia", 1).matrix).toEqual(looks.sepia.transform.matrix);
    expect(
      filterIsNoop({
        job: "adjust",
        look: "sepia",
        strength: 1,
        brightness: 0,
        contrast: 0,
        saturation: 0,
      }),
    ).toBe(true);
  });
});

describe("fades", () => {
  it("never overlap and never run past the clip", () => {
    expect(fitFades({ fadeIn: 3, fadeOut: 3 }, 4)).toEqual({ fadeIn: 2, fadeOut: 2 });
    expect(fitFades({ fadeIn: 1, fadeOut: 2 }, 10)).toEqual({ fadeIn: 1, fadeOut: 2 });
  });

  it("ramps up, holds and ramps down", () => {
    expect(fadeAmount(0, 10, 1, 1)).toBe(0);
    expect(fadeAmount(0.5, 10, 1, 1)).toBeCloseTo(0.5);
    expect(fadeAmount(5, 10, 1, 1)).toBe(1);
    expect(fadeAmount(9.75, 10, 1, 1)).toBeCloseTo(0.25);
  });

  it("builds ffmpeg fade and afade filters", () => {
    const f = fadeFilters({ fadeIn: 1, fadeOut: 2, color: "white", audio: true }, 10);
    expect(f.vf).toBe("fade=t=in:st=0:d=1:c=white,fade=t=out:st=8:d=2:c=white,format=yuv420p");
    expect(f.af).toBe("afade=t=in:st=0:d=1,afade=t=out:st=8:d=2");
  });
});

describe("frame rate", () => {
  it("offers rates below the source only", () => {
    expect(presetsBelow(60)).toEqual([50, 30, 25, 24, 15, 12]);
    expect(presetsBelow(24)).toEqual([15, 12]);
    expect(presetsBelow(12)).toEqual([]);
  });

  it("defaults to half of 50 and 60, and 24 for 30", () => {
    expect(defaultTarget(60)).toBe(30);
    expect(defaultTarget(59.94)).toBe(30);
    expect(defaultTarget(50)).toBe(25);
    expect(defaultTarget(30)).toBe(24);
    expect(defaultTarget(29.97)).toBe(24);
    expect(defaultTarget(12)).toBeUndefined();
  });

  it("describes the cadence honestly", () => {
    expect(cadence(60, 30)).toEqual({ text: "keeps every 2nd frame", even: true });
    expect(cadence(60, 15)).toEqual({ text: "keeps every 4th frame", even: true });
    expect(cadence(30, 24)).toEqual({ text: "drops 1 of every 5 frames", even: false });
    expect(cadence(29.97, 24).even).toBe(false);
  });

  it("names broadcast rates as themselves and measured whole rates as whole", () => {
    // Exact NTSC-family rates, as the inspector reads them from MP4 (24000/1001 etc.).
    expect(formatFps(24000 / 1001)).toBe("23.976\u00a0fps");
    expect(formatFps(30000 / 1001)).toBe("29.97\u00a0fps");
    expect(formatFps(60000 / 1001)).toBe("59.94\u00a0fps");
    // The same rates estimated from WebM's millisecond timestamps (inspector, 3 s clips).
    expect(formatFps(23.97835287853781)).toBe("23.976\u00a0fps");
    expect(formatFps(29.96637107911485)).toBe("29.97\u00a0fps");
    expect(formatFps(59.93065874195147)).toBe("59.94\u00a0fps");
    // Whole rates: MP4 fixtures read exactly; WebM and MKV estimates land a little off.
    expect(formatFps(30)).toBe("30\u00a0fps");
    expect(formatFps(29.99666704032848)).toBe("30\u00a0fps");
    expect(formatFps(24.00266696833041)).toBe("24\u00a0fps");
    expect(formatFps(29.9999)).toBe("30\u00a0fps");
    expect(formatFps(30.0004)).toBe("30\u00a0fps");
    // Anything else keeps up to three decimals, trailing zeros trimmed.
    expect(formatFps(12.5)).toBe("12.5\u00a0fps");
    expect(formatFps(23.9)).toBe("23.9\u00a0fps");
  });
});

describe("loop", () => {
  it("counts whole plays to reach a length", () => {
    expect(plays(7, { minSeconds: 30 })).toBe(5);
    expect(plays(10, { minSeconds: 30 })).toBe(3);
    expect(plays(3, { times: 4 })).toBe(4);
    expect(plays(40, { minSeconds: 30 })).toBe(1);
  });

  it("a boomerang play is forwards and back minus the turning frame", () => {
    expect(playLength(2, 30, true)).toBeCloseTo(4 - 1 / 30);
    expect(playLength(2, 30, false)).toBe(2);
  });
});

describe("reverse windows", () => {
  const frames = Array.from({ length: 90 }, (_, i) => i / 30);
  const keys = [0, 1, 2];

  it("walks the groups from the end, each window last first", () => {
    const w = reverseWindows(frames, keys, 300);
    expect(w).toHaveLength(3);
    expect(w[0]?.first).toBeCloseTo(2);
    expect(w[0]?.last).toBeCloseTo(89 / 30);
    expect(w.reduce((s, x) => s + x.count, 0)).toBe(90);
  });

  it("splits a long group into windows and counts the extra decoding", () => {
    const w = reverseWindows(frames, [0], 20);
    expect(w.map((x) => x.count)).toEqual([20, 20, 20, 20, 10]);
    expect(decodeCost(frames, keys, 300)).toBe(1);
    // One 90-frame group in windows of 20: 90 + 70 + 50 + 30 + 10 decodes.
    expect(decodeCost(frames, [0], 20)).toBeCloseTo(250 / 90);
  });

  it("sizes windows from the frame size and caps the sound", () => {
    expect(windowFrames(640, 360)).toBe(300);
    expect(windowFrames(3840, 2160)).toBe(30);
    expect(maxReversedSound(48_000, 2)).toBe(1041);
  });
});

describe("border", () => {
  const hd = { width: 1920, height: 1080 };
  it("grows the frame by the border on every edge", () => {
    expect(borderPx({ size: 0.05 }, hd)).toBe(54);
    expect(borderLayout({ size: 0.05, color: "white", keepSize: false }, hd)).toEqual({
      width: 2028,
      height: 1188,
      inner: { x: 54, y: 54, width: 1920, height: 1080 },
    });
  });

  it("keeps the frame and shrinks the picture when asked", () => {
    const l = borderLayout({ size: 0.05, color: "white", keepSize: true }, hd);
    expect(l.width).toBe(1920);
    expect(l.height).toBe(1080);
    expect(l.inner.height).toBeLessThanOrEqual(1080 - 2 * 54);
    expect(l.inner.width % 2).toBe(0);
    expect(borderTooThick({ size: 0.25, px: 540, color: "white", keepSize: true }, hd)).toBe(true);
  });

  it("writes hex colours and the blurred background as ffmpeg filters", () => {
    const layout = borderLayout({ size: 0.05, color: "#ff8800", keepSize: false }, hd);
    expect(padFilter(layout, hd, "#ff8800")).toBe("pad=2028:1188:54:54:color=0xFF8800");
    expect(padFilter(layout, hd, "blur")).toMatch(/^split\[bg\]\[fg\];\[bg\]scale=2028:1188/);
  });
});

describe("codec plan and sound", () => {
  const info = (codec: string, audio = "aac", bitrate = 8_000_000): MediaInfo => ({
    container: "MP4",
    durationSec: 10,
    sizeBytes: 10_000_000,
    video: { codec, width: 1920, height: 1080, fps: 30, bitrate },
    audio: [{ codec: audio, channels: 2, sampleRate: 48_000 }],
  });

  it("puts each codec in a container that plays it", () => {
    expect(codecContainer("a.mp4", "vp9")).toBe("webm");
    expect(codecContainer("a.mov", "hevc")).toBe("mov");
    expect(codecContainer("a.webm", "av1")).toBe("webm");
    expect(codecContainer("a.mkv", "vp9")).toBe("mkv");
    expect(codecContainer("a.avi", "avc")).toBe("mp4");
  });

  it("never spends more bits than the source, scaled for the codec", () => {
    expect(codecBitrate(info("avc", "aac", 2_000_000), "hevc")).toBe(1_200_000);
    expect(codecBitrate(info("hevc", "aac", 3_000_000), "avc")).toBe(5_000_000);
  });

  it("copies sound the container plays and encodes the rest", () => {
    expect(planCodec(info("avc"), "a.mp4", "hevc").sound).toBe("copy");
    expect(planCodec(info("avc"), "a.mp4", "vp9").sound).toBe("encode");
    expect(soundPlan(info("avc", "opus"), "mp4")).toBe("encode");
    expect(soundPlan(info("avc", "opus"), "webm")).toBe("copy");
  });
});

describe("odd sizes", () => {
  const odd = { width: 641, height: 361 };
  const info = (bitrate?: number, codec = "vp9"): MediaInfo => ({
    container: "WebM",
    durationSec: 3,
    sizeBytes: 62_894,
    video: { codec, width: 641, height: 361, fps: 30, bitrate },
    audio: [{ codec: "opus", channels: 1, sampleRate: 48_000 }],
  });

  it("cuts an odd edge for H.264 and HEVC only, never scaling", () => {
    expect(encodedSize(odd)).toEqual({ width: 640, height: 360 });
    expect(encodedSize(odd, "hevc")).toEqual({ width: 640, height: 360 });
    expect(encodedSize(odd, "vp9")).toEqual(odd);
    expect(encodedSize({ width: 640, height: 361 })).toEqual({ width: 640, height: 360 });
    expect(encodedSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(evenCropFilter(odd)).toBe("crop=640:360:0:0");
    expect(evenCropFilter(odd, "av1")).toBe("");
    expect(withEvenCrop(odd, "reverse")).toBe("crop=640:360:0:0,reverse");
    expect(withEvenCrop({ width: 640, height: 360 }, "reverse")).toBe("reverse");
    expect(withEvenCropOut(odd, "[0:v][m]overlay=8:8[v]")).toBe(
      "[0:v][m]overlay=8:8,crop=640:360:0:0[v]",
    );
    expect(oddEdgeWords({ width: 641, height: 360 })).toBe("last column");
  });

  it("states the real output size", () => {
    expect(evenSizeNote(odd)).toBe("641×361 becomes 640×360: H.264 needs even edges.");
    expect(evenSizeNote({ width: 640, height: 360 })).toBe("");
    expect(pictureSize(info())).toEqual({ width: 640, height: 360 });
    expect(sizeWords(odd, { width: 640, height: 360 })).toBe(
      "641×361 → 640×360 (H.264 needs even edges)",
    );
    expect(planCodec(info(), "a.webm", "avc").size).toEqual({ width: 640, height: 360 });
    expect(planCodec(info(90_000, "avc"), "a.mp4", "av1").size).toEqual(odd);
  });

  it("cuts an odd source into a border instead of scaling it", () => {
    const grow = borderLayout({ size: 0.05, color: "white", keepSize: false }, odd);
    expect(grow.inner).toEqual({ x: 18, y: 18, width: 640, height: 360 });
    expect(padFilter(grow, odd, "white")).toBe("crop=640:360:0:0,pad=676:396:18:18:color=white");
    const keep = { size: 0.05, color: "white", keepSize: true };
    expect(borderWhat(keep, info())).toBe(
      "18 px white border, frame kept at 640×360: H.264 needs even edges",
    );
    expect(
      borderWhat(keep, { ...info(), video: { codec: "avc", width: 640, height: 360, fps: 30 } }),
    ).toBe("18 px white border, frame size kept");
    expect(borderHow(keep, odd)).toMatch(
      /^The frame becomes 640×360 \(641×361 less its last column and row\)/,
    );
    expect(borderDetail({ ...keep, keepSize: false }, odd)).toBe(
      "The picture is unscaled inside a larger frame, less its last column and row: H.264 needs even edges.",
    );
  });

  it("keeps a re-encode near the source's own bitrate", () => {
    // 90 kbps of VP9 is about 138 kbps of H.264; the density alone asked for 829 kbps.
    expect(pictureBitrate(info(undefined))).toBe(829_440);
    expect(pictureBitrate(info(90_000))).toBe(200_000);
    // 600 kbps of VP9 would be 923 kbps of H.264: the density (829 kbps) is lower and stands.
    expect(pictureBitrate(info(600_000))).toBe(829_440);
    // A crop keeps a quarter of the picture, so a quarter of the source's bits (density floor 250 kbps).
    const avc = info(1_000_000, "avc").video;
    expect(reencodeBitrate({ size: { width: 320, height: 180 }, fps: 30, source: avc })).toBe(
      248_919,
    );
  });
});

describe("colour tags", () => {
  it("carries the source's tags and reads untagged pictures by their size", () => {
    const tagged = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false };
    expect(targetColorTags(tagged, 480)).toEqual(tagged);
    expect(targetColorTags({ fullRange: false }, 480)).toEqual({
      primaries: "smpte170m",
      transfer: "smpte170m",
      matrix: "smpte170m",
      fullRange: false,
    });
    expect(targetColorTags(undefined, 576).matrix).toBe("smpte170m");
    expect(targetColorTags(undefined, 720).matrix).toBe("bt709");
    // A partly tagged source keeps what it names.
    expect(targetColorTags({ matrix: "bt709" }, 480)).toMatchObject({
      matrix: "bt709",
      primaries: "smpte170m",
    });
    expect(sameColorTags(tagged, { ...tagged, fullRange: null })).toBe(true);
  });

  it("turns colours read with BT.709 into those BT.601 meant", () => {
    const m = matrixCorrection("bt709", "smpte170m");
    // Pure red as BT.601 Y′CbCr, decoded with the BT.709 matrix, comes back to (1, 0, 0).
    const [y, cb, cr] = [0.299, -0.168736, 0.5];
    const read = [y + 1.5748 * cr, y - 0.187324 * cb - 0.468124 * cr, y + 1.8556 * cb];
    const fixed = [0, 1, 2].map(
      (r) =>
        (m[r * 4] ?? 0) * (read[0] ?? 0) +
        (m[r * 4 + 1] ?? 0) * (read[1] ?? 0) +
        (m[r * 4 + 2] ?? 0) * (read[2] ?? 0),
    );
    close(fixed, [1, 0, 0]);
    // White stays white; the same matrix twice is no change.
    close(
      [0, 1, 2].map((r) => (m[r * 4] ?? 0) + (m[r * 4 + 1] ?? 0) + (m[r * 4 + 2] ?? 0)),
      [1, 1, 1],
    );
    expect(matrixCorrection("bt709", "bt709")).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  });
});
