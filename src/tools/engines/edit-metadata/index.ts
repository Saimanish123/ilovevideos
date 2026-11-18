/**
 * Edit metadata (feature I3): title, artist, album, genre, date, comment and cover art, written into
 * the file's own tag block. Nothing is re-muxed: MP4/MOV/M4A get a rebuilt `moov` box (./isobmff),
 * MP3 a rebuilt ID3v2 tag (./id3), FLAC rebuilt metadata blocks (./flac), and the media bytes are the
 * source's, passed through as Blob slices. That keeps what a re-mux would lose: the capture time in
 * the movie header, location atoms, chapters, the MP3 LAME/Xing gapless header. It also means a 4 GB
 * file is written as fast as a small one. Runs on the page (the output is slices of the input File, so
 * nothing is copied into memory) or in the worker; no decoder, no network.
 *
 * mediabunny's own tag writer was measured first (2026-10-01) and rejected for this job: its MP4
 * writer wraps carried-over `udta` atoms in a `data` box (a `loci` location read back as
 * +00.0000+000.0000), its MP3 writer drops the LAME/Xing header (the sound starts 25 ms late and
 * runs 75 ms long), its Matroska tags carry a MOVIE target that ffmpeg reads as "MOVIE/TITLE", and
 * every re-mux stamps the movie header with the time of writing.
 */
import { baseName, shellQuote, withUnit } from "@/lib/format";
import { EngineError } from "../errors";
import { findChild, readBox } from "../mediabunny/movie-header";
import type { Engine, EngineContext, EngineResult } from "../types";
import {
  CREATION_KEY,
  FFMPEG_CREATION_KEY,
  MP4_EPOCH,
  movieCreation,
  newKeyDate,
  retimeHeaders,
} from "./dates";
import {
  type Cover,
  changedFields,
  coverChanges,
  detectTagFormat,
  type EditableTags,
  EditMetadataOptions,
  formatLabels,
  holdsCover,
  type TagField,
  type TagFormat,
  type TagValues,
  unsupportedReason,
} from "./fields";
import { readFlac, readFlacTags, writeFlac } from "./flac";
import { hasId3v1, id3Size, readId3, readId3Tags, updateId3v1, writeId3 } from "./id3";
import {
  editMoov,
  freeBox,
  isFragmented,
  readIsoTags,
  readKeyText,
  rewriteKeyText,
  shiftChunkOffsets,
} from "./isobmff";

export { EditMetadataOptions };

/** Tag bytes built here are always backed by a plain ArrayBuffer (never shared memory). */
const part = (b: Uint8Array): BlobPart => b as Uint8Array<ArrayBuffer>;

const bytesOf = async (blob: Blob, from: number, to: number) =>
  new Uint8Array(await blob.slice(from, to).arrayBuffer());

const unsupported = (message: string, hint?: string) =>
  new EngineError("unsupported-input", message, hint);

async function formatOf(file: Blob): Promise<TagFormat> {
  const head = await bytesOf(file, 0, 16);
  const format = detectTagFormat(head);
  if (!format) throw unsupported(unsupportedReason(head));
  return format;
}

async function locateMoov(file: Blob) {
  const moov = await findChild(file, 0, file.size, "moov");
  if (!moov)
    throw unsupported(
      "This file has no movie header this tool can read.",
      "Check that the file plays; a recording that was cut off before it finished has none.",
    );
  return moov;
}

/** A FLAC file's metadata blocks, read in growing steps (a cover picture can be megabytes). */
async function flacHead(file: Blob) {
  for (let n = 64 * 1024; ; n *= 4) {
    const head = await bytesOf(file, 0, Math.min(file.size, n));
    try {
      return { head, parsed: readFlac(head) };
    } catch {
      if (n >= file.size) throw unsupported("This FLAC file's metadata could not be read.");
    }
  }
}

/** The tags this tool edits, as the file stores them now. */
export async function readEditable(file: Blob): Promise<EditableTags> {
  const format = await formatOf(file);
  if (format === "mp4" || format === "mov") {
    const moov = await locateMoov(file);
    const moovBytes = await bytesOf(file, moov.start, moov.start + moov.size);
    const { values, cover } = readIsoTags(moovBytes);
    const recorded = {
      header: movieCreation(moovBytes),
      key: readKeyText(moovBytes, CREATION_KEY),
    };
    return { format, values, cover, recorded };
  }
  if (format === "mp3") {
    const size = id3Size(await bytesOf(file, 0, 10));
    let tags: { values: TagValues; cover?: Cover } = { values: {} };
    try {
      tags = readId3Tags(readId3(await bytesOf(file, 0, size)));
    } catch (e) {
      throw unsupported(e instanceof Error ? `${e.message}.` : "This MP3's tag could not be read.");
    }
    // A file with only an ID3v1 tag still shows what it says.
    if (file.size >= 128) {
      const tail = await bytesOf(file, file.size - 128, file.size);
      if (hasId3v1(tail)) {
        const field = (at: number, width: number) =>
          new TextDecoder("latin1")
            .decode(tail.subarray(at, at + width))
            .replace(/\0.*$/s, "")
            .trim();
        const v1: TagValues = {
          title: field(3, 30),
          artist: field(33, 30),
          album: field(63, 30),
          date: field(93, 4),
        };
        for (const [k, v] of Object.entries(v1) as [TagField, string][])
          if (v && !tags.values[k]) tags.values[k] = v;
      }
    }
    return { format, ...tags };
  }
  const { parsed } = await flacHead(file);
  return { format, ...readFlacTags(parsed) };
}

export interface WriteResult {
  parts: BlobPart[];
  fields: TagField[];
  coverChanged: boolean;
  format: TagFormat;
  /** Headers whose dates changed, plus 1 when the creation date key did. */
  datesChanged?: number;
  /** The movie header's new creation time, ISO 8601 UTC, when dates were edited. */
  creationIso?: string;
}

/**
 * The file around a rebuilt `moov`: in place when the size is unchanged, using free space after it or
 * leaving free space when smaller, otherwise moving the chunk offsets of media placed after it.
 */
async function placeMoov(
  file: Blob,
  moov: { start: number; size: number },
  old: Uint8Array,
  next: Uint8Array,
): Promise<{ parts: BlobPart[] }> {
  const moovEnd = moov.start + moov.size;
  const delta = next.length - old.length;
  const before = file.slice(0, moov.start);
  if (delta === 0) return { parts: [before, part(next), file.slice(moovEnd)] };
  const after = await readBox(file, moovEnd, file.size);
  if (after && (after.type === "free" || after.type === "skip") && after.size - delta >= 8)
    return {
      parts: [
        before,
        part(next),
        part(freeBox(after.size - delta)),
        file.slice(after.start + after.size),
      ],
    };
  if (delta <= -8)
    return { parts: [before, part(next), part(freeBox(-delta)), file.slice(moovEnd)] };
  if (moovEnd < file.size) {
    if (isFragmented(old))
      throw unsupported(
        "This file is fragmented (as browser and some camera recordings are), so its header cannot be rewritten in place.",
        "Convert it to MP4 first, then edit the converted file.",
      );
    if (!shiftChunkOffsets(next, moovEnd, delta))
      throw unsupported("This file is too large for its header to grow in place.");
  }
  return { parts: [before, part(next), file.slice(moovEnd)] };
}

/** The file with the edit applied, as parts: new tag bytes around slices of the original. */
export async function writeEdited(file: Blob, o: EditMetadataOptions): Promise<WriteResult> {
  const current = await readEditable(file);
  const { format } = current;
  const fields = changedFields(o.set, current.values);
  let cover: Cover | null | undefined;
  if (o.cover === null) cover = current.cover ? null : undefined;
  else if (o.cover) {
    if (!holdsCover(format) && !(o.coverInQuickTime && format === "mov"))
      throw new EngineError(
        "unsupported-output",
        "MOV files have no standard place for cover art.",
        "Convert the video to MP4 first, then add the cover.",
      );
    cover = {
      data: new Uint8Array(await o.cover.blob.arrayBuffer()),
      mime: o.cover.mime,
      width: o.cover.width,
      height: o.cover.height,
    };
  }
  const coverChanged = coverChanges(o.cover, current.cover);
  const dates = o.dates;
  if (dates && format !== "mp4" && format !== "mov")
    throw unsupported(
      `${formatLabels[format]} files have no recording date this tool can change.`,
      "MP4 and MOV files can.",
    );
  if (fields.length === 0 && !coverChanged && !dates)
    return { parts: [file], fields, coverChanged, format };
  const edit = { set: o.set, fields, cover };

  if (format === "mp4" || format === "mov") {
    const moov = await locateMoov(file);
    const moovEnd = moov.start + moov.size;
    const moovBytes = await bytesOf(file, moov.start, moovEnd);
    let datesChanged: number | undefined;
    if (dates) {
      try {
        datesChanged = retimeHeaders(moovBytes, dates);
      } catch (e) {
        throw new EngineError(
          "unsupported-output",
          e instanceof RangeError && e.message === "after 2040"
            ? "This file's headers hold dates up to 6 February 2040 only."
            : "This file's headers cannot hold a date before 1904.",
          "Choose an earlier or later date.",
        );
      }
      const edited = editMoov(moovBytes, {
        ...edit,
        style: format === "mov" ? "quicktime" : "itunes",
      });
      const apple = rewriteKeyText(edited, CREATION_KEY, (old) => newKeyDate(old, dates));
      const ff = rewriteKeyText(apple.moov, FFMPEG_CREATION_KEY, (old) => newKeyDate(old, dates));
      const next = ff.moov;
      datesChanged += (apple.changed ? 1 : 0) + (ff.changed ? 1 : 0);
      const created = movieCreation(moovBytes);
      const creationIso =
        created && created > 0
          ? new Date((created - MP4_EPOCH) * 1000).toISOString().replace(".000Z", "Z")
          : undefined;
      if (fields.length === 0 && !coverChanged && datesChanged === 0)
        return { parts: [file], fields, coverChanged, format, datesChanged, creationIso };
      return {
        ...(await placeMoov(file, moov, moovBytes, next)),
        fields,
        coverChanged,
        format,
        datesChanged,
        creationIso,
      };
    }
    const next = editMoov(moovBytes, { ...edit, style: format === "mov" ? "quicktime" : "itunes" });
    const delta = next.length - moovBytes.length;
    const before = file.slice(0, moov.start);
    if (delta === 0)
      return { parts: [before, part(next), file.slice(moovEnd)], fields, coverChanged, format };
    // Free space right after the header absorbs the change, so no media moves.
    const after = await readBox(file, moovEnd, file.size);
    if (after && (after.type === "free" || after.type === "skip") && after.size - delta >= 8)
      return {
        parts: [
          before,
          part(next),
          part(freeBox(after.size - delta)),
          file.slice(after.start + after.size),
        ],
        fields,
        coverChanged,
        format,
      };
    if (delta <= -8)
      return {
        parts: [before, part(next), part(freeBox(-delta)), file.slice(moovEnd)],
        fields,
        coverChanged,
        format,
      };
    if (moovEnd < file.size) {
      if (isFragmented(moovBytes))
        throw unsupported(
          "This file is fragmented (as browser and some camera recordings are), so its tags cannot be rewritten in place.",
          "Convert it to MP4 first, then edit the tags of the converted file.",
        );
      if (!shiftChunkOffsets(next, moovEnd, delta))
        throw unsupported(
          "This file is too large for its tags to grow in place.",
          "Shorten the new text a little, or remove the cover image.",
        );
    }
    return { parts: [before, part(next), file.slice(moovEnd)], fields, coverChanged, format };
  }

  if (format === "mp3") {
    const size = id3Size(await bytesOf(file, 0, 10));
    const tag = writeId3(readId3(await bytesOf(file, 0, size)), edit);
    if (file.size - size >= 128) {
      const tail = await bytesOf(file, file.size - 128, file.size);
      if (hasId3v1(tail) && fields.length > 0)
        return {
          parts: [part(tag), file.slice(size, file.size - 128), part(updateId3v1(tail, edit))],
          fields,
          coverChanged,
          format,
        };
    }
    return { parts: [part(tag), file.slice(size)], fields, coverChanged, format };
  }

  const { parsed } = await flacHead(file);
  return {
    parts: [part(writeFlac(parsed, edit)), file.slice(parsed.size)],
    fields,
    coverChanged,
    format,
  };
}

const mimeOf = (format: TagFormat, file: File) =>
  file.type ||
  (format === "mov"
    ? "video/quicktime"
    : format === "mp3"
      ? "audio/mpeg"
      : format === "flac"
        ? "audio/flac"
        : /\.m4a$/i.test(file.name)
          ? "audio/mp4"
          : "video/mp4");

/** The same edit as an ffmpeg command (a stream copy with `-metadata`, and the cover as an attached picture). */
export function editCommand(name: string, o: EditMetadataOptions, fields: TagField[]): string {
  const meta = fields
    .map((f) => {
      const key = f === "artist" ? "artist" : f;
      return `-metadata ${key}=${shellQuote(o.set[f]?.trim() ?? "")}`;
    })
    .join(" ");
  const out = shellQuote(`${baseName(name)}-tagged.${name.split(".").pop() ?? "mp4"}`);
  if (o.cover)
    return `ffmpeg -i ${shellQuote(name)} -i ${shellQuote(o.cover.name)} -map 0 -map 1 -c copy -disposition:v:1 attached_pic ${meta} ${out}`.replace(
      /\s+/g,
      " ",
    );
  return `ffmpeg -i ${shellQuote(name)} -map 0 -c copy ${meta} ${out}`.replace(/\s+/g, " ");
}

export async function editMetadata(
  file: File,
  options: EditMetadataOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the tags" });
  let r: WriteResult;
  try {
    r = await writeEdited(file, options);
  } catch (e) {
    if (e instanceof EngineError) throw e;
    throw new EngineError(
      "unsupported-input",
      `The tags could not be rewritten: ${e instanceof Error ? e.message : String(e)}.`,
      "Check that the file plays, or convert it to MP4 first.",
    );
  }
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
  const n = r.fields.length + (r.coverChanged ? 1 : 0);
  if (r.datesChanged !== undefined) {
    const out = shellQuote(`${baseName(file.name)}-redated.${file.name.split(".").pop() ?? "mp4"}`);
    return {
      blob: new Blob(r.parts, { type: mimeOf(r.format, file) }),
      filename: file.name,
      // FFmpeg writes `creation_time` into the movie and track headers on a stream copy.
      ffmpegCommand: r.creationIso
        ? `ffmpeg -i ${shellQuote(file.name)} -map 0 -c copy -metadata creation_time=${r.creationIso} ${out}`
        : undefined,
      meta: `${formatLabels[r.format]} · ${r.datesChanged === 0 ? "no dates changed" : withUnit(r.datesChanged, r.datesChanged === 1 ? "date changed" : "dates changed")} · picture and sound unchanged`,
    };
  }
  return {
    blob: new Blob(r.parts, { type: mimeOf(r.format, file) }),
    filename: file.name,
    ffmpegCommand: editCommand(file.name, options, r.fields),
    // The thumbnail page (it alone sets coverInQuickTime) names what it stored.
    meta:
      options.coverInQuickTime && r.coverChanged && r.fields.length === 0
        ? `${formatLabels[r.format]} · thumbnail stored · picture and sound unchanged`
        : `${formatLabels[r.format]} · ${n === 0 ? "no tags changed" : withUnit(n, n === 1 ? "tag changed" : "tags changed")} · picture and sound unchanged`,
  };
}

export const editMetadataEngine: Engine<EditMetadataOptions> = {
  id: "edit-metadata",
  backends: ["canvas"],
  optionsSchema: EditMetadataOptions,
  async supports(backend) {
    return backend === "canvas" && typeof Blob !== "undefined";
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No file was given.", "Choose a file.");
    return editMetadata(input.file, options, ctx);
  },
};
