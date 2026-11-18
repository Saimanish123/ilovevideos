import { openAsBlob } from "node:fs";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { describe, expect, it } from "vitest";
import { codecName } from "@/tools/engines/convert-video/plan";
import { encodeRequest } from "@/tools/engines/encode-request";
import { cannotEncodeError } from "@/tools/engines/errors";
import {
  containerVideoCodec,
  isoVideoCodec,
  matroskaVideoCodec,
  theoraHeader,
} from "@/tools/engines/inspect/codec-id";
import { infoReport, infoSections, subtitleFormat } from "@/tools/engines/inspect/report";
import { subtitleTracksOf, withSubtitleTracks } from "@/tools/engines/inspect/subtitles";
import { acceptedFormatsHint, unreadableFileError } from "@/tools/engines/inspect/unreadable";
import {
  crc32Mpeg,
  privateAudioPatch,
  sniffAudioStreamType,
  transportStreamSource,
} from "@/tools/engines/mediabunny/ts-stream-types";
import type { MediaInfo } from "@/tools/engines/types";

/**
 * What the inspector reads (QA 2026-10-08): sound filed as private data in 192-byte M2TS, the real
 * length of an MPEG-TS that starts at 1.4 s, codec names mediabunny leaves blank, why a file cannot
 * be read, and subtitle tracks for video info. Fixtures from scripts/make-fixtures.sh; expected values
 * from ffprobe 9 on the same files.
 */
const F = "tests/fixtures/";
const blob = async (name: string) => {
  const b = await openAsBlob(F + name);
  return Object.assign(b, { name });
};

describe("MPEG-TS sound filed as private data (192-byte M2TS)", () => {
  it("mediabunny alone misses the AAC; through the source it is there and decodes as ffprobe reads it", async () => {
    const file = await blob("sample-aac192.m2ts");
    const plain = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    expect((await plain.getAudioTracks()).length).toBe(0); // flags when mediabunny fixes it upstream
    const input = new Input({ source: transportStreamSource(file), formats: ALL_FORMATS });
    const audio = await input.getAudioTracks();
    expect(audio.map((a) => a.codec)).toEqual(["aac"]);
    expect(audio[0]?.sampleRate).toBe(48_000);
    expect(audio[0]?.numberOfChannels).toBe(1);
    // ffprobe: 2.0 s of AAC, 94 frames of 1024 samples.
    expect(await audio[0]?.computeDuration()).toBeGreaterThan(1.9);
    expect((await input.getVideoTracks()).map((v) => v.codec)).toEqual(["avc"]);
  });

  it("patches only the stream type and keeps the table's CRC valid", async () => {
    const file = await blob("sample-aac192.m2ts");
    const head = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
    const patch = privateAudioPatch(head);
    expect(patch?.changes).toEqual([{ pid: 0x1100, streamType: 0x0f }]);
    const original = head.subarray(patch?.at ?? 0, (patch?.at ?? 0) + 188);
    const changed = [...(patch?.packet ?? [])].flatMap((b, i) => (b !== original[i] ? [i] : []));
    expect(changed.length).toBeLessThanOrEqual(5); // stream type + up to 4 CRC bytes
    // A 188-byte TS with AAC as 0x0F needs nothing.
    const ts = new Uint8Array(await (await blob("sample.m2t")).slice(0, 1 << 20).arrayBuffer());
    expect(privateAudioPatch(ts)).toBeUndefined();
    // CRC-32/MPEG-2 check value.
    expect(crc32Mpeg(new TextEncoder().encode("123456789"), 0, 9)).toBe(0x0376e6e7);
  });

  it("recognises ADTS, MPEG audio and AC-3 payloads", () => {
    expect(sniffAudioStreamType(Uint8Array.of(0xff, 0xf1, 0x50))).toBe(0x0f);
    expect(sniffAudioStreamType(Uint8Array.of(0xff, 0xfb, 0x90))).toBe(0x03);
    expect(sniffAudioStreamType(Uint8Array.of(0xff, 0xf3, 0x90))).toBe(0x04);
    expect(sniffAudioStreamType(Uint8Array.of(0x0b, 0x77, 0, 0, 0, 0x40))).toBe(0x81);
    expect(sniffAudioStreamType(Uint8Array.of(0x0b, 0x77, 0, 0, 0, 0x80))).toBe(0x87);
    expect(sniffAudioStreamType(Uint8Array.of(0x00, 0x00, 0x01))).toBeUndefined();
  });
});

describe("why a file cannot be read", () => {
  it("an MP4 cut off before its index", async () => {
    const e = await unreadableFileError(await blob("sample-nomoov.mp4"), "no-tracks");
    expect(e.code).toBe("unsupported-input");
    expect(e.message).toMatch(
      /^This MP4 is missing its index \(the moov box\), which happens when a recording was cut off/,
    );
  });

  it("a PNG renamed .mp4, a text file, and random bytes, with the formats pages read", async () => {
    const png = Object.assign(await openAsBlob(`${F}slide-2.png`), { name: "clip.mp4" });
    expect((await unreadableFileError(png, "unrecognised")).message).toBe(
      "This file is a PNG image named .mp4, not a video or audio file.",
    );
    const text = Object.assign(new Blob(["hello\n"]), { name: "notes.txt" });
    expect((await unreadableFileError(text, "unrecognised")).message).toMatch(/text file/);
    const random = Object.assign(
      new Blob([Uint8Array.from({ length: 64 }, (_, i) => (i * 97 + 13) % 251)]),
      { name: "r.mp4" },
    );
    const e = await unreadableFileError(random, "unrecognised");
    expect(e.message).toMatch(/whatever the \.mp4 name says/);
    // The list now has what pages accept beyond the native containers.
    for (const name of ["AVI", "WMV", "FLV", "MPEG-TS", "3GP", "WMA", "AIFF"])
      expect(e.hint).toContain(name);
    expect(acceptedFormatsHint(["MP4", "MOV"])).toBe("This page reads MP4 and MOV files.");
  });
});

describe("codec names mediabunny leaves blank", () => {
  it("H.263 in 3GP, MPEG-4 Part 2 with FLAC in MKV, Theora in Ogg (ffprobe: h263, mpeg4, theora)", async () => {
    const plain = new Input({
      source: new BlobSource(await blob("sample.3gp")),
      formats: ALL_FORMATS,
    });
    expect((await plain.getPrimaryVideoTrack())?.codec).toBeNull();
    expect(await isoVideoCodec(await blob("sample.3gp"))).toBe("h263");
    expect(codecName("h263")).toBe("H.263");
    expect(await matroskaVideoCodec(await blob("sample-mpeg4-flac.mkv"))).toBe("mpeg4");
    expect(codecName("mpeg4")).toBe("MPEG-4 Part 2");
    const theora = await containerVideoCodec(await blob("sample.ogv"), "Ogg");
    expect(theora).toEqual({ codec: "theora", width: 640, height: 360, fps: 25 });
    expect(codecName("theora")).toBe("Theora");
    expect(theoraHeader(new Uint8Array(64))).toBeUndefined();
    // Named codecs are left to mediabunny: an H.264 MP4 has avc1, which maps to itself.
    expect(await isoVideoCodec(await blob("sample.mp4"))).toBe("avc1");
  });
});

describe("video info: subtitle tracks", () => {
  it("lists every track as ffprobe does (MKV: subrip eng 'English' default, ass fre forced)", async () => {
    const subs = await subtitleTracksOf(await blob("sample-subs.mkv"));
    const info: MediaInfo = {
      container: "Matroska",
      durationSec: 8.5,
      sizeBytes: 261_873,
      subtitles: subs,
    };
    const sections = infoSections(info).filter((s) => s.title.startsWith("Subtitle"));
    expect(sections.map((s) => s.title)).toEqual(["Subtitle track 1", "Subtitle track 2"]);
    expect(sections[0]?.rows).toEqual([
      { label: "Format", value: "SRT" },
      { label: "Codec ID", value: "S_TEXT/UTF8" },
      { label: "Language", value: "eng" },
      { label: "Name", value: "English" },
      { label: "Flags", value: "default" },
    ]);
    expect(sections[1]?.rows).toEqual([
      { label: "Format", value: "ASS" },
      { label: "Codec ID", value: "S_TEXT/ASS" },
      { label: "Language", value: "fre" },
      { label: "Flags", value: "forced" },
    ]);
    expect(infoReport(info)).toContain(
      "Subtitle track 2\nFormat: ASS\nCodec ID: S_TEXT/ASS\nLanguage: fre\nFlags: forced",
    );
  });

  it("MP4 timed text (ffprobe mov_text eng default, spa) and WebM WebVTT (eng)", async () => {
    const mp4 = await subtitleTracksOf(await blob("sample-subs.mp4"));
    expect(mp4.map((s) => [subtitleFormat(s), s.language, !!s.default])).toEqual([
      ["MP4 timed text (mov_text)", "eng", true],
      ["MP4 timed text (mov_text)", "spa", false],
    ]);
    const webm = await withSubtitleTracks(await blob("sample-subs.webm"), {
      container: "WebM",
      durationSec: 8.5,
      sizeBytes: 257_000,
    });
    const one = infoSections(webm).find((s) => s.title === "Subtitles");
    expect(one?.rows[0]).toEqual({ label: "Format", value: "WebVTT" });
    expect(one?.rows).toContainEqual({ label: "Language", value: "eng" });
    // No subtitles: no section, and the info is returned unchanged.
    const none: MediaInfo = { container: "MP4", durationSec: 3, sizeBytes: 1 };
    expect(await withSubtitleTracks(await blob("sample.mp4"), none)).toBe(none);
  });
});

describe("cannot encode", () => {
  it("names the sound and codec for an audio output (5.1 WAV to Opus), the picture for video", () => {
    const wav: MediaInfo = {
      container: "WAVE",
      durationSec: 4,
      sizeBytes: 2_300_000,
      audio: [{ codec: "pcm-s16", channels: 6, sampleRate: 48_000 }],
    };
    const e = cannotEncodeError(encodeRequest(wav, { to: "opus", bitrate: 192 }));
    expect(e.message).toBe(
      "This browser cannot encode Opus audio from this source (5.1, 6 channels, 48\u00a0kHz).",
    );
    expect(e.message).not.toMatch(/video/);
    const mp4: MediaInfo = {
      container: "MP4",
      durationSec: 4,
      sizeBytes: 1,
      video: { codec: "hevc", width: 7680, height: 4320, fps: 30 },
    };
    expect(cannotEncodeError(encodeRequest(mp4, {})).message).toBe(
      "This browser cannot encode H.264 video from this source (7680×4320).",
    );
  });
});

describe("cannot encode: the codec the engine's plan asks for", () => {
  // QA 2026-10-08: an odd-size WebM going to H.264 MP4 read "cannot encode VP9 video".
  const webm: MediaInfo = {
    container: "WebM",
    durationSec: 2,
    sizeBytes: 1,
    video: { codec: "vp9", width: 641, height: 361, fps: 30 },
    audio: [{ codec: "opus", channels: 2, sampleRate: 48_000 }],
  };
  const message = (engineId: string, options: Record<string, unknown>) =>
    cannotEncodeError(encodeRequest(webm, options, { engineId, fileName: "odd.webm" })).message;

  it("convert to MP4 names H.264 at the source's size", () => {
    expect(message("convert-video", { to: "mp4", videoCodec: "keep" })).toBe(
      "This browser cannot encode H.264 video from this source (641×361).",
    );
  });
  it("change codec names the chosen codec at the size its plan gives the encoder", () => {
    expect(message("codec", { codec: "avc" })).toBe(
      "This browser cannot encode H.264 video from this source (640×360).",
    );
    expect(message("codec", { codec: "av1" })).toMatch(/cannot encode AV1 video/);
  });
  it("engines that keep the container: VP9 for WebM, as they encode it", () => {
    expect(message("compress", {})).toMatch(/cannot encode VP9 video/);
  });
});
