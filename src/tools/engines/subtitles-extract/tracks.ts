/**
 * The subtitle tracks of a file and their cues as subtitle files: container detection, the track
 * list for the page, and turning stored cues into SRT, WebVTT or the track's own format through the
 * subtitle library (engines/subtitles), so extracted text is normalised the same way as a converted
 * file. Pure apart from reading the Blob.
 */
import { baseName } from "@/lib/format";
import { EngineError } from "../errors";
import {
  formatExtensions,
  formatMimes,
  parseSubtitles,
  type SubtitleDoc,
  type SubtitleFormat,
  writeSubtitles,
} from "../subtitles";
import { findLanguage } from "../subtitles/languages";
import { assTime, srtTime, vttTime } from "../subtitles/time";
import { extractMp4, readMp4 } from "./isobmff";
import { extractMatroska, readMatroska, stripPrivate } from "./matroska";
import { type ExtractedTrack, isText, type SubtitleTrack, trackTitle } from "./model";
import { BlobReader } from "./reader";

export type Container = "matroska" | "mp4";

export interface TrackList {
  container?: Container;
  tracks: SubtitleTrack[];
  /** An MP4 that keeps its samples in fragments (browser and some camera recordings). */
  fragmented?: boolean;
}

async function containerOf(file: Blob): Promise<Container | undefined> {
  const h = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return "matroska";
  const type = String.fromCharCode(...h.subarray(4, 8));
  if (["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(type)) return "mp4";
  return undefined;
}

/** Every subtitle track, text or not, from the file's header (quick: the media is not read). */
export async function listSubtitleTracks(file: Blob): Promise<TrackList> {
  const container = await containerOf(file);
  if (container === "matroska") {
    const layout = await readMatroska(new BlobReader(file, 1024 * 1024));
    return { container, tracks: layout?.tracks.map(stripPrivate) ?? [] };
  }
  if (container === "mp4") {
    const layout = await readMp4(file);
    return {
      container,
      tracks: layout?.tracks.map(({ timescale: _t, offsetMs: _o, samples: _s, ...t }) => t) ?? [],
      fragmented: layout?.fragmented && layout.tracks.every((t) => t.samples.length === 0),
    };
  }
  return { tracks: [] };
}

/** The cues of the chosen text tracks. `onProgress` gets the share read (0–1). */
export async function extractTracks(
  file: Blob,
  ids: number[] | undefined,
  signal: AbortSignal,
  onProgress: (ratio: number) => void,
): Promise<ExtractedTrack[]> {
  const container = await containerOf(file);
  const reader = new BlobReader(file);
  if (container === "matroska") {
    const layout = await readMatroska(reader);
    if (!layout) return [];
    const want = new Set(
      layout.tracks.filter((t) => isText(t.kind) && (!ids || ids.includes(t.id))).map((t) => t.id),
    );
    return extractMatroska(reader, layout, want, signal, onProgress);
  }
  if (container === "mp4") {
    const layout = await readMp4(file);
    if (!layout) return [];
    if (layout.fragmented && layout.tracks.every((t) => t.samples.length === 0))
      throw new EngineError(
        "unsupported-input",
        "This MP4 is fragmented (as browser and some camera recordings are), so its subtitle cues are not where this tool reads them.",
        "On a computer, ffmpeg reads them: ffmpeg -i video.mp4 -map 0:s:0 subtitles.srt",
      );
    const want = new Set(
      layout.tracks.filter((t) => isText(t.kind) && (!ids || ids.includes(t.id))).map((t) => t.id),
    );
    return extractMp4(reader, layout, want, signal, onProgress);
  }
  return [];
}

export type Target = "srt" | "vtt" | "original";

/** The format a track is written in: SRT, WebVTT, or its own (MP4 timed text has none: SRT). */
export function formatFor(track: SubtitleTrack, target: Target): SubtitleFormat {
  if (target !== "original") return target;
  if (track.kind === "ass") return "ass";
  if (track.kind === "vtt") return "vtt";
  return "srt";
}

/** An SRT body cannot hold a blank line: it would end the cue. */
const oneBlock = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

const STANDARD_EVENTS =
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";

/** The stored cues as a subtitle file in the track's own format, for the library to read. */
export function sourceText(x: ExtractedTrack): string {
  if (x.track.kind === "ass") {
    let header = (x.header ?? "[Script Info]\nScriptType: v4.00+\n")
      .replace(/\r\n?/g, "\n")
      .trimEnd();
    if (!/^\[Events\]/m.test(header)) header += `\n\n[Events]\n${STANDARD_EVENTS}`;
    else if (!/^\[Events\][^[]*^Format:/m.test(header)) header += `\n${STANDARD_EVENTS}`;
    const format = (
      /^\[Events\][^[]*?^Format:\s*(.+)$/m.exec(header)?.[1] ?? STANDARD_EVENTS.slice(8)
    )
      .split(",")
      .map((f) => f.trim().toLowerCase());
    // Matroska stores the fields after ReadOrder in the Format order with Start and End taken out.
    const lines = [...x.cues]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c) => {
        const others = format.filter((f) => f !== "start" && f !== "end");
        const values = splitFields(c.text, others.length);
        const byName = new Map(others.map((f, i) => [f, values[i] ?? ""]));
        const fields = format.map((f) =>
          f === "start" ? assTime(c.start) : f === "end" ? assTime(c.end) : (byName.get(f) ?? ""),
        );
        return `Dialogue: ${fields.join(",")}`;
      });
    // The stored header can go on past [Events] (ffmpeg keeps [Aegisub Extradata] and [Fonts] there):
    // the lines go at the end of the [Events] section, before whatever section follows it.
    const events = header.search(/^\[Events\]/m);
    const next = header.slice(events + 1).search(/^\[[^\]]+\]/m);
    const cut = next < 0 ? header.length : events + 1 + next;
    const head = header.slice(0, cut).trimEnd();
    const tail = header.slice(cut).trim();
    return `${head}\n${lines.join("\n")}\n${tail ? `\n${tail}\n` : ""}`;
  }
  if (x.track.kind === "vtt") {
    const cues = x.cues.map(
      (c) =>
        `${vttTime(c.start)} --> ${vttTime(c.end)}${c.settings ? ` ${c.settings}` : ""}\n${oneBlock(c.text)}`,
    );
    return `WEBVTT\n\n${cues.join("\n\n")}\n`;
  }
  return `${x.cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${oneBlock(c.text)}`)
    .join("\n\n")}\n`;
}

/** Splits at the first `n - 1` commas; the last field (Text) keeps its own commas. */
function splitFields(s: string, n: number): string[] {
  const out: string[] = [];
  let rest = s;
  for (let i = 0; i < n - 1; i++) {
    const at = rest.indexOf(",");
    if (at < 0) break;
    out.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  out.push(rest);
  return out;
}

/** The track read back as a subtitle document; undefined when it holds no cue. */
export function trackDocument(x: ExtractedTrack): SubtitleDoc | undefined {
  if (x.cues.length === 0) return undefined;
  try {
    return parseSubtitles(sourceText(x));
  } catch {
    return undefined;
  }
}

/**
 * The cues by start time for SRT and WebVTT, whose players expect them in order (ffmpeg writes them
 * so too). Stable: cues that start together keep their stored order. ASS kept as ASS keeps its own
 * ReadOrder, where order sets which line draws on top.
 */
export function forFormat(doc: SubtitleDoc, format: SubtitleFormat): SubtitleDoc {
  if (format === "ass") return doc;
  const sorted = doc.cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.start - b.c.start || a.i - b.i)
    .map((x) => x.c);
  return sorted.every((c, i) => c === doc.cues[i]) ? doc : { ...doc, cues: sorted };
}

/** "movie.en.srt", "movie.fr.forced.ass"; players load a file named like this beside the video. */
export function outputNames(
  fileName: string,
  tracks: SubtitleTrack[],
  formats: SubtitleFormat[],
): string[] {
  const seen = new Set<string>();
  return tracks.map((t, i) => {
    const lang = findLanguage(t.language)?.code1 ?? t.language ?? `track${t.index + 1}`;
    const ext = formatExtensions[formats[i] ?? "srt"];
    let stem = `${baseName(fileName)}.${lang}${t.forced ? ".forced" : ""}`;
    for (let n = 2; seen.has(`${stem}.${ext}`); n++)
      stem = `${baseName(fileName)}.${lang}${t.forced ? ".forced" : ""}.${n}`;
    seen.add(`${stem}.${ext}`);
    return `${stem}.${ext}`;
  });
}

export { formatMimes, trackTitle, writeSubtitles };
