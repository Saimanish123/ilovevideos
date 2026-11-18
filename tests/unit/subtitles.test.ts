import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  conversionNotes,
  detectFormat,
  parseSubtitles,
  SubtitleParseError,
  writeSubtitles,
} from "@/tools/engines/subtitles";
import { languageFromFile } from "@/tools/engines/subtitles/languages";
import { fromAss, fromSrt, fromVtt, toAss, toVtt } from "@/tools/engines/subtitles/markup";
import { assTime, cueClock, offsetLabel, parseTime, srtTime } from "@/tools/engines/subtitles/time";
import { changeFrameRate, findIssues, fixTiming, shiftDoc } from "@/tools/engines/subtitles/timing";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join("tests/fixtures/subtitles", name)));
const read = (name: string) => parseSubtitles(fixture(name), name);

describe("timestamps", () => {
  it("reads the spellings real files use", () => {
    expect(parseTime("00:00:01,500")).toBe(1500);
    expect(parseTime("00:00:01.500")).toBe(1500);
    expect(parseTime("0:00:01,5")).toBe(1500);
    expect(parseTime("0:00:01.05")).toBe(1050);
    expect(parseTime("01:02.250")).toBe(62_250);
    expect(parseTime("1:00:00.0004")).toBe(3_600_000);
    expect(parseTime("10:00:00,000")).toBe(36_000_000);
    expect(parseTime("00:00:0x,000")).toBeUndefined();
    expect(parseTime("00:61:00,000")).toBeUndefined();
  });

  it("writes each format's own spelling", () => {
    expect(srtTime(3_723_004)).toBe("01:02:03,004");
    expect(assTime(3_723_004)).toBe("1:02:03.00");
    expect(assTime(1_235)).toBe("0:00:01.24");
    expect(cueClock(62_250)).toBe("1:02.25");
    expect(cueClock(-1500)).toBe("−0:01.50");
    expect(offsetLabel(-250)).toBe("−250 ms");
    expect(offsetLabel(1500)).toBe("+1.5 s");
  });
});

describe("markup", () => {
  it("normalises SRT tags, drops <font>, reads {\\an8}", () => {
    const m = fromSrt('{\\an8}<I>Hi</I> <font color="red">there</font>');
    expect(m).toMatchObject({ text: "<i>Hi</i> there", top: true, fonts: true });
  });

  it("unwraps WebVTT voices, classes and ruby, decodes entities", () => {
    const m = fromVtt("<v.loud Bob>A &amp; B &lt;3</v> <c.x>c</c> <ruby>漢<rt>kan</rt></ruby>");
    expect(m.text).toBe("A & B <3 c 漢");
    expect(m.voices).toBe(true);
    expect(m.spans).toBe(true);
  });

  it("maps ASS overrides to tags and flags what is lost", () => {
    const m = fromAss("{\\an8\\i1}Top{\\i0} line\\Nnext{\\c&H0000FF&}red\\hspace{note}");
    expect(m.text).toBe("<i>Top</i> line\nnextred space");
    expect(m.top).toBe(true);
    expect(m.styled).toBe(true);
    expect(fromAss("{\\p1}m 0 0 l 10 0{\\p0}").drawing).toBe(true);
  });

  it("escapes literal brackets for WebVTT and writes ASS overrides", () => {
    expect(toVtt("<i>a</i> < b & c > d")).toBe("<i>a</i> &lt; b &amp; c &gt; d");
    expect(toAss("<i><b>x</b></i>\ny", true)).toBe("{\\an8}{\\i1\\b1}x{\\b0\\i0}\\Ny");
  });
});

describe("SRT reader", () => {
  const doc = read("bom-crlf.srt");

  it("survives a BOM, CRLF, a missing index, dot millis and no final newline", () => {
    expect(doc.format).toBe("srt");
    expect(doc.newline).toBe("\r\n");
    expect(doc.cues.map((c) => [c.start, c.end])).toEqual([
      [500, 2000],
      [2250, 4000],
      [4500, 6000],
      [6100, 8000],
      [9000, 10_000],
    ]);
    expect(doc.cues[0]?.text).toBe("<i>Previously on the show</i>");
    expect(doc.cues[1]?.text).toBe("Yellow warning\nsecond line");
    expect(doc.cues[2]).toMatchObject({ text: "Sign at the top", top: true });
    // A blank line inside the text does not end the cue when more text follows.
    expect(doc.cues[3]?.text).toBe("<b>Bold</b> and <u>under</u>\nafter a blank line");
    expect(doc.cues[4]?.text).toBe("Positioned & <3 hearts");
    expect(doc.features).toMatchObject({ fonts: 1, coords: 1 });
  });

  it("skips a broken timing line and says which line", () => {
    const skipped = doc.issues.find((i) => i.kind === "skipped");
    expect(skipped?.message).toBe(
      'Line 20: "00:00:0x,000" is not a valid time, so this cue was skipped.',
    );
  });

  it("writes the same file back with its coordinates, tags and line endings", () => {
    const out = writeSubtitles(doc, "srt");
    expect(out).toContain("\r\n");
    expect(out).toContain("00:00:09,000 --> 00:00:10,000 X1:100 X2:500 Y1:10 Y2:50");
    expect(out).toContain('<font color="#ffff00">Yellow warning</font>');
    expect(out.split("\r\n").filter((l) => /^\d+$/.test(l))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("reads Windows-1252 when the file is not UTF-8, and UTF-16 with a BOM", () => {
    const cp = read("windows-1252.srt");
    expect(cp.encoding).toBe("windows-1252");
    expect(cp.cues[0]?.text).toBe("Café crème brûlée");
    expect(cp.cues[1]?.text).toBe("“Quotes” – dash");
    const u16 = read("utf16.srt");
    expect(u16.encoding).toBe("utf-16le");
    expect(u16.cues.map((c) => c.text)).toEqual(["Привет, мир", "日本語の字幕"]);
  });
});

describe("WebVTT reader", () => {
  const doc = read("web.vtt");

  it("keeps the header, reads ids, settings and cues without a blank line between them", () => {
    expect(doc.format).toBe("vtt");
    expect(doc.header).toContain("Language: en");
    expect(doc.header).toContain("::cue(.loud)");
    expect(doc.cues).toHaveLength(6);
    expect(doc.cues[0]).toMatchObject({
      text: "Hi, I'm Anna & this is loud.",
      native: { id: "intro", settings: "align:start position:10%" },
    });
    expect(doc.cues[1]).toMatchObject({ text: "<i>Top of the screen</i>", top: true });
    expect(doc.cues[4]).toMatchObject({ start: 5000, end: 6250, text: "word timed <tag> 漢" });
    expect(doc.cues[5]).toMatchObject({ start: 6500, text: "no blank line before this cue" });
    expect(doc.features).toMatchObject({ positioned: 2, voices: 1, spans: 2, blocks: 3 });
    expect(doc.extras).toHaveLength(1);
  });

  it("round-trips its own format with settings, ids and the note between cues", () => {
    const out = writeSubtitles(doc, "vtt");
    expect(out.startsWith("WEBVTT\nKind: captions\nLanguage: en\n\nSTYLE")).toBe(true);
    expect(out).toContain("intro\n00:00:00.000 --> 00:00:01.500 align:start position:10%");
    expect(out).toContain("NOTE between cues\n\n00:00:05.000");
    expect(parseSubtitles(out, "x.vtt").cues).toHaveLength(6);
  });

  it("converts to SRT and says what is dropped", () => {
    const srt = writeSubtitles(doc, "srt");
    expect(srt).toContain("2\n00:00:01,500 --> 00:00:03,000\n{\\an8}<i>Top of the screen</i>\n");
    expect(srt).toContain("word timed <tag> 漢");
    const notes = conversionNotes(doc, "srt");
    expect(notes.lost).toEqual([
      "Position and alignment settings on 2 cues are removed; cues at the top stay at the top.",
      "Speaker names from voice tags on 1 cue are removed; the words stay.",
      "Class, ruby and word-timing tags on 2 cues are removed; the words stay.",
      "3 STYLE, REGION or NOTE blocks are removed.",
    ]);
    expect(notes.kept).toContain("Italic, bold and underline are kept.");
  });

  it("writes a transcript without the rolling duplicate", () => {
    expect(writeSubtitles(doc, "txt")).toBe(
      [
        "Hi, I'm Anna & this is loud.",
        "Top of the screen",
        "rolling line one",
        "rolling line two",
        "word timed <tag> 漢",
        "no blank line before this cue",
        "",
      ].join("\n"),
    );
    expect(writeSubtitles(doc, "txt", { txtTimes: true }).split("\n")[2]).toBe(
      "[0:03.00] rolling line one",
    );
  });
});

describe("ASS reader", () => {
  const doc = read("styled.ass");

  it("reads cues with commas in the text, style italics, drawings and comments", () => {
    expect(doc.format).toBe("ass");
    expect(doc.cues.map((c) => c.text)).toEqual([
      "Hello, <i>world</i>, with commas",
      "<i>An italic style\nSecond line with hard space</i>",
      "<b>CITY HALL</b>",
      "Red fade",
      "Sing along",
    ]);
    expect(doc.cues[2]?.top).toBe(true);
    expect(doc.features).toMatchObject({
      styles: 3,
      drawings: 1,
      comments: 1,
      layered: 1,
      styledCues: 3,
    });
    expect(doc.extras.map((x) => x.kind)).toEqual(["ass-comment", "ass-drawing"]);
    expect(doc.footer).toContain("[Aegisub Extradata]");
  });

  it("writes itself back byte for byte apart from the times it was asked to move", () => {
    const shifted = shiftDoc(doc, 1000).doc;
    const out = writeSubtitles(shifted, "ass");
    expect(out).toContain("Style: Sign,Georgia,40");
    expect(out).toContain(
      "Dialogue: 1,0:00:01.00,0:00:07.00,Sign,,0,0,0,,{\\pos(960,100)}CITY HALL",
    );
    expect(out).toContain(
      "Comment: 0,0:00:01.00,0:00:01.00,Default,,0,0,0,template line,{\\k10}karaoke template",
    );
    expect(out).toContain("Dialogue: 0,0:00:07.00,0:00:08.00,Default,,0,0,0,,{\\p1}");
    expect(out.trimEnd().endsWith("Data: 1,x,y")).toBe(true);
  });

  it("converts to SRT with the losses counted", () => {
    const notes = conversionNotes(doc, "srt");
    expect(notes.lost).toEqual([
      "3 styles (fonts, sizes, colours, outlines) give way to the player's own look.",
      "Colours, fonts, positions, fades and karaoke on 3 lines are removed; the words stay.",
      "1 vector drawing is removed.",
      "1 comment line is removed.",
      "1 sign on upper layers becomes an ordinary cue and may show together with the dialogue.",
    ]);
    const srt = writeSubtitles(doc, "srt");
    expect(srt).toContain("<i>An italic style\nSecond line with hard space</i>");
    expect(srt).toContain("{\\an8}<b>CITY HALL</b>");
    expect(srt).not.toContain("m 0 0 l");
  });

  it("reads legacy SSA v4 with Marked fields and legacy alignment", () => {
    const ssa = read("legacy.ssa");
    expect(ssa.cues.map((c) => [c.start, c.text, c.top ?? false])).toEqual([
      [1000, "<b>Bold by style</b>", false],
      [3000, "At the top", true],
    ]);
  });
});

describe("SBV", () => {
  it("reads YouTube Studio captions and writes SRT", () => {
    const doc = read("youtube.sbv");
    expect(doc.format).toBe("sbv");
    expect(doc.cues).toHaveLength(3);
    expect(doc.cues[0]).toMatchObject({
      start: 599,
      end: 4160,
      text: ">> ALICE: Hi, my name is Alice\nand this is a caption.",
    });
    expect(writeSubtitles(doc, "srt")).toContain(
      "3\n00:00:06,770 --> 00:00:10,000\nThird one, no final newline\n",
    );
    expect(conversionNotes(doc, "srt").lost).toEqual([]);
  });
});

describe("format detection", () => {
  it("goes by content and names a wrong extension", () => {
    expect(detectFormat("WEBVTT\n\n00:01.000 --> 00:02.000\nx", "film.srt")).toEqual({
      format: "vtt",
      renamed: "This file is named .srt but is WebVTT inside; it is read as WebVTT.",
    });
    expect(detectFormat("1\n00:00:01.000 --> 00:00:02.000\nx", "a.vtt").format).toBe("vtt");
    expect(detectFormat("1\n00:00:01,000 --> 00:00:02,000\nx", "a.txt").format).toBe("srt");
  });

  it("refuses a file with no timings, and one whose only cue is broken, with a reason", () => {
    expect(() => parseSubtitles("just some notes\nno times", "notes.srt")).toThrow(
      SubtitleParseError,
    );
    try {
      parseSubtitles("1\n00:00:01,000 --> 00:00:0y,000\nHi\n", "a.srt");
    } catch (e) {
      expect((e as SubtitleParseError).message).toBe(
        'No cue could be read. Line 2: "00:00:0y,000" is not a valid time, so this cue was skipped.',
      );
      expect((e as SubtitleParseError).line).toBe(2);
    }
  });
});

describe("timing", () => {
  it("lists every timing problem with its line", () => {
    const doc = read("broken-timing.srt");
    expect(findIssues(doc).map((i) => i.message)).toEqual([
      "Line 6: this cue starts before the previous one ends.",
      "Line 14: the end time is before the start time.",
      "Line 14: this cue starts before the one above it.",
      "Line 22: this cue repeats the one on line 18.",
      "Line 26: this cue has no text.",
      "Line 34: this cue starts before the previous one ends.",
    ]);
  });

  it("fixes overlaps, order, reversed ends, duplicates, empty and simultaneous cues", () => {
    const { doc, report } = fixTiming(read("broken-timing.srt"));
    expect(report).toEqual({
      emptyRemoved: 1,
      duplicatesRemoved: 1,
      lengthsFixed: 1,
      reordered: 1,
      overlapsFixed: 1,
      merged: 1,
    });
    expect(doc.cues.map((c) => [c.start, c.end])).toEqual([
      [1000, 3000],
      [3000, 5000],
      [6000, 7000],
      [7000, 8000],
      [10_000, 12_000],
      [13_000, 14_500],
    ]);
    expect(doc.cues.at(-1)?.text).toBe("Speaker one\nSpeaker two");
    expect(findIssues(doc)).toEqual([]);
    expect(writeSubtitles(doc, "srt")).toContain(
      "6\n00:00:13,000 --> 00:00:14,500\nSpeaker one\nSpeaker two\n",
    );
  });

  it("shifts, never before 0:00", () => {
    const doc = read("youtube.sbv");
    const later = shiftDoc(doc, 2500);
    expect(later.doc.cues[0]).toMatchObject({ start: 3099, end: 6660 });
    const earlier = shiftDoc(doc, -5000);
    expect(earlier.report).toEqual({ removed: 1, clamped: 1 });
    expect(earlier.doc.cues[0]).toMatchObject({ start: 0, end: 1770 });
  });

  it("re-times 23.976 fps subtitles for a 25 fps release", () => {
    const doc = parseSubtitles("1\n01:00:00,000 --> 01:00:02,000\nx\n", "a.srt");
    const out = changeFrameRate(doc, "23.976", "25");
    // 3,600 s × (24000/1001) / 25 = 3,452.547 s
    expect(out.cues[0]?.start).toBe(3_452_547);
    expect(changeFrameRate(out, "25", "23.976").cues[0]?.start).toBe(3_600_000);
  });
});

describe("languages", () => {
  it("reads the language a file names for itself", () => {
    expect(languageFromFile("Film.2024.en.srt")?.code).toBe("eng");
    expect(languageFromFile("film.fre.forced.srt")?.code).toBe("fra");
    expect(languageFromFile("film.pt-BR.srt")?.bib).toBe("por");
    expect(languageFromFile("film.srt", "WEBVTT\nLanguage: de")?.code).toBe("deu");
    expect(languageFromFile("film.srt")).toBeUndefined();
  });
});
