import { describe, expect, it } from "vitest";
import { audioSourceForFile, normalizeAudioCodec } from "@/content/formats/audio";
import type { MediaInfo } from "@/tools/engines/types";
import {
  ffmpegAudioArgs,
  flacBitDepth,
  outputMeta,
  planExtraction,
} from "@/tools/engines/video-to-audio/plan";

/** Units carry a non-breaking space; compare with plain spaces. */
const sp = (s: string) => s.replace(/\u00a0/g, " ");

/** An audio-only file as the inspectors report it. */
const audio = (
  container: string,
  codec: string,
  extra: Partial<NonNullable<MediaInfo["audio"]>[number]> = {},
): MediaInfo => ({
  container,
  durationSec: 4,
  sizeBytes: 1000,
  audio: [{ codec, channels: 2, sampleRate: 44_100, ...extra }],
});

describe("planExtraction for audio files", () => {
  it("reads MP3, WAVE, Ogg, FLAC and ADTS natively", () => {
    expect(planExtraction(audio("MP3", "mp3"), "a.mp3", "wav", 192).backend).toBe("webcodecs");
    expect(planExtraction(audio("WAVE", "pcm-s16"), "a.wav", "opus", 192).backend).toBe(
      "webcodecs",
    );
    expect(planExtraction(audio("Ogg", "opus"), "a.ogg", "opus", 192)).toMatchObject({
      backend: "webcodecs",
      copy: true,
    });
    expect(planExtraction(audio("FLAC", "flac"), "a.flac", "opus", 192).backend).toBe("webcodecs");
    expect(planExtraction(audio("ADTS", "aac"), "a.aac", "m4a", 192)).toMatchObject({
      backend: "webcodecs",
      copy: true,
    });
  });
  it("sends MP3, Vorbis, FLAC and AIFF encodes to ffmpeg", () => {
    expect(planExtraction(audio("WAVE", "pcm-s16"), "a.wav", "mp3", 192)).toMatchObject({
      backend: "ffmpeg-wasm",
      codec: "libmp3lame",
    });
    expect(planExtraction(audio("MP3", "mp3"), "a.mp3", "ogg", 192).codec).toBe("libvorbis");
    expect(planExtraction(audio("WAVE", "pcm-s16"), "a.wav", "flac", 192).codec).toBe("flac");
    expect(planExtraction(audio("WAVE", "pcm-s16"), "a.wav", "aiff", 192)).toMatchObject({
      backend: "ffmpeg-wasm",
      codec: "pcm_s16be",
    });
  });
  it("reads WMA and AIFF with ffmpeg, and codecs mediabunny cannot name", () => {
    expect(planExtraction(audio("asf", "wmav2"), "a.wma", "mp3", 192).backend).toBe("ffmpeg-wasm");
    expect(planExtraction(audio("aiff", "pcm_s16be"), "a.aiff", "wav", 192)).toMatchObject({
      backend: "ffmpeg-wasm",
      copy: false,
      codec: "pcm_s16le",
    });
    // Apple Lossless in M4A: mediabunny reports no codec, so ffmpeg decodes it.
    expect(planExtraction(audio("MP4", "unknown"), "a.m4a", "wav", 192).backend).toBe(
      "ffmpeg-wasm",
    );
  });
  it("keeps 24-bit sources at 24 bits in WAV and AIFF", () => {
    const aiff24 = planExtraction(audio("aiff", "pcm_s24be"), "a.aiff", "wav", 192);
    expect(aiff24.codec).toBe("pcm_s24le");
    expect(ffmpegAudioArgs(aiff24)).toContain("pcm_s24le");
    const flac24 = planExtraction(audio("FLAC", "flac"), "a.flac", "wav", 192, { bitDepth: 24 });
    // Lossless to PCM stays native: the runner scales integer sources so every sample stays exact
    // (mediabunny/audio-window; checked bit for bit in media-gaps.test.ts and audio-tools.spec.ts).
    expect(flac24).toMatchObject({ backend: "webcodecs", codec: "pcm-s24" });
    expect(sp(outputMeta(flac24, { sampleRate: 96_000, channels: 2 }))).toBe(
      "PCM 24-bit · 96 kHz · stereo",
    );
    const flac16 = planExtraction(audio("FLAC", "flac"), "a.flac", "wav", 192, { bitDepth: 16 });
    expect(flac16).toMatchObject({ backend: "webcodecs", codec: "pcm-s16" });
    // Lossy sources stay native: the decoded sound has no exact samples to preserve.
    expect(planExtraction(audio("MP3", "mp3"), "a.mp3", "wav", 192).backend).toBe("webcodecs");
    expect(planExtraction(audio("WAVE", "pcm-s24"), "a.wav", "aiff", 192).codec).toBe("pcm_s24be");
  });
  it("copies 24-bit and float PCM into WAV untouched", () => {
    expect(planExtraction(audio("WAVE", "pcm-s24"), "a.wav", "wav", 192).copy).toBe(true);
    expect(planExtraction(audio("WAVE", "pcm-f32"), "a.wav", "wav", 192).copy).toBe(true);
  });
  it("writes Opus through the Ogg muxer and Vorbis only through ffmpeg", () => {
    const opus = planExtraction(audio("MP3", "mp3"), "a.mp3", "opus", 128);
    expect(opus).toMatchObject({ backend: "webcodecs", codec: "opus", bitrateKbps: 128 });
    expect(opus.target.muxer).toBe("ogg");
    expect(planExtraction(audio("Ogg", "opus"), "a.ogg", "ogg", 128)).toMatchObject({
      backend: "ffmpeg-wasm",
      copy: false,
    });
  });
});

describe("outputMeta", () => {
  it("names the codec, bitrate, rate and channels", () => {
    const p = planExtraction(audio("WAVE", "pcm-s16"), "a.wav", "mp3", 192);
    expect(sp(outputMeta(p, { sampleRate: 44_100, channels: 2 }))).toBe(
      "MP3 · 192 kbps · 44.1 kHz · stereo",
    );
    const copy = planExtraction(audio("ADTS", "aac"), "a.aac", "m4a", 192);
    expect(sp(outputMeta(copy, { sampleRate: 44_100, channels: 1, bitrate: 128_000 }))).toBe(
      "AAC · 128 kbps · 44.1 kHz · mono",
    );
  });
});

describe("the plan states what the encoder writes", () => {
  it("MP3 from 96 kHz is written at 48 kHz, and the command asks for it", () => {
    const p = planExtraction(audio("WAVE", "pcm-s16", { sampleRate: 96_000 }), "a.wav", "mp3", 192);
    expect(p).toMatchObject({ backend: "ffmpeg-wasm", sampleRate: 48_000, bitrateKbps: 192 });
    expect(ffmpegAudioArgs(p).join(" ")).toContain("-ar 48000");
    expect(sp(outputMeta(p, { sampleRate: 96_000, channels: 2 }))).toBe(
      "MP3 · 192 kbps · 48 kHz · stereo",
    );
  });

  it("MP3 from 5.1 is stereo, mixed by the scaled BS.775 matrix", () => {
    const p = planExtraction(audio("WAVE", "pcm-s16", { channels: 6 }), "a.wav", "mp3", 192);
    expect(p).toMatchObject({ channels: 2, sourceChannels: 6 });
    const args = ffmpegAudioArgs(p);
    expect(args).not.toContain("-ac");
    expect(args[args.indexOf("-af") + 1]).toMatch(/^pan=stereo\|c0=0\.414214\*c0\+0\.292893\*c2/);
    expect(sp(outputMeta(p, { sampleRate: 44_100, channels: 6 }))).toMatch(
      /^MP3 · 192 kbps · 44\.1 kHz · stereo, mixed down from 6 channels by ITU-R BS\.775/,
    );
  });

  it("MP3 bitrate stops at 160 kbps up to 24 kHz and 64 kbps up to 12 kHz", () => {
    const at = (rate: number, kbps: 128 | 192 | 320) =>
      planExtraction(audio("WAVE", "pcm-s16", { sampleRate: rate }), "a.wav", "mp3", kbps)
        .bitrateKbps;
    expect(at(22_050, 192)).toBe(160);
    expect(at(22_050, 128)).toBe(128);
    expect(at(16_000, 320)).toBe(160);
    expect(at(11_025, 192)).toBe(64);
    expect(at(32_000, 320)).toBe(320);
    expect(at(44_100, 320)).toBe(320);
    const p = planExtraction(audio("WAVE", "pcm-s16", { sampleRate: 22_050 }), "a.wav", "mp3", 192);
    expect(sp(outputMeta(p, { sampleRate: 22_050, channels: 2 }))).toBe(
      "MP3 · 160 kbps · 22.05 kHz · stereo",
    );
    expect(p.sampleRate).toBeUndefined();
  });

  it("an MP3 copy is never touched by the limits", () => {
    const p = planExtraction(audio("MP3", "mp3"), "a.mp3", "mp3", 320);
    expect(p).toMatchObject({ copy: true, channels: undefined, sampleRate: undefined });
  });

  it("Opus from 5.1 is mixed to stereo natively instead of failing in the encoder", () => {
    const p = planExtraction(audio("WAVE", "pcm-s16", { channels: 6 }), "a.wav", "opus", 192);
    expect(p).toMatchObject({ backend: "webcodecs", codec: "opus", channels: 2 });
    const stereo = planExtraction(audio("WAVE", "pcm-s16"), "a.wav", "opus", 192);
    expect(stereo.channels).toBeUndefined();
  });

  it("OGG Vorbis above 48 kHz is written at 48 kHz, and says so", () => {
    const p = planExtraction(audio("WAVE", "pcm-s16", { sampleRate: 96_000 }), "a.wav", "ogg", 192);
    expect(p).toMatchObject({ backend: "ffmpeg-wasm", sampleRate: 48_000 });
    expect(ffmpegAudioArgs(p).join(" ")).toContain("-ar 48000");
    const cd = planExtraction(audio("WAVE", "pcm-s16"), "a.wav", "ogg", 192);
    expect(cd.sampleRate).toBeUndefined();
  });

  it("FLAC, M4A and WAV keep 5.1 and high rates; OGG keeps 5.1", () => {
    const ogg = planExtraction(audio("WAVE", "pcm-s16", { channels: 6 }), "a.wav", "ogg", 192);
    expect(ogg.channels).toBeUndefined();
    for (const to of ["flac", "m4a", "wav"] as const) {
      const p = planExtraction(
        audio("WAVE", "pcm-s16", { channels: 6, sampleRate: 96_000 }),
        "a.wav",
        to,
        192,
      );
      expect(p.channels).toBeUndefined();
      expect(p.sampleRate).toBeUndefined();
    }
  });

  it("a float source to FLAC or 24-bit PCM says it keeps 24-bit precision, not every sample", () => {
    const flac = planExtraction(audio("WAVE", "pcm-f32"), "a.wav", "flac", 192);
    expect(flac.quantisedTo).toBe(24);
    expect(sp(outputMeta(flac, { sampleRate: 48_000, channels: 2 }))).toBe(
      "FLAC 24-bit · 48 kHz · stereo · float samples kept to 24-bit precision",
    );
    expect(planExtraction(audio("WAVE", "pcm-f32"), "a.wav", "aiff", 192).quantisedTo).toBe(24);
    expect(planExtraction(audio("WAVE", "pcm-s24"), "a.wav", "flac", 192).quantisedTo).toBe(
      undefined,
    );
    expect(planExtraction(audio("WAVE", "pcm-f32"), "a.wav", "wav", 192)).toMatchObject({
      copy: true,
      quantisedTo: undefined,
    });
  });
});

describe("flacBitDepth", () => {
  it("reads bits per sample from STREAMINFO", () => {
    // fLaC, STREAMINFO header, then a 96 kHz mono 24-bit block (bytes from ffmpeg's encoder).
    const head = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22, 0x20, 0x00, 0x20, 0x00, 0x00, 0x06, 0x41,
      0x00, 0x08, 0x9e, 0x17, 0x70, 0x01, 0x70, 0x01, 0x77,
    ]);
    expect(flacBitDepth(head)).toBe(24);
  });
  it("is undefined for anything that is not FLAC", () => {
    expect(flacBitDepth(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe(undefined);
  });
});

describe("audio sources", () => {
  it("maps extensions to the engine that reads them", () => {
    expect(audioSourceForFile("song.WMA")?.read).toBe("ffmpeg");
    expect(audioSourceForFile("take.aif")?.id).toBe("aiff");
    expect(audioSourceForFile("note.opus")?.read).toBe("native");
  });
  it("normalises ffmpeg PCM names", () => {
    expect(normalizeAudioCodec("pcm_s24le")).toBe("pcm-s24");
    expect(normalizeAudioCodec("pcm_s16be")).toBe("pcm-s16be");
    expect(normalizeAudioCodec("pcm_f32le")).toBe("pcm-f32");
  });
});
