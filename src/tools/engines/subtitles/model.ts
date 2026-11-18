/**
 * The subtitle model every parser produces and every serializer reads. Pure; safe on the page and in
 * the worker. Times are whole milliseconds. Cue text is normalised to one small markup so any format
 * can be written from any other: lines separated by "\n", only <i>, <b> and <u> tags, entities
 * decoded to characters. Anything a format carries beyond that (ASS styles and override tags, WebVTT
 * cue settings and voices, SRT colours) is counted in `features` so the page can say what a
 * conversion drops, and kept in `native` so a same-format edit (shift, fix) writes it back unchanged.
 */

export const subtitleFormats = ["srt", "vtt", "ass", "sbv", "txt"] as const;
export type SubtitleFormat = (typeof subtitleFormats)[number];
/** Formats a file can be read from (a plain transcript has no times to read). */
export type ReadableFormat = Exclude<SubtitleFormat, "txt">;

export interface Cue {
  /** Milliseconds from the start of the video. */
  start: number;
  end: number;
  /** Normalised text: "\n" between lines, <i>/<b>/<u> only, entities decoded. */
  text: string;
  /** Top of the picture when the source says so (ASS/SRT {\an7-9}, WebVTT line:0). */
  top?: boolean;
  /** 1-based line of the cue's timing in the source file, for messages ("Line 42: ..."). */
  line: number;
  /** What a same-format write needs to reproduce the cue exactly. */
  native?: NativeCue;
}

export interface NativeCue {
  /** WebVTT cue identifier. */
  id?: string;
  /** WebVTT cue settings ("align:start line:0"). */
  settings?: string;
  /** The cue body exactly as written in the source (SRT/WebVTT/SBV text, ASS Text field). */
  body?: string;
  /** ASS: every Dialogue field in the file's Format order (Start/End are replaced on write). */
  fields?: string[];
  /** SRT: coordinates after the end time ("X1:100 X2:500 Y1:10 Y2:50"). */
  coords?: string;
}

/** Things in the source that a plain cue list cannot hold. Counts, so losses can be stated with numbers. */
export interface Features {
  /** ASS: styles defined in [V4+ Styles]. */
  styles: number;
  /** ASS: cues using override tags beyond italic/bold/underline/alignment (colour, font, position, fades, karaoke). */
  styledCues: number;
  /** ASS: vector drawings ({\p1}), which are not text and are removed from every other format. */
  drawings: number;
  /** ASS: Comment: lines. */
  comments: number;
  /** ASS: cues on a layer above 0 (signs drawn over dialogue). */
  layered: number;
  /** WebVTT: cues with position/size/alignment settings. */
  positioned: number;
  /** WebVTT: <v Speaker> voice spans. */
  voices: number;
  /** WebVTT: <c.class>, <ruby>, <lang> spans and inline timestamps. */
  spans: number;
  /** WebVTT: STYLE, REGION and NOTE blocks. */
  blocks: number;
  /** SRT: <font> colour or face tags. */
  fonts: number;
  /** SRT: X1/X2/Y1/Y2 coordinates after the timing. */
  coords: number;
}

export const noFeatures = (): Features => ({
  styles: 0,
  styledCues: 0,
  drawings: 0,
  comments: 0,
  layered: 0,
  positioned: 0,
  voices: 0,
  spans: 0,
  blocks: 0,
  fonts: 0,
  coords: 0,
});

export interface Extra {
  kind: "ass-comment" | "ass-drawing" | "vtt-note";
  /** 1-based source line, which fixes its place among the cues. */
  line: number;
  /** ASS lines: a cue whose `native.fields` holds the line (times shift with the others). */
  cue?: Cue;
  /** WebVTT NOTE block, verbatim. */
  raw?: string;
}

export type IssueKind =
  | "end-before-start"
  | "zero-length"
  | "overlap"
  | "out-of-order"
  | "duplicate"
  | "empty"
  | "skipped";

/** A problem found while reading, tied to a line of the source. */
export interface Issue {
  kind: IssueKind;
  line: number;
  /** One sentence, starting with "Line N:". */
  message: string;
}

export type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

export interface SubtitleDoc {
  format: ReadableFormat;
  cues: Cue[];
  /**
   * Same-format write data. ASS: everything before the first Dialogue line of [Events] (script info,
   * styles, the Format line). WebVTT: the header block and any STYLE/REGION blocks, verbatim.
   */
  header?: string;
  /** ASS: the Format field names of [Events], lower-case, in file order. */
  eventFormat?: string[];
  /** ASS: sections after [Events] (fonts, extradata), verbatim. */
  footer?: string;
  /**
   * Lines that are not cues but belong to the file: ASS Comment lines and drawing-only Dialogue lines
   * (timed, shifted with the cues), WebVTT NOTE blocks between cues. Written back only by a
   * same-format write, in their original place.
   */
  extras: Extra[];
  features: Features;
  issues: Issue[];
  encoding: Encoding;
  /** The source's line ending, reused for same-format writes. */
  newline: "\n" | "\r\n";
}

/** Thrown when nothing usable can be read. `line` is 1-based when the problem has a place. */
export class SubtitleParseError extends Error {
  readonly line?: number;
  constructor(message: string, line?: number) {
    super(message);
    this.name = "SubtitleParseError";
    this.line = line;
  }
}

export const formatNames: Record<SubtitleFormat, string> = {
  srt: "SRT",
  vtt: "WebVTT",
  ass: "ASS",
  sbv: "SBV",
  txt: "TXT",
};

export const formatExtensions: Record<SubtitleFormat, string> = {
  srt: "srt",
  vtt: "vtt",
  ass: "ass",
  sbv: "sbv",
  txt: "txt",
};

export const formatMimes: Record<SubtitleFormat, string> = {
  srt: "application/x-subrip",
  vtt: "text/vtt",
  ass: "text/x-ssa",
  sbv: "text/plain",
  txt: "text/plain",
};
