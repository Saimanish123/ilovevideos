import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capFor, framePlatforms } from "@/content/platforms/frames";
import { AspectRatioOptions, aspectNoop, aspectPlan } from "@/tools/engines/aspect-ratio/options";
import { planConversion } from "@/tools/engines/convert-video/plan";
import { outputSize } from "@/tools/engines/crop/plan";
import { parseGif, playedDelay } from "@/tools/engines/gif-to-video/gif";
import { evenSize, frameCountOf, gifInfo } from "@/tools/engines/gif-to-video/options";
import type { MediaInfo } from "@/tools/engines/types";

describe("GIF header reader", () => {
  const bytes = new Uint8Array(readFileSync("tests/fixtures/sample.gif"));

  it("reads size, frames, delays and loop count from the fixture", () => {
    const g = parseGif(bytes);
    expect(g.width).toBe(301);
    expect(g.height).toBe(201);
    expect(g.delays).toHaveLength(20);
    expect(g.delays.every((d) => Math.abs(d - 0.1) < 1e-9)).toBe(true);
    expect(g.durationSec).toBeCloseTo(2, 6);
    expect(g.loopCount).toBe(0);
    const info = gifInfo(g, bytes.length);
    expect(info.video?.codec).toBe("gif");
    expect(frameCountOf(info)).toBe(20);
  });

  it("plays 0 and 1 hundredths as 10, like browsers", () => {
    expect(playedDelay(0)).toBe(0.1);
    expect(playedDelay(1)).toBe(0.1);
    expect(playedDelay(2)).toBe(0.02);
    expect(playedDelay(50)).toBe(0.5);
  });

  it("rejects files that are not GIFs, and truncated ones", () => {
    expect(() => parseGif(new Uint8Array(readFileSync("tests/fixtures/sample.mp4")))).toThrow(
      /not a GIF/,
    );
    expect(() => parseGif(bytes.subarray(0, 40))).toThrow();
  });

  it("makes odd edges even", () => {
    expect(evenSize(301, 201)).toEqual({ width: 300, height: 200 });
    expect(evenSize(1, 1)).toEqual({ width: 2, height: 2 });
  });
});

describe("resize for platform plans", () => {
  const opts = (o: Partial<AspectRatioOptions>) => AspectRatioOptions.parse(o);

  it("scales a 4K vertical source down to the cap and never enlarges", () => {
    const tiktok = framePlatforms.tiktok;
    const cap = capFor(tiktok, "9:16");
    const o = opts({ ratio: "9:16", fit: "crop", maxWidth: cap.width, maxHeight: cap.height });
    expect(outputSize(aspectPlan(o, { width: 2160, height: 3840 }))).toEqual({
      width: 1080,
      height: 1920,
    });
    // A 1080p landscape clip cropped to 9:16 keeps its own 606×1080 pixels.
    expect(outputSize(aspectPlan(o, { width: 1920, height: 1080 }))).toEqual({
      width: 606,
      height: 1080,
    });
    // Bars: the frame is the source's long side, within the cap.
    const pad = opts({ ...o, fit: "pad" });
    expect(outputSize(aspectPlan(pad, { width: 3840, height: 2160 }))).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("knows when a run would change nothing", () => {
    const o = opts({ ratio: "9:16", maxWidth: 1080, maxHeight: 1920, maxSec: 180 });
    expect(aspectNoop(o, { width: 1080, height: 1920 }, 60)).toBe(true);
    expect(aspectNoop(o, { width: 1440, height: 2560 }, 60)).toBe(false);
    expect(aspectNoop(o, { width: 1080, height: 1920 }, 240)).toBe(false);
    expect(aspectPlan(o, { width: 1080, height: 1920 }).end).toBe(180);
  });

  it("turns a platform cap to a second shape", () => {
    expect(capFor(framePlatforms["youtube-shorts"], "1:1")).toEqual({ width: 1080, height: 1080 });
    expect(capFor(framePlatforms.facebook, "4:5")).toEqual({ width: 1440, height: 1800 });
  });
});

describe("conversion planner for legacy sources", () => {
  const info = (container: string, video: string, audio?: string): MediaInfo => ({
    container,
    durationSec: 3,
    sizeBytes: 1,
    video: { codec: video, width: 640, height: 360, fps: 30 },
    audio: audio ? [{ codec: audio, channels: 2, sampleRate: 44100 }] : [],
  });

  it("copies H.264 out of an FLV read by ffmpeg", () => {
    const p = planConversion(info("flv", "h264", "aac"), "a.flv", "mp4");
    expect(p.backend).toBe("ffmpeg-wasm");
    expect(p.copyVideo).toBe(true);
    expect(p.copyAudio).toBe(true);
  });

  it("sends codecs the browser cannot decode to ffmpeg even from native containers", () => {
    expect(planConversion(info("MP4", "unknown", "aac"), "a.3gp", "mp4").backend).toBe(
      "ffmpeg-wasm",
    );
    const ts = planConversion(info("MPEG-TS", "avc", "ac3"), "a.mts", "mp4");
    expect(ts.backend).toBe("ffmpeg-wasm");
    expect(ts.copyVideo).toBe(true);
    expect(ts.copyAudio).toBe(false);
  });

  it("keeps native remux for TS with AAC", () => {
    const p = planConversion(info("MPEG-TS", "avc", "aac"), "a.ts", "mp4");
    expect(p.backend).toBe("webcodecs");
    expect(p.copyVideo && p.copyAudio).toBe(true);
  });
});
