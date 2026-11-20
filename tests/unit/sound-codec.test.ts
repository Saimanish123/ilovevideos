import { afterEach, describe, expect, it, vi } from "vitest";
import { geometryEstimate } from "@/components/tool/crop/estimate";
import { geometryCommand } from "@/tools/engines/crop/math";
import { encodedSoundWords } from "@/tools/engines/crop/plan";
import { soundOutputFacts, soundSummary } from "@/tools/engines/sound/summary";
import { soundTarget } from "@/tools/engines/sound/target";
import {
  ASSUMED_ENCODERS,
  encodedSoundBps,
  ffmpegSoundEncoder,
  onSoundEncoders,
  resetSoundEncodersForTest,
  soundCodecName,
  soundEncoders,
  soundEncodersNow,
  videoSoundCodec,
  videoSoundCodecs,
  writtenSoundCodec,
} from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { lineSoundCodec, pictureEstimate, soundLine } from "@/tools/engines/video-filter/plan";
import { watermarkCommand } from "@/tools/engines/watermark/options";

/** macOS, Windows, Android: the platform AAC encoder is there. */
const withAac = { aac: true, opus: true };
/** Chromium on Linux (GitHub's runner): no WebCodecs AAC encoder. */
const noAac = { aac: false, opus: true };

const video = (
  container: string,
  audioCodec = "opus",
  over: Partial<MediaInfo> = {},
): MediaInfo => ({
  container,
  durationSec: 10,
  sizeBytes: 1e6,
  video: { codec: container === "webm" ? "vp9" : "avc", width: 640, height: 360, fps: 30 },
  audio: [{ codec: audioCodec, channels: 2, sampleRate: 48_000, bitrate: 128_000 }],
  ...over,
});

describe("video sound codec rule", () => {
  it("is AAC where it encodes, else Opus in MP4 and MKV and 16-bit PCM in MOV; WebM is Opus", () => {
    expect(videoSoundCodec("mp4", withAac)).toBe("aac");
    expect(videoSoundCodec("mov", withAac)).toBe("aac");
    expect(videoSoundCodec("mkv", withAac)).toBe("aac");
    expect(videoSoundCodec("webm", withAac)).toBe("opus");
    expect(videoSoundCodec("mp4", noAac)).toBe("opus");
    expect(videoSoundCodec("mkv", noAac)).toBe("opus");
    expect(videoSoundCodec("mov", noAac)).toBe("pcm-s16");
    expect(videoSoundCodec("webm", noAac)).toBe("opus");
    // Nothing lossy: MP4 has no codec, MOV still has PCM.
    expect(videoSoundCodec("mp4", { aac: false, opus: false })).toBeUndefined();
    expect(videoSoundCodec("mov", { aac: false, opus: false })).toBe("pcm-s16");
  });

  it("is the order the sound tools try", () => {
    for (const [c, name] of [
      ["mp4", "a.mp4"],
      ["mov", "a.mov"],
      ["webm", "a.webm"],
    ] as const) {
      const t = soundTarget(video(c, "aac"), name);
      expect(t.kind === "video" && t.codecs).toEqual(videoSoundCodecs(c));
    }
  });

  it("names and ffmpeg encoders", () => {
    expect(soundCodecName("aac")).toBe("AAC");
    expect(soundCodecName(undefined)).toBe("AAC");
    expect(soundCodecName("opus")).toBe("Opus");
    expect(soundCodecName("pcm-s16")).toBe("16‑bit PCM");
    expect(ffmpegSoundEncoder("aac")).toBe("aac");
    expect(ffmpegSoundEncoder("opus")).toBe("libopus");
    expect(ffmpegSoundEncoder("pcm-s16")).toBe("pcm_s16le");
  });
});

describe("encoder probe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSoundEncodersForTest();
  });

  const stub = (aac: boolean) => {
    const isConfigSupported = vi.fn(async (c: AudioEncoderConfig) => ({
      supported: c.codec.startsWith("mp4a") ? aac : true,
      config: c,
    }));
    vi.stubGlobal("AudioEncoder", { isConfigSupported });
    return isConfigSupported;
  };

  it("assumes AAC until it answers, then holds the answer and tells listeners once", async () => {
    const probe = stub(false);
    expect(soundEncodersNow()).toBe(ASSUMED_ENCODERS);
    const heard = vi.fn();
    const off = onSoundEncoders(heard);
    expect(await soundEncoders()).toEqual(noAac);
    expect(await soundEncoders()).toEqual(noAac);
    expect(soundEncodersNow()).toEqual(noAac);
    expect(heard).toHaveBeenCalledTimes(1);
    // Asked once per codec, with the configuration the engines fall back to.
    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe.mock.calls[0]?.[0]).toMatchObject({
      codec: "mp4a.40.2",
      sampleRate: 48_000,
      numberOfChannels: 2,
    });
    off();
  });

  it("reads AAC where the browser has it", async () => {
    stub(true);
    expect(await soundEncoders()).toEqual(withAac);
  });

  it("has nothing without WebCodecs, and survives a throwing probe", async () => {
    vi.stubGlobal("AudioEncoder", undefined);
    expect(await soundEncoders()).toEqual({ aac: false, opus: false });
    resetSoundEncodersForTest();
    vi.stubGlobal("AudioEncoder", {
      isConfigSupported: async () => {
        throw new TypeError("bad config");
      },
    });
    expect(await soundEncoders()).toEqual({ aac: false, opus: false });
  });
});

describe("sound tools' lines follow the codec", () => {
  it("are unchanged where AAC encodes", () => {
    expect(soundSummary(video("mp4"), "a.mp4", withAac)).toBe(
      "The picture is copied as it is; the sound is encoded once to AAC at 192\u00a0kbps.",
    );
    expect(soundSummary(video("webm"), "a.webm", withAac)).toBe(
      "The picture is copied as it is; the sound is encoded once to Opus at 192\u00a0kbps.",
    );
    expect(soundOutputFacts(video("mp4"), "a.mp4", withAac)).toEqual([
      "picture copied",
      "AAC 192\u00a0kbps",
    ]);
    expect(soundOutputFacts(video("mov"), "a.mov", withAac)).toEqual([
      "picture copied",
      "AAC 192\u00a0kbps",
    ]);
  });

  it("say Opus in MP4 and 16-bit PCM in MOV without AAC", () => {
    expect(soundSummary(video("mp4"), "a.mp4", noAac)).toBe(
      "The picture is copied as it is; the sound is encoded once to Opus at 192\u00a0kbps.",
    );
    expect(soundSummary(video("mov"), "a.mov", noAac)).toBe(
      "The picture is copied as it is; the sound is written once as 16‑bit PCM.",
    );
    expect(soundOutputFacts(video("mp4"), "a.mp4", noAac)).toEqual([
      "picture copied",
      "Opus 192\u00a0kbps",
    ]);
    expect(soundOutputFacts(video("mov"), "a.mov", noAac)).toEqual([
      "picture copied",
      "PCM 16‑bit",
    ]);
  });

  it("leave audio files alone", () => {
    const wav = video("wave", "pcm-s16", { video: undefined });
    expect(soundSummary(wav, "a.wav", noAac)).toBe(soundSummary(wav, "a.wav", withAac));
  });
});

describe("picture tools' lines follow the codec", () => {
  it("soundLine and its codec", () => {
    expect(soundLine("encode")).toBe("The sound is encoded to AAC.");
    expect(soundLine("encode", true)).toBe(
      "The sound fades with the picture and is encoded to AAC.",
    );
    expect(soundLine("copy", false, "opus")).toBe("The sound is copied as it is.");
    expect(soundLine("encode", false, "opus")).toBe("The sound is encoded to Opus.");
    expect(soundLine("encode", true, "pcm-s16")).toBe(
      "The sound fades with the picture and is written as 16‑bit PCM.",
    );
    expect(writtenSoundCodec("mp4", withAac)).toBe("aac");
    expect(writtenSoundCodec("mp4", noAac)).toBe("opus");
    expect(writtenSoundCodec("webm", withAac)).toBe("opus");
    // No encoder at all keeps AAC, which then fails as it did before.
    expect(writtenSoundCodec("mp4", { aac: false, opus: false })).toBe("aac");
  });

  it("the ffmpeg.wasm path always writes AAC", () => {
    const avi = video("avi", "mp3");
    expect(lineSoundCodec(avi, "mp4", noAac)).toBe("aac");
    expect(lineSoundCodec(video("mp4"), "mp4", noAac)).toBe("opus");
  });

  it("composite and geometry words", () => {
    expect(encodedSoundWords("mp4", withAac)).toBe("sound in AAC");
    expect(encodedSoundWords("mp4", noAac)).toBe("sound in Opus");
    expect(encodedSoundWords("mov", noAac)).toBe("sound in 16‑bit PCM");
    const size = { width: 640, height: 360 };
    expect(geometryEstimate(video("mp4"), size, withAac).audio).toBe(
      "The sound is encoded to AAC.",
    );
    expect(geometryEstimate(video("mp4"), size, noAac).audio).toBe("The sound is encoded to Opus.");
    // AAC is copied whole; a cut clip without an AAC encoder re-encodes it.
    const aac = video("mp4", "aac");
    expect(geometryEstimate(aac, size, withAac, true).audio).toBe("The sound is copied as it is.");
    expect(geometryEstimate(aac, size, noAac).audio).toBe("The sound is copied as it is.");
    expect(geometryEstimate(aac, size, noAac, true).audio).toBe("The sound is encoded to Opus.");
  });
});

describe("one fallback, sizes and commands", () => {
  const aacNoOpus = { aac: true, opus: false };
  const none = { aac: false, opus: false };

  it("a WebM line never says AAC, whatever the browser lacks", () => {
    expect(writtenSoundCodec("webm", aacNoOpus)).toBe("opus");
    expect(writtenSoundCodec("webm", none)).toBe("opus");
    expect(writtenSoundCodec("mp4", none)).toBe("aac");
    expect(soundSummary(video("webm"), "a.webm", aacNoOpus)).toContain("encoded once to Opus");
    expect(soundSummary(video("webm"), "a.webm", none)).toContain("encoded once to Opus");
  });

  it("16-bit PCM counts at rate × channels × 16", () => {
    expect(encodedSoundBps("pcm-s16", 128_000, { sampleRate: 48_000, channels: 2 })).toBe(
      1_536_000,
    );
    expect(encodedSoundBps("pcm-s16", 128_000, undefined)).toBe(1_536_000);
    expect(encodedSoundBps("opus", 128_000, { sampleRate: 48_000, channels: 2 })).toBe(128_000);
    const mov = video("mov", "pcm-s16be");
    const size = { width: 640, height: 360 };
    const aac = pictureEstimate(mov, size, withAac).bytes;
    const pcm = pictureEstimate(mov, size, noAac).bytes;
    // 10 s of 1,536 kb/s instead of 128 kb/s: 1.76 MB more.
    expect(pcm - aac).toBe(((1_536_000 - 128_000) * 10) / 8);
    const g = geometryEstimate(mov, size, noAac);
    expect(g.audio).toBe("The sound is written as 16\u2011bit PCM.");
    expect(g.bytes - geometryEstimate(mov, size, withAac).bytes).toBe(
      ((1_536_000 - 128_000) * 10) / 8,
    );
  });

  it("the recorded ffmpeg command names the codec written; AAC's is unchanged", () => {
    expect(geometryCommand("a.mp4", "b.mp4", "crop=2:2", 900, false)).toContain(
      "-c:a aac -b:a 128k",
    );
    expect(geometryCommand("a.mp4", "b.mp4", "crop=2:2", 900, false, undefined, "opus")).toContain(
      "-c:a libopus -b:a 128k",
    );
    expect(
      geometryCommand("a.mov", "b.mov", "crop=2:2", 900, false, undefined, "pcm-s16"),
    ).toContain("-c:a pcm_s16le -movflags");
    expect(watermarkCommand("a.mp4", "m.png", "b.mp4", "x", 900, false)).toContain("-c:a aac ");
    expect(watermarkCommand("a.mp4", "m.png", "b.mp4", "x", 900, false, "opus")).toContain(
      "-c:a libopus ",
    );
  });
});
