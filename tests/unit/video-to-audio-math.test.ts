import { describe, expect, it } from "vitest";
import { audioFormatById, normalizeAudioCodec } from "@/content/formats/audio";
import type { MediaInfo } from "@/tools/engines/types";
import {
  audioOutputName,
  effectiveRange,
  estimateAudioBytes,
} from "@/tools/engines/video-to-audio/math";
import { ffmpegAudioArgs, planExtraction } from "@/tools/engines/video-to-audio/plan";

const mp3 = audioFormatById.get("mp3");
const wav = audioFormatById.get("wav");
const flac = audioFormatById.get("flac");
const m4a = audioFormatById.get("m4a");
if (!mp3 || !wav || !flac || !m4a) throw new Error("formats missing");

const track = { channels: 2, sampleRate: 48_000, bitrate: 96_000 };

describe("estimateAudioBytes", () => {
  it("uses bitrate × duration for lossy re-encodes", () => {
    expect(estimateAudioBytes(mp3, 60, track, { copy: false, bitrateKbps: 192 })).toBe(
      (192_000 * 60) / 8,
    );
  });
  it("uses the measured source bitrate for copies and nothing when unknown", () => {
    expect(estimateAudioBytes(m4a, 10, track, { copy: true })).toBe((96_000 * 10) / 8);
    expect(estimateAudioBytes(m4a, 10, { ...track, bitrate: undefined }, { copy: true })).toBe(
      undefined,
    );
  });
  it("computes PCM for WAV and about 58% of PCM for FLAC", () => {
    const pcm = 48_000 * 2 * 2 * 60;
    expect(estimateAudioBytes(wav, 60, track, { copy: false })).toBe(pcm);
    expect(estimateAudioBytes(flac, 60, track, { copy: false })).toBeCloseTo(pcm * 0.58);
  });
  it("returns undefined without a track or duration", () => {
    expect(estimateAudioBytes(mp3, 0, track, { copy: false, bitrateKbps: 192 })).toBe(undefined);
    expect(estimateAudioBytes(mp3, 10, undefined, { copy: false, bitrateKbps: 192 })).toBe(
      undefined,
    );
  });
});

describe("audioOutputName", () => {
  it("swaps the extension and keeps dots in the base name", () => {
    expect(audioOutputName("holiday.2024.mp4", "mp3")).toBe("holiday.2024.mp3");
  });
  it("appends the range when only a part is extracted", () => {
    expect(audioOutputName("talk.mov", "m4a", { start: 5, end: 12.5 })).toBe("talk-5-0s-12-5s.m4a");
  });
});

describe("effectiveRange", () => {
  it("is undefined when disabled or when it spans the whole file", () => {
    expect(effectiveRange(30, { range: false, start: 3, end: 9 })).toBe(undefined);
    expect(effectiveRange(30, { range: true, start: 0, end: 30 })).toBe(undefined);
  });
  it("clamps to the media duration", () => {
    expect(effectiveRange(30, { range: true, start: -2, end: 45 })).toBe(undefined);
    expect(effectiveRange(30, { range: true, start: 4, end: 45 })).toEqual({ start: 4, end: 30 });
    expect(effectiveRange(30, { range: true, start: 4, end: 9 })).toEqual({ start: 4, end: 9 });
  });
});

const info = (codec: string | undefined, container = "MP4"): MediaInfo => ({
  container,
  durationSec: 3,
  sizeBytes: 1000,
  video: { codec: "avc", width: 640, height: 360, fps: 30 },
  audio: codec ? [{ codec, channels: 2, sampleRate: 48_000 }] : [],
});

describe("planExtraction", () => {
  it("copies AAC into M4A natively", () => {
    const p = planExtraction(info("aac"), "a.mp4", "m4a", 192);
    expect(p).toMatchObject({ backend: "webcodecs", copy: true, codec: "aac", hasAudio: true });
    expect(p.bitrateKbps).toBe(undefined);
  });
  it("sends MP3 re-encodes to ffmpeg with libmp3lame at the chosen bitrate", () => {
    const p = planExtraction(info("aac"), "a.mp4", "mp3", 320);
    expect(p).toMatchObject({ backend: "ffmpeg-wasm", copy: false, codec: "libmp3lame" });
    expect(ffmpegAudioArgs(p)).toEqual([
      "-vn",
      "-map",
      "0:a:0",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "320k",
      "-map_metadata",
      "0",
      "-f",
      "mp3",
    ]);
  });
  it("copies an MP3 track into MP3 without re-encoding", () => {
    const p = planExtraction(info("mp3", "Matroska"), "a.mkv", "mp3", 192);
    expect(p).toMatchObject({ backend: "webcodecs", copy: true });
  });
  it("writes WAV as PCM natively and ignores the bitrate", () => {
    const p = planExtraction(info("aac"), "a.mp4", "wav", 128);
    expect(p).toMatchObject({ backend: "webcodecs", copy: false, codec: "pcm-s16" });
    expect(p.bitrateKbps).toBe(undefined);
  });
  it("uses ffmpeg for sources the native reader cannot open, copying when the codec fits", () => {
    const p = planExtraction(info("mp3", "avi"), "a.avi", "mp3", 192);
    expect(p).toMatchObject({ backend: "ffmpeg-wasm", copy: true, codec: "copy" });
    expect(ffmpegAudioArgs(p, { start: 1, end: 2.5 }).slice(0, 4)).toEqual([
      "-ss",
      "1.000",
      "-to",
      "2.500",
    ]);
  });
  it("reports a file without audio", () => {
    expect(planExtraction(info(undefined), "a.mp4", "mp3", 192).hasAudio).toBe(false);
  });
});

describe("normalizeAudioCodec", () => {
  it("maps ffmpeg names onto mediabunny ids", () => {
    expect(normalizeAudioCodec("pcm_s16le")).toBe("pcm-s16");
    expect(normalizeAudioCodec("mp3float")).toBe("mp3");
    expect(normalizeAudioCodec("unknown")).toBe(undefined);
  });
});
