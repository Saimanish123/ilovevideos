import { describe, expect, it } from "vitest";
import { planConversion } from "@/tools/engines/convert-video/plan";
import { convertArgs, soundTracks, soundTracksMeta } from "@/tools/engines/ffmpeg/convert-args";
import { ffmpegFailure, lastMeaningfulLine } from "@/tools/engines/ffmpeg/failures";
import {
  assertOutputFits,
  FFMPEG_OUTPUT_LIMIT_BYTES,
  shellArg,
  withSoundEnd,
} from "@/tools/engines/ffmpeg/index";
import { layoutChannels, parseProbeLog } from "@/tools/engines/ffmpeg/probe-log";
import type { MediaInfo } from "@/tools/engines/types";
import { ffmpegAudioArgs, outputMeta, planExtraction } from "@/tools/engines/video-to-audio/plan";

/**
 * The ffmpeg.wasm conversion path (QA 2026-10-08): every sound track kept with its language, FLAC
 * copied into MP4 with `-strict -2`, failures that say what went wrong, and an `-i` log read for every
 * track. Logs below are ffmpeg.wasm 0.12.10 (FFmpeg 5.1) output captured in Chromium.
 */
const twoAc3: MediaInfo = {
  container: "Matroska",
  durationSec: 2,
  sizeBytes: 76_530,
  video: { codec: "avc", width: 320, height: 180, fps: 25 },
  audio: [
    { codec: "ac3", channels: 1, sampleRate: 48_000, language: "eng" },
    { codec: "ac3", channels: 1, sampleRate: 48_000, language: "fra" },
  ],
};

describe("ffmpeg conversion arguments", () => {
  it("maps every sound track, not only the first (MKV with eng and fra AC-3 to MP4)", () => {
    const plan = planConversion(twoAc3, "two.mkv", "mp4");
    const tracks = soundTracks(plan, twoAc3, "two.mkv", false);
    expect(tracks).toEqual([
      { index: 0, codec: "ac3", copy: false, language: "eng" },
      { index: 1, codec: "ac3", copy: false, language: "fra" },
    ]);
    const args = convertArgs(plan, tracks);
    expect(args.slice(0, 4)).toEqual(["-map", "0:V:0?", "-map", "0:a?"]);
    expect(args).toContain("-c:a");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args[args.indexOf("-c:v") + 1]).toBe("copy");
    expect(soundTracksMeta(tracks, "aac")).toBe(
      "2 sound tracks kept: eng AC-3 → AAC, fra AC-3 → AAC",
    );
  });

  it("copies the tracks the target holds and re-encodes the rest, per track", () => {
    const mixed: MediaInfo = {
      ...twoAc3,
      audio: [
        { codec: "aac", channels: 2, sampleRate: 48_000, language: "eng" },
        { codec: "ac3", channels: 6, sampleRate: 48_000, language: "fra" },
      ],
    };
    const plan = { ...planConversion(mixed, "m.mkv", "mp4"), backend: "ffmpeg-wasm" as const };
    const tracks = soundTracks(plan, mixed, "m.mkv", false);
    expect(tracks.map((t) => t.copy)).toEqual([true, false]);
    const args = convertArgs(plan, tracks);
    expect(args.join(" ")).toContain("-c:a aac -c:a:0 copy");
    expect(soundTracksMeta(tracks, "aac")).toBe(
      "2 sound tracks kept: eng AAC copied, fra AC-3 → AAC",
    );
  });

  it("copies FLAC into MP4 with -strict -2, which FFmpeg 5.1 needs (the plan says sound copied)", () => {
    const info: MediaInfo = {
      container: "matroska,webm",
      durationSec: 1,
      sizeBytes: 80_950,
      video: { codec: "mpeg4", width: 320, height: 180, fps: 25 },
      audio: [{ codec: "flac", channels: 1, sampleRate: 48_000 }],
    };
    const plan = planConversion(info, "x.mkv", "mp4");
    expect(plan.copyAudio).toBe(true);
    const args = convertArgs(plan, soundTracks(plan, info, "x.mkv", false));
    expect(args.join(" ")).toContain("-c:a copy");
    expect(args.join(" ")).toContain("-strict -2");
    // MKV holds FLAC as is: no flag, and subtitles and attachments come along.
    const mkv = planConversion({ ...info, container: "AVI" }, "x.avi", "mkv");
    const mkvArgs = convertArgs(mkv, soundTracks(mkv, info, "x.avi", false));
    expect(mkvArgs).not.toContain("-strict");
    expect(mkvArgs.join(" ")).toContain("-map 0:s? -map 0:t?");
  });

  it("cuts an odd last column and row for libx264 (641×361 AVI → 640×360 MP4), never for VP9", () => {
    const info: MediaInfo = {
      container: "AVI",
      durationSec: 1,
      sizeBytes: 50_000,
      video: { codec: "mpeg4", width: 641, height: 361, fps: 25 },
      audio: [{ codec: "mp3", channels: 2, sampleRate: 44_100 }],
    };
    const plan = planConversion(info, "odd.avi", "mp4");
    expect(plan.backend).toBe("ffmpeg-wasm");
    expect(plan.size).toEqual({ width: 640, height: 360 });
    expect(plan.sizeNote).toBe("641×361 becomes 640×360: H.264 needs even edges.");
    const args = convertArgs(plan, soundTracks(plan, info, "odd.avi", false), info.video);
    expect(args.join(" ")).toContain("-vf crop=640:360:0:0 -c:v libx264");
    const webm = planConversion(info, "odd.avi", "webm");
    const webmArgs = convertArgs(webm, soundTracks(webm, info, "odd.avi", false), info.video);
    expect(webmArgs).not.toContain("-vf");
    expect(webm.size).toEqual({ width: 641, height: 361 });
  });

  it("shows the command as a shell takes it", () => {
    expect(shellArg("0:V:0?")).toBe("'0:V:0?'");
    expect(shellArg("-c:a:1")).toBe("-c:a:1");
    expect(shellArg("+faststart")).toBe("+faststart");
  });

  it("names the rate written on the ffmpeg path, never NaN (no -ar means the source's rate)", () => {
    const wav = (sampleRate: number, channels: number, codec = "pcm-s16"): MediaInfo => ({
      container: "WAVE",
      durationSec: 4,
      sizeBytes: 1,
      audio: [{ codec, channels, sampleRate }],
    });
    const meta = (info: MediaInfo, to: "mp3" | "flac" | "ogg") => {
      const track = info.audio?.[0];
      if (!track) throw new Error("no track");
      return outputMeta(planExtraction(info, "x.wav", to, 192), track);
    };
    expect(meta(wav(22_050, 2), "mp3")).toMatch(/22\.05\skHz/);
    expect(meta(wav(48_000, 6), "mp3")).toMatch(/48\skHz/);
    expect(meta(wav(48_000, 2, "pcm-f32"), "flac")).toMatch(/48\skHz/);
    // Vorbis above 48 kHz: the plan resamples, and the command carries it.
    const plan = planExtraction(wav(96_000, 2), "x.wav", "ogg", 192);
    expect(meta(wav(96_000, 2), "ogg")).toMatch(/48\skHz/);
    expect(ffmpegAudioArgs(plan).join(" ")).toContain("-ar 48000");
    for (const m of [meta(wav(22_050, 2), "mp3"), meta(wav(96_000, 2), "ogg")])
      expect(m).not.toMatch(/NaN/);
  });

  it("ends a whole-file re-encode from MP4 where the movie ends (FFmpeg 5.1 keeps AAC padding)", () => {
    const args = ["-vn", "-c:a", "libmp3lame", "-f", "mp3"];
    const mp4 = { container: "MP4", durationSec: 4 };
    expect(withSoundEnd(args, { copy: false }, mp4, undefined)).toEqual([
      "-vn",
      "-c:a",
      "libmp3lame",
      "-t",
      "4.000000",
      "-f",
      "mp3",
    ]);
    expect(withSoundEnd(args, { copy: true }, mp4, undefined)).toEqual(args);
    expect(withSoundEnd(args, { copy: false }, mp4, { start: 1, end: 2 })).toEqual(args);
    expect(
      withSoundEnd(args, { copy: false }, { container: "Matroska", durationSec: 4 }, undefined),
    ).toEqual(args);
  });
});

describe("ffmpeg failures", () => {
  const tail = (s: string) => s.trim().split("\n");

  it("FLAC in MP4 refused by FFmpeg 5.1: a sentence, not the log", () => {
    const e = ffmpegFailure(
      tail(`
[mp4 @ 0xe1bdf0] track 1: codec frame size is not set
[mp4 @ 0xe1bdf0] flac in MP4 support is experimental, add '-strict -2' if you want to use it.
Could not write header for output file #0 (incorrect codec parameters ?): Experimental feature
Error initializing output stream 0:0 --
Conversion failed!
Aborted()`),
      1,
      { container: "MP4", hint: "Try another output format." },
    );
    expect(e.code).toBe("unsupported-output");
    expect(e.message).toBe("This version of the converter will not write FLAC sound into MP4.");
    expect(e.message).not.toMatch(/Aborted|exited/);
  });

  it("Vorbis at 96 kHz: names the encoder and the sound", () => {
    const e = ffmpegFailure(
      tail(`
Input #0, wav, from 'input.wav':
  Duration: 00:00:02.00, bitrate: 3072 kb/s
  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 96000 Hz, stereo, s16, 3072 kb/s
Stream mapping:
  Stream #0:0 -> #0:0 (pcm_s16le (native) -> vorbis (libvorbis))
[libvorbis @ 0xe311c0] encoder setup failed
Error initializing output stream 0:0 -- Error while opening encoder for output stream #0:0 - maybe incorrect parameters such as bit_rate, rate, width or height
Conversion failed!
Aborted()`),
      1,
      { container: "OGG", hint: "Try another format." },
    );
    expect(e.code).toBe("unsupported-output");
    expect(e.message).toBe(
      "This sound (96 kHz, stereo) cannot be written as Vorbis with these settings.",
    );
  });

  it("a cut-off MP4, damaged data, memory, and a plain fallback", () => {
    expect(
      ffmpegFailure(
        [
          "[mov,mp4 @ 0x1] moov atom not found",
          "input.mp4: Invalid data found when processing input",
        ],
        1,
        { hint: "" },
      ).message,
    ).toMatch(/missing its index \(the moov box\)/);
    expect(
      ffmpegFailure(["input.avi: Invalid data found when processing input"], 1, { hint: "" }).code,
    ).toBe("unsupported-input");
    expect(ffmpegFailure(["Cannot allocate memory"], 1, { hint: "" }).code).toBe("resource");
    const other = ffmpegFailure(
      ["[x @ 0x2] Something odd happened", "Conversion failed!", "Aborted()"],
      1,
      { hint: "Try again." },
    );
    expect(other.code).toBe("internal");
    expect(other.message).toBe(
      'The converter stopped on this file (exit code 1). Its last message: "Something odd happened".',
    );
    expect(lastMeaningfulLine(["Conversion failed!", "Aborted()"])).toBeUndefined();
  });
});

describe("ffmpeg -i log", () => {
  it("lists every sound track with its language and real channel count", () => {
    const info = parseProbeLog(
      `Input #0, matroska,webm, from 'probe.mkv':
  Duration: 00:00:02.00, start: 0.000000, bitrate: 306 kb/s
  Stream #0:0: Video: h264 (High), yuv420p(progressive), 320x180 [SAR 1:1 DAR 16:9], 25 fps, 25 tbr, 1k tbn
  Stream #0:1(eng): Audio: ac3, 48000 Hz, 5.1(side), fltp, 384 kb/s
  Stream #0:2(fra): Audio: ac3, 48000 Hz, mono, fltp, 64 kb/s
  Stream #0:3: Video: mjpeg (Baseline), yuvj420p(pc), 600x600, 90k tbr, 90k tbn (attached pic)`.split(
        "\n",
      ),
      { name: "probe.mkv", size: 76_530 },
    );
    expect(info.video).toMatchObject({ codec: "h264", width: 320, height: 180, fps: 25 });
    expect(info.audio).toEqual([
      { codec: "ac3", sampleRate: 48_000, channels: 6, language: "eng" },
      { codec: "ac3", sampleRate: 48_000, channels: 1, language: "fra" },
    ]);
    expect(layoutChannels("7.1")).toBe(8);
    expect(layoutChannels("3 channels")).toBe(3);
  });

  it("a probe that finds no stream says why when ffmpeg did", () => {
    expect(() =>
      parseProbeLog(
        [
          "[mov,mp4 @ 0x1] moov atom not found",
          "probe.mp4: Invalid data found when processing input",
        ],
        { name: "a.mp4", size: 10 },
      ),
    ).toThrow(/missing its index/);
  });
});

describe("ffmpeg result size", () => {
  it("refuses before running when the result cannot be held, and says what works", () => {
    expect(() => assertOutputFits(FFMPEG_OUTPUT_LIMIT_BYTES * 0.9, "x")).not.toThrow();
    try {
      assertOutputFits(2.1e9, "Choose WAV.");
      expect.unreachable();
    } catch (e) {
      const err = e as { code: string; message: string; hint: string };
      expect(err.code).toBe("resource");
      expect(err.message).toMatch(
        /^The result would be about 2\.1\sGB, too large for this browser/,
      );
      expect(err.hint).toBe("Choose WAV.");
    }
  });
});
