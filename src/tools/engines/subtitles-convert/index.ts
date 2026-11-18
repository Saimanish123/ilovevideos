/**
 * Subtitle utilities (feature F5): convert between SRT, WebVTT, ASS/SSA, SBV and TXT, shift timing,
 * re-time for a frame rate, and repair overlaps and ordering. Pure text work in the engine worker:
 * no decoder, no network, nothing to probe beyond the ability to run JavaScript.
 */
import { EngineError } from "../errors";
import { formatMimes, parseSubtitles, type SubtitleDoc, SubtitleParseError } from "../subtitles";
import type { Engine } from "../types";
import {
  applyEdits,
  conversionLabel,
  ffmpegCommand,
  outputName,
  SubtitlesConvertOptions,
  targetOf,
  writeOutput,
} from "./options";

/** Turns a parse failure into the stage's error: what happened (with the line), then what to do. */
export function subtitleError(e: unknown): EngineError {
  if (e instanceof SubtitleParseError || (e instanceof Error && e.name === "SubtitleParseError"))
    return new EngineError(
      "unsupported-input",
      e.message,
      "Open the file in a text editor to check it, or choose another subtitle file.",
    );
  if (e instanceof EngineError) return e;
  return new EngineError(
    "internal",
    `The subtitle file could not be read: ${String(e)}`,
    "Try again.",
  );
}

export async function readSubtitleFile(file: File): Promise<SubtitleDoc> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return parseSubtitles(bytes, file.name);
  } catch (e) {
    throw subtitleError(e);
  }
}

export const subtitlesConvertEngine: Engine<SubtitlesConvertOptions> = {
  id: "subtitles-convert",
  backends: ["canvas"],
  optionsSchema: SubtitlesConvertOptions,
  async supports(backend) {
    return backend === "canvas" && typeof TextDecoder !== "undefined";
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No subtitle file was given.", "Choose a file.");
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the subtitles" });
    const doc = await readSubtitleFile(input.file);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    ctx.onProgress({
      phase: "processing",
      ratio: 0.5,
      detail: `Writing ${doc.cues.length.toLocaleString("en")} cues`,
    });
    const to = targetOf(options, doc);
    const edit = applyEdits(doc, options);
    const text = writeOutput(edit, to, options);
    const filename = outputName(input.file.name, to, options);
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Done" });
    const cues = edit.doc.cues.length;
    return {
      blob: new Blob([text], { type: `${formatMimes[to]};charset=utf-8` }),
      filename,
      ffmpegCommand: ffmpegCommand(input.file.name, filename, to, edit, options),
      meta: `${cues.toLocaleString("en")} ${cues === 1 ? "cue" : "cues"} · ${conversionLabel(doc.format, to)} · UTF-8`,
    };
  },
};
