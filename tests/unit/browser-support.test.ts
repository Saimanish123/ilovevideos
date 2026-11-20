import { describe, expect, it } from "vitest";
import { BROWSER_ACTION, blockFromFailure } from "@/components/tool/browser-check";
import { engineNeeds, needIds, provides, verdictFor } from "@/lib/browser-support/needs";
import type { SupportFacts } from "@/lib/browser-support/probe";
import { compressArgs } from "@/tools/engines/compress/ffmpeg";
import { fallbackEngines } from "@/tools/engines/fallbacks";
import { baselineCodecString, needsBaseline } from "@/tools/engines/mediabunny/baseline-avc";
import { engineIds } from "@/tools/registry/schema";

/** Chromium 151 in a worker, as measured 2026-11-19 (src/lib/browser-support/measured). */
const chromium: SupportFacts = {
  scope: "worker",
  webcodecs: true,
  decode: { avc: true, hevc: false, vp8: true, vp9: true, av1: true },
  encode: { avc: "yes", hevc: "no", vp8: "yes", vp9: "yes", av1: "yes" },
  encodeAvcBaseline: "yes",
  audioDecode: { aac: true, opus: true, mp3: true, flac: true, vorbis: false },
  audioEncode: { aac: "yes", opus: "yes", mp3: "no", flac: "no", vorbis: "no" },
  webgl2: true,
  offscreenCanvas2d: true,
  offscreenWebgl2: true,
  opfs: true,
  opfsSyncHandle: true,
  sharedArrayBuffer: true,
  crossOriginIsolated: true,
  wasm: true,
  imageDecoderGif: true,
  offlineAudio: false,
};
/** Playwright WebKit 26.5: High-profile H.264 stalls, Baseline works, no ImageDecoder, no OPFS. */
const webkit: SupportFacts = {
  ...chromium,
  decode: { ...chromium.decode, hevc: true },
  encode: { ...chromium.encode, avc: "config", hevc: "yes" },
  imageDecoderGif: false,
  opfs: false,
  opfsSyncHandle: false,
};
/** No WebCodecs at all (Firefox for Android, documented): only the converter. */
const noWebCodecs: SupportFacts = {
  ...chromium,
  webcodecs: false,
  decode: { avc: false, hevc: false, vp8: false, vp9: false, av1: false },
  encode: { avc: "no", hevc: "no", vp8: "no", vp9: "no", av1: "no" },
  encodeAvcBaseline: "no",
  audioDecode: { aac: false, opus: false, mp3: false, flac: false, vorbis: false },
  audioEncode: { aac: "no", opus: "no", mp3: "no", flac: "no", vorbis: "no" },
  imageDecoderGif: false,
};

describe("engine needs", () => {
  it("lists every engine a page uses with known needs", () => {
    for (const [engine, n] of Object.entries(engineNeeds)) {
      expect(engineIds).toContain(engine);
      for (const need of n?.needs ?? []) expect(needIds).toContain(need);
    }
  });

  it("marks an engine as having a slower path exactly when it has a fallback runner", () => {
    for (const [engine, n] of Object.entries(engineNeeds))
      expect(n?.fallback === true, engine).toBe(fallbackEngines.has(engine as never));
  });

  it("counts Baseline H.264 where High stalls", () => {
    expect(provides("h264-encode", webkit)).toBe(true);
    expect(provides("h264-encode", { ...webkit, encodeAvcBaseline: "config" })).toBe(false);
    expect(provides("gif-decode", webkit)).toBe(false);
  });

  it("works, falls back or says so", () => {
    const compress = engineNeeds.compress;
    const blur = engineNeeds["blur-region"];
    const trim = engineNeeds.trim;
    if (!compress || !blur || !trim) throw new Error("missing needs");
    expect(verdictFor(compress, chromium).verdict).toBe("works");
    expect(verdictFor(compress, webkit).verdict).toBe("works");
    expect(verdictFor(compress, noWebCodecs)).toEqual({
      verdict: "slower path",
      missing: ["video-decode", "h264-encode", "aac-encode"],
    });
    expect(verdictFor(blur, noWebCodecs).verdict).toBe("says so");
    expect(verdictFor(trim, noWebCodecs).verdict).toBe("works");
    expect(verdictFor(compress, { ...noWebCodecs, crossOriginIsolated: false }).verdict).toBe(
      "says so",
    );
  });
});

describe("the check before the user starts", () => {
  const failure = {
    code: "unsupported-output" as const,
    message: "This browser cannot encode H.264 video.",
    hint: "Try desktop Chrome or Edge.",
  };
  it("is silent when the job can run, or when the slower path takes it", () => {
    expect(blockFromFailure("blur-region", undefined)).toBeUndefined();
    expect(blockFromFailure("compress", failure, () => true)).toBeUndefined();
  });
  it("says the cause and the action, in place of the button where no option helps", () => {
    expect(blockFromFailure("blur-region", failure, () => false)).toEqual({
      reason: "This browser cannot encode H.264 video. Try desktop Chrome or Edge.",
      fixable: false,
    });
    // Another output format may be one this browser writes, unless the page locks it (a pair).
    expect(blockFromFailure("convert-video", failure, () => false)?.fixable).toBeUndefined();
    expect(blockFromFailure("codec", failure, () => false, true)?.fixable).toBe(false);
  });
  it("ends every reason with what to do next", () => {
    expect(
      blockFromFailure(
        "blur-region",
        { code: "unsupported-output", message: "No encoder." },
        () => false,
      )?.reason,
    ).toBe(`No encoder. ${BROWSER_ACTION}`);
  });
});

describe("Baseline H.264 for encoders that stall on High", () => {
  it("keeps the level and changes the profile", () => {
    expect(baselineCodecString("avc1.64001f")).toBe("avc1.42e01f");
    expect(baselineCodecString("avc1.640028")).toBe("avc1.42e028");
    expect(baselineCodecString("avc1.4d0033")).toBe("avc1.42e033");
    expect(baselineCodecString("bogus")).toBe("avc1.42e01f");
  });
  it("only takes over High and Main", () => {
    expect(needsBaseline("avc1.64001f")).toBe(true);
    expect(needsBaseline("avc1.4d401f")).toBe(true);
    expect(needsBaseline("avc1.42e01e")).toBe(false);
    expect(needsBaseline("vp09.00.31.08")).toBe(false);
  });
});

describe("compress through ffmpeg.wasm", () => {
  const info = {
    container: "MP4",
    durationSec: 10,
    sizeBytes: 12e6,
    video: { codec: "avc", width: 1920, height: 1080, fps: 30 },
    audio: [{ codec: "aac", channels: 2, sampleRate: 48_000 }],
  };
  it("writes the planned bitrate and size, with sound", () => {
    expect(
      compressArgs(info, { videoBitrate: 2_000_000, audioBitrate: 128_000, height: 720 }),
    ).toEqual([
      "-vf",
      "scale=1280:720",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      "2000k",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
    ]);
  });
  it("keeps the frame when nothing is capped, and writes no sound for a silent file", () => {
    const args = compressArgs(
      { ...info, audio: [] },
      { videoBitrate: 1_000_000, audioBitrate: 0, height: "original" },
    );
    expect(args).not.toContain("-vf");
    expect(args).toContain("-an");
  });
});
