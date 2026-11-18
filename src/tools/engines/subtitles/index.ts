/**
 * Subtitle library: read any of SRT, WebVTT, ASS/SSA and SBV; write those plus plain TXT; say
 * exactly what a conversion keeps and drops. Pure (no DOM, no media), shared by the subtitle
 * utilities engine, the add-subtitles engine and the pages' panels.
 */
import { readAss, writeAss } from "./ass";
import { decodeSubtitleBytes, splitLines } from "./decode";
import { hasEmphasis } from "./markup";
import {
  type Encoding,
  formatNames,
  noFeatures,
  type ReadableFormat,
  type SubtitleDoc,
  type SubtitleFormat,
  SubtitleParseError,
} from "./model";
import { readSbv, SBV_TIMING, writeSbv, writeTxt } from "./sbv";
import { readSrt, TIMING, writeSrt } from "./srt";
import { findIssues } from "./timing";
import { readVtt, writeVtt } from "./vtt";

export * from "./model";

const extOf = (name?: string) => name?.toLowerCase().split(".").pop() ?? "";

/**
 * Decides the format from the content, not the name: a .srt that is WebVTT inside is read as WebVTT.
 * `renamed` names the mismatch so the page can mention it.
 */
export function detectFormat(
  text: string,
  fileName?: string,
): { format: ReadableFormat; renamed?: string } {
  const head = text.replace(/^﻿/, "").trimStart();
  const ext = extOf(fileName);
  let format: ReadableFormat | undefined;
  if (/^WEBVTT(?:[ \t\r\n]|$)/.test(head)) format = "vtt";
  else if (/^\s*\[(Script Info|V4\+? Styles|Events)\]/im.test(head) || /^Dialogue:\s*/m.test(head))
    format = "ass";
  else if (head.split(/\r?\n/, 40).some((l) => SBV_TIMING.test(l))) format = "sbv";
  else if (head.split(/\r?\n/, 400).some((l) => TIMING.test(l)))
    format = ext === "vtt" && !/\d,\d/.test(head.slice(0, 2000)) ? "vtt" : "srt";
  if (!format) {
    throw new SubtitleParseError(
      "This file has no subtitle timings in it. SRT, WebVTT, ASS, SSA and SBV files can be read.",
    );
  }
  const expected: Record<string, ReadableFormat> = {
    srt: "srt",
    vtt: "vtt",
    ass: "ass",
    ssa: "ass",
    sbv: "sbv",
  };
  const named = expected[ext];
  return named && named !== format
    ? {
        format,
        renamed: `This file is named .${ext} but is ${formatNames[format]} inside; it is read as ${formatNames[format]}.`,
      }
    : { format };
}

/** Reads a subtitle file (bytes or already-decoded text). Throws SubtitleParseError when nothing is usable. */
export function parseSubtitles(
  input: string | Uint8Array,
  fileName?: string,
): SubtitleDoc & { renamed?: string } {
  const decoded =
    typeof input === "string"
      ? { text: input, encoding: "utf-8" as Encoding }
      : decodeSubtitleBytes(input);
  const { format, renamed } = detectFormat(decoded.text, fileName);
  const { lines, newline } = splitLines(decoded.text);
  const features = noFeatures();
  let doc: SubtitleDoc;
  if (format === "srt") {
    const r = readSrt(lines, features);
    doc = {
      format,
      cues: r.cues,
      issues: r.issues,
      features,
      extras: [],
      encoding: decoded.encoding,
      newline,
    };
  } else if (format === "vtt") {
    const r = readVtt(lines, features);
    doc = {
      format,
      cues: r.cues,
      issues: r.issues,
      header: r.header,
      extras: r.extras,
      features,
      encoding: decoded.encoding,
      newline,
    };
  } else if (format === "ass") {
    const r = readAss(lines, features);
    doc = {
      format,
      cues: r.cues,
      issues: r.issues,
      header: r.header,
      footer: r.footer,
      eventFormat: r.eventFormat,
      extras: r.extras,
      features,
      encoding: decoded.encoding,
      newline,
    };
  } else {
    const r = readSbv(lines);
    doc = {
      format,
      cues: r.cues,
      issues: r.issues,
      features,
      extras: [],
      encoding: decoded.encoding,
      newline,
    };
  }
  if (doc.cues.length === 0) {
    const first = doc.issues[0];
    throw new SubtitleParseError(
      first
        ? `No cue could be read. ${first.message}`
        : `This ${formatNames[format]} file has no cues in it.`,
      first?.line,
    );
  }
  doc.issues = [...doc.issues, ...findIssues(doc)].sort((a, b) => a.line - b.line);
  return renamed ? { ...doc, renamed } : doc;
}

export interface WriteOptions {
  /** TXT only: prefix each line with its start time. */
  txtTimes?: boolean;
  /**
   * Write from the normal form even when the format is the source's own: no WebVTT header lines,
   * STYLE, REGION or NOTE blocks, identifiers or settings beyond top placement, no SRT coordinates
   * or <font> tags. For muxers and players with stricter readers (FFmpeg 5.1's WebVTT demuxer reads
   * no cue at all from a file with header metadata or STYLE blocks).
   */
  clean?: boolean;
}

/** Writes the document in `to`. The same format keeps everything the source had (styles, settings, comments). */
export function writeSubtitles(
  doc: SubtitleDoc,
  to: SubtitleFormat,
  opts: WriteOptions = {},
): string {
  const native = to === doc.format && !opts.clean;
  const newline = native ? doc.newline : "\n";
  switch (to) {
    case "srt":
      return writeSrt(doc.cues, { native, newline });
    case "vtt":
      return writeVtt(doc.cues, { native, header: doc.header, extras: doc.extras, newline });
    case "ass":
      return writeAss(doc.cues, {
        native,
        header: doc.header,
        footer: doc.footer,
        eventFormat: doc.eventFormat,
        extras: doc.extras,
        newline,
      });
    case "sbv":
      return writeSbv(doc.cues, { native, newline });
    case "txt":
      return writeTxt(doc.cues, { times: opts.txtTimes === true });
  }
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
/** "is" or "are" to agree with a count. */
const be = (n: number) => (n === 1 ? "is" : "are");

export interface ConversionNotes {
  /** What the target cannot hold, with counts. Empty when nothing is lost. */
  lost: string[];
  /** What survives, stated so the user does not have to guess. */
  kept: string[];
}

/** What converting `doc` to `to` keeps and drops, in sentences with real counts. */
export function conversionNotes(doc: SubtitleDoc, to: SubtitleFormat): ConversionNotes {
  const lost: string[] = [];
  const kept: string[] = [];
  const f = doc.features;
  const emphasis = doc.cues.filter((c) => hasEmphasis(c.text)).length;
  const tops = doc.cues.filter((c) => c.top).length;
  const rich = to === "srt" || to === "vtt" || to === "ass";
  if (to === doc.format) {
    kept.push(
      doc.format === "ass"
        ? "Styles, override tags and comment lines are written back as they were."
        : doc.format === "vtt"
          ? "The header, cue settings, identifiers and NOTE blocks are written back as they were."
          : "The text of every cue is written back as it was.",
    );
    return { lost, kept };
  }
  if (to === "txt") lost.push("Every timing is removed: a TXT file holds the words only.");
  if (!rich && emphasis > 0)
    lost.push(
      `Italic, bold and underline on ${plural(emphasis, "cue")} are removed: ${formatNames[to]} has no formatting.`,
    );
  if (!rich && tops > 0)
    lost.push(`${plural(tops, "cue")} placed at the top of the picture will show at the bottom.`);
  if (doc.format === "ass") {
    if (f.styles > 0 && to !== "ass")
      lost.push(
        `${plural(f.styles, "style")} (fonts, sizes, colours, outlines) ${f.styles === 1 ? "gives" : "give"} way to the player's own look.`,
      );
    if (f.styledCues > 0)
      lost.push(
        `Colours, fonts, positions, fades and karaoke on ${plural(f.styledCues, "line")} are removed; the words stay.`,
      );
    if (f.drawings > 0)
      lost.push(`${plural(f.drawings, "vector drawing")} ${be(f.drawings)} removed.`);
    if (f.comments > 0)
      lost.push(`${plural(f.comments, "comment line")} ${be(f.comments)} removed.`);
    if (f.layered > 0)
      lost.push(
        `${plural(f.layered, "sign")} on upper layers ${f.layered === 1 ? "becomes an ordinary cue" : "become ordinary cues"} and may show together with the dialogue.`,
      );
  }
  if (doc.format === "vtt") {
    if (f.positioned > 0)
      lost.push(
        `Position and alignment settings on ${plural(f.positioned, "cue")} are removed${
          rich && tops > 0 ? "; cues at the top stay at the top" : ""
        }.`,
      );
    if (f.voices > 0)
      lost.push(
        `Speaker names from voice tags on ${plural(f.voices, "cue")} are removed; the words stay.`,
      );
    if (f.spans > 0)
      lost.push(
        `Class, ruby and word-timing tags on ${plural(f.spans, "cue")} are removed; the words stay.`,
      );
    if (f.blocks > 0)
      lost.push(`${plural(f.blocks, "STYLE, REGION or NOTE block")} ${be(f.blocks)} removed.`);
  }
  if (doc.format === "srt") {
    if (f.fonts > 0)
      lost.push(`Font colour and face tags on ${plural(f.fonts, "cue")} are removed.`);
    if (f.coords > 0) lost.push(`Screen coordinates on ${plural(f.coords, "cue")} are removed.`);
  }
  if (rich && emphasis > 0) kept.push("Italic, bold and underline are kept.");
  if (rich && tops > 0) kept.push("Cues at the top of the picture stay at the top.");
  if (to === "ass")
    kept.push(
      "Written with one default style: Arial, white text with a black outline, bottom centre. Times are rounded to hundredths of a second, the precision ASS stores.",
    );
  return { lost, kept };
}

/** The cue count, first start and last end, for the file card and the result line. */
export function docSummary(doc: SubtitleDoc) {
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  for (const c of doc.cues) {
    first = Math.min(first, c.start);
    last = Math.max(last, c.end);
  }
  return { cues: doc.cues.length, first: Number.isFinite(first) ? first : 0, last };
}
