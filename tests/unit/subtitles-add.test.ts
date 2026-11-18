import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  missingGlyph,
  planRoute,
  planSubtitles,
  subtitleCommand,
} from "@/tools/engines/subtitles-add/options";
import { readTrack, trackText } from "@/tools/engines/subtitles-add/track";
import type { MediaInfo } from "@/tools/engines/types";

const info = (container: string, durationSec = 3): MediaInfo => ({
  container,
  durationSec,
  sizeBytes: 1,
  video: { codec: "avc", width: 640, height: 360, fps: 30 },
  audio: [{ codec: "aac", channels: 2, sampleRate: 48000 }],
});
const soft = { mode: "soft" as const, keepStyling: true };
const burn = { mode: "burn" as const, keepStyling: true };

describe("add subtitles: which path a file takes", () => {
  it("writes mov_text into MP4 and MOV, SRT or ASS into MKV, WebVTT into WebM, all with ffmpeg", () => {
    expect(planSubtitles(info("MP4"), "a.mp4", soft, "srt", true)).toMatchObject({
      codec: "mov_text",
      ext: "mp4",
    });
    expect(planSubtitles(info("QuickTime"), "a.mov", soft, "vtt", true)).toMatchObject({
      codec: "mov_text",
      ext: "mov",
    });
    expect(planSubtitles(info("Matroska"), "a.mkv", soft, "srt", true)).toMatchObject({
      codec: "srt",
      ext: "mkv",
    });
    expect(planSubtitles(info("Matroska"), "a.mkv", soft, "ass", true)).toMatchObject({
      codec: "ass",
      ext: "mkv",
    });
    const webm = planSubtitles(info("WebM"), "a.webm", soft, "srt", true);
    expect(webm).toMatchObject({ codec: "webvtt", ext: "webm", backend: "ffmpeg" });
    expect(planRoute(webm)).toBe("page");
  });

  it("copies files only ffmpeg reads into MKV", () => {
    expect(planSubtitles(info("avi"), "a.avi", soft, "srt", true)).toMatchObject({
      codec: "srt",
      ext: "mkv",
    });
  });

  it("burns in with the canvas renderer, and with libass for styled ASS the font can draw", () => {
    const plain = planSubtitles(info("MP4"), "a.mp4", burn, "srt", true);
    expect(plain).toMatchObject({ renderer: "canvas", ext: "mp4" });
    expect(planRoute(plain)).toBe("worker");
    expect(planSubtitles(info("WebM"), "a.webm", burn, "srt", true)).toMatchObject({
      renderer: "canvas",
      ext: "mp4",
    });
    const styled = planSubtitles(info("MP4"), "a.mp4", burn, "ass", true);
    expect(styled).toMatchObject({ renderer: "libass" });
    expect(planRoute(styled)).toBe("page");
    expect(planSubtitles(info("MP4"), "a.mp4", burn, "ass", false)).toMatchObject({
      renderer: "canvas",
    });
    expect(
      planSubtitles(info("MP4"), "a.mp4", { mode: "burn", keepStyling: false }, "ass", true),
    ).toMatchObject({ renderer: "canvas" });
    expect(planSubtitles(info("avi"), "a.avi", burn, "srt", true)).toMatchObject({
      renderer: "libass",
      ext: "mp4",
    });
  });
});

describe("add subtitles: the bundled font's coverage", () => {
  it("covers Latin, Vietnamese and Cyrillic, and names the first letter it cannot draw", () => {
    expect(missingGlyph("Café, crème brûlée — “quoted”")).toBeUndefined();
    expect(missingGlyph("Tiếng Việt có dấu")).toBeUndefined();
    expect(missingGlyph("Привет, мир")).toBeUndefined();
    expect(missingGlyph("Καλημέρα")).toBe("Κ");
    expect(missingGlyph("日本語")).toBe("日");
    expect(missingGlyph("♪ la la ♪")).toBe("♪");
    expect(missingGlyph("line‎ with a mark")).toBeUndefined();
  });
});

describe("add subtitles: the track that goes into the file", () => {
  it("sorts, drops zero-length cues and cues after the end, and cuts the last one at the end", () => {
    const t = readTrack(
      readFileSync("tests/fixtures/subtitles/broken-timing.srt", "utf8"),
      "b.srt",
      11,
    );
    expect(t.dropped).toBe(1);
    expect(t.beyond).toBe(2);
    expect(t.doc.cues.map((c) => [c.start, c.end])).toEqual([
      [1000, 4000],
      [3000, 5000],
      [7000, 8000],
      [7000, 8000],
      [8500, 9000],
      [10_000, 11_000],
    ]);
  });

  it("writes WebVTT clean for muxers, and keeps an ASS script as it was", () => {
    const vtt = readTrack(readFileSync("tests/fixtures/subtitles/web.vtt", "utf8"), "w.vtt", 3.021);
    const text = trackText(vtt, "vtt");
    expect(text.startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\n")).toBe(true);
    expect(text).not.toContain("STYLE");
    expect(text).not.toContain("NOTE");
    expect(text).toContain("00:00:01.500 --> 00:00:03.000 line:0\n<i>Top of the screen</i>");
    const ass = readTrack(readFileSync("tests/fixtures/subtitles/styled.ass", "utf8"), "s.ass", 3);
    const script = trackText(ass, "ass");
    expect(script).toContain("Style: Sign,Georgia,40");
    expect(script).toContain(
      "Dialogue: 1,0:00:00.00,0:00:03.00,Sign,,0,0,0,,{\\pos(960,100)}CITY HALL",
    );
    expect(script).not.toContain("0:00:06.00,0:00:07.00");
  });
});

describe("add subtitles: the command shown for the same job", () => {
  it("is a stream copy for a soft track and a libx264 encode for burn-in", () => {
    const p = planSubtitles(info("MP4"), "clip.mp4", soft, "srt", true);
    expect(
      subtitleCommand("clip.mp4", "clip.en.srt", "clip-subtitled.mp4", p, {
        language: "eng",
        showByDefault: true,
      }),
    ).toBe(
      "ffmpeg -i clip.mp4 -i clip.en.srt -map 0:v -map '0:a?' -map 1:0 -map '0:s?' -c copy -c:s:0 mov_text -metadata:s:s:0 language=eng -disposition:s:0 default -movflags +faststart clip-subtitled.mp4",
    );
    const b = planSubtitles(info("MP4"), "clip.mp4", burn, "srt", true);
    expect(
      subtitleCommand(
        "clip.mp4",
        "subs.srt",
        "out.mp4",
        b,
        { language: "und", showByDefault: true },
        2000,
      ),
    ).toBe(
      'ffmpeg -i clip.mp4 -vf "subtitles=subs.srt" -c:v libx264 -b:v 2000k -pix_fmt yuv420p -c:a copy out.mp4',
    );
  });
});
