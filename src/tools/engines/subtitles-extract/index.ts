/**
 * Extract subtitles (feature F4): the soft subtitle tracks of an MKV, WebM, MP4 or MOV file written
 * out as SRT, WebVTT or their own format (ASS stays ASS). Pure text work: the cues are read from the
 * container (./matroska, ./isobmff) and written by the subtitle library, nothing is decoded or
 * encoded. Runs in the engine worker; no network.
 */

import { z } from "zod";
import { shellQuote, withUnit } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { formatNames } from "../subtitles";
import type { Engine, EngineOutputFile } from "../types";
import { isText } from "./model";
import {
  extractTracks,
  forFormat,
  formatFor,
  formatMimes,
  outputNames,
  trackDocument,
  trackTitle,
  writeSubtitles,
} from "./tracks";

export const SubtitlesExtractOptions = z.object({
  /** Track ids to write; every text track when absent (a batch, or nothing chosen yet). */
  tracks: z.array(z.number().int().nonnegative()).optional(),
  format: z.enum(["srt", "vtt", "original"]).default("srt"),
});
export type SubtitlesExtractOptions = z.infer<typeof SubtitlesExtractOptions>;

const ffmpegCodec = { srt: "srt", vtt: "webvtt", ass: "ass", sbv: "srt", txt: "text" } as const;

export const subtitlesExtractEngine: Engine<SubtitlesExtractOptions> = {
  id: "subtitles-extract",
  backends: ["canvas"],
  optionsSchema: SubtitlesExtractOptions,
  async supports(backend) {
    return backend === "canvas" && typeof TextDecoder !== "undefined";
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No file was given.", "Choose a video file.");
    const { file } = input;
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the tracks" });
    let extracted: Awaited<ReturnType<typeof extractTracks>>;
    try {
      extracted = await extractTracks(file, options.tracks, ctx.signal, (ratio) =>
        ctx.onProgress({
          phase: "processing",
          ratio,
          detail: `${Math.round(ratio * 100)}% of the file read`,
        }),
      );
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    }
    const docs = extracted
      .filter((x) => isText(x.track.kind))
      .map((x) => ({ x, doc: trackDocument(x) }))
      .filter(
        (d): d is { x: (typeof extracted)[number]; doc: NonNullable<typeof d.doc> } => !!d.doc,
      );
    if (docs.length === 0)
      throw new EngineError(
        "unsupported-input",
        extracted.length === 0
          ? "This file has no text subtitle track to extract."
          : "The chosen subtitle tracks hold no cues.",
        "Subtitles burned into the picture are part of the video and cannot be taken out as text.",
      );
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the subtitle files" });
    const formats = docs.map(({ x }) => formatFor(x.track, options.format));
    const names = outputNames(
      file.name,
      docs.map(({ x }) => x.track),
      formats,
    );
    const files: EngineOutputFile[] = docs.map(({ x, doc }, i) => {
      const format = formats[i] ?? "srt";
      const text = writeSubtitles(forFormat(doc, format), format);
      return {
        blob: new Blob([text], { type: formatMimes[format] }),
        filename: names[i] ?? `track-${i + 1}.${format}`,
        meta: `${trackTitle(x.track)} · ${withUnit(doc.cues.length.toLocaleString("en"), doc.cues.length === 1 ? "cue" : "cues")} · ${formatNames[format]}`,
      };
    });
    const ffmpegCommand = `ffmpeg -i ${shellQuote(file.name)} ${docs
      .map(({ x }, i) => {
        const f = formats[i] ?? "srt";
        const copy = x.track.kind === "ass" && f === "ass";
        return `-map 0:s:${x.track.index} -c:s ${copy ? "copy" : ffmpegCodec[f]} ${shellQuote(names[i] ?? "")}`;
      })
      .join(" ")}`;
    const cues = docs.reduce((s, d) => s + d.doc.cues.length, 0);
    const first = files[0];
    if (!first) throw new EngineError("internal", "Nothing was written.", "Try again.");
    return {
      blob: first.blob,
      filename: first.filename,
      files: files.length > 1 ? files : undefined,
      ffmpegCommand,
      meta:
        files.length > 1
          ? `${withUnit(files.length, "tracks")} · ${withUnit(cues.toLocaleString("en"), "cues")}`
          : first.meta,
    };
  },
};
