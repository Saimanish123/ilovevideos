/**
 * Options for the subtitle utilities and the one pipeline every page runs: read → re-time for a
 * frame rate → shift → fix → write. Pure, so the panel's before/after preview and the worker produce
 * exactly the same cues.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import {
  formatExtensions,
  formatNames,
  type SubtitleDoc,
  type SubtitleFormat,
  subtitleFormats,
  writeSubtitles,
} from "../subtitles";
import {
  changeFrameRate,
  type FixReport,
  type FrameRateId,
  firstStart,
  fixTiming,
  frameRateIds,
  frameRates,
  type ShiftReport,
  shiftDoc,
} from "../subtitles/timing";

export const jobs = ["convert", "shift", "fix", "fps"] as const;
export type Job = (typeof jobs)[number];

const FrameRate = z.enum(frameRateIds as [FrameRateId, ...FrameRateId[]]);

export const SubtitlesConvertOptions = z.object({
  /** Which page this is; only decides what the panel leads with. */
  job: z.enum(jobs).default("convert"),
  /** The page fixes the output format (pair pages); only changes what the panel offers. */
  lockTarget: z.boolean().optional(),
  /** Output format; "keep" writes the source's own format. */
  to: z.enum(["keep", ...subtitleFormats]).default("keep"),
  /** Move every cue by this many milliseconds (negative = earlier). Ignored when `alignFirst` is set. */
  shiftMs: z.number().int().min(-86_400_000).max(86_400_000).default(0),
  /** Move every cue so the first one starts here (ms). */
  alignFirst: z.number().int().min(0).max(86_400_000).optional(),
  /** Re-time from one frame rate to another. */
  fps: z.object({ from: FrameRate, to: FrameRate }).optional(),
  /** Repair overlaps, order, reversed ends, duplicates and empty cues. */
  fix: z.boolean().default(false),
  /** TXT output only: start time before each line. */
  txtTimes: z.boolean().default(false),
});
export type SubtitlesConvertOptions = z.infer<typeof SubtitlesConvertOptions>;

export const targetOf = (o: SubtitlesConvertOptions, doc: SubtitleDoc): SubtitleFormat =>
  o.to === "keep" ? doc.format : o.to;

/** The shift actually applied: the typed offset, or whatever puts the first cue at `alignFirst`. */
export function effectiveShift(o: SubtitlesConvertOptions, doc: SubtitleDoc): number {
  if (o.alignFirst === undefined) return o.shiftMs;
  const first = firstStart(doc);
  return Number.isFinite(first) ? o.alignFirst - first : 0;
}

export interface EditResult {
  doc: SubtitleDoc;
  shift: number;
  shiftReport?: ShiftReport;
  fixReport?: FixReport;
}

/** Applies the timing edits in a fixed order. The frame rate comes first so a shift is in the new time. */
export function applyEdits(source: SubtitleDoc, o: SubtitlesConvertOptions): EditResult {
  let doc = source;
  if (o.fps && o.fps.from !== o.fps.to) doc = changeFrameRate(doc, o.fps.from, o.fps.to);
  const shift = effectiveShift(o, doc);
  let shiftReport: ShiftReport | undefined;
  if (shift !== 0) {
    const r = shiftDoc(doc, shift);
    doc = r.doc;
    shiftReport = r.report;
  }
  let fixReport: FixReport | undefined;
  if (o.fix) {
    const r = fixTiming(doc);
    doc = r.doc;
    fixReport = r.report;
  }
  return { doc, shift, shiftReport, fixReport };
}

const suffix: Record<Job, string> = {
  convert: "",
  shift: "-shifted",
  fix: "-fixed",
  fps: "-retimed",
};

export function outputName(fileName: string, to: SubtitleFormat, o: SubtitlesConvertOptions) {
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${base}${suffix[o.job]}.${formatExtensions[to]}`;
}

export const writeOutput = (edit: EditResult, to: SubtitleFormat, o: SubtitlesConvertOptions) =>
  writeSubtitles(edit.doc, to, { txtTimes: o.txtTimes });

const ffmpegCodec: Partial<Record<SubtitleFormat, string>> = {
  srt: "srt",
  vtt: "webvtt",
  ass: "ass",
};

/**
 * The same job with ffmpeg, when ffmpeg can do it: format changes (its subtitle encoders), shifts
 * (-itsoffset) and frame-rate re-timing (-itsscale). ffmpeg has no SBV or plain-text writer and no
 * overlap repair, so those return undefined rather than a command that does something else.
 */
export function ffmpegCommand(
  inName: string,
  outName: string,
  to: SubtitleFormat,
  edit: EditResult,
  o: SubtitlesConvertOptions,
): string | undefined {
  const codec = ffmpegCodec[to];
  if (!codec || o.fix) return undefined;
  const args: string[] = ["ffmpeg"];
  if (o.fps && o.fps.from !== o.fps.to)
    args.push("-itsscale", (frameRates[o.fps.from] / frameRates[o.fps.to]).toFixed(6));
  if (edit.shift !== 0) args.push("-itsoffset", (edit.shift / 1000).toFixed(3));
  args.push("-i", shellQuote(inName), "-c:s", codec, shellQuote(outName));
  return args.join(" ");
}

/** "SRT → WebVTT", for meta lines. */
export const conversionLabel = (from: SubtitleFormat, to: SubtitleFormat) =>
  from === to ? formatNames[to] : `${formatNames[from]} → ${formatNames[to]}`;
