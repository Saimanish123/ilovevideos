/**
 * The tags the edit-metadata tool reads and writes, and how each tag system names them. Pure; shared
 * by the page (form, preview card), the engine and the unit tests.
 *
 * Only these fields change. Everything else a file carries (location, device, capture time, encoder,
 * chapters, lyrics, other pictures) is copied as it is, byte for byte.
 */
import { z } from "zod";
import { DateChange } from "./dates";

export const tagFields = ["title", "artist", "album", "genre", "date", "comment"] as const;
export type TagField = (typeof tagFields)[number];
export type TagValues = Partial<Record<TagField, string>>;

export const fieldLabels: Record<TagField, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  genre: "Genre",
  date: "Date",
  comment: "Comment",
};

/** Longest value accepted per field (tag systems allow more; nothing a player shows needs it). */
export const fieldMax: Record<TagField, number> = {
  title: 250,
  artist: 250,
  album: 250,
  genre: 100,
  date: 10,
  comment: 1000,
};

/** The tag systems this tool rewrites in place. */
export type TagFormat = "mp4" | "mov" | "mp3" | "flac";

export const formatLabels: Record<TagFormat, string> = {
  mp4: "MP4",
  mov: "MOV",
  mp3: "MP3",
  flac: "FLAC",
};

/** MOV (QuickTime) has no standard place for cover art; the others do. */
export const holdsCover = (f: TagFormat) => f !== "mov";

export type CoverMime = "image/jpeg" | "image/png";

export interface Cover {
  data: Uint8Array;
  mime: CoverMime;
  width?: number;
  height?: number;
}

/** What a file says about itself, as far as this tool edits it. */
export interface EditableTags {
  format: TagFormat;
  values: TagValues;
  cover?: Cover;
  /** MP4 and MOV: the movie header's creation time (seconds since 1904, 0 when unset) and Apple's creation date key. */
  recorded?: { header?: number; key?: string };
}

/** "", "1999", "1999-05" or "1999-05-04" (the forms tag systems store). */
export const DATE_PATTERN = /^(\d{4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/;
export const validDate = (s: string) => s === "" || DATE_PATTERN.test(s);

const text = (field: TagField) => z.string().max(fieldMax[field]).optional();

/**
 * Options: only the changes. A field that is absent keeps each file's own value, so a batch can set
 * one album for many files and leave every title alone. An empty string removes the tag. `cover`
 * absent keeps the picture, `null` removes it.
 */
export const EditMetadataOptions = z.object({
  set: z
    .object({
      title: text("title"),
      artist: text("artist"),
      album: text("album"),
      genre: text("genre"),
      date: z.string().refine(validDate, "Use YYYY, YYYY-MM or YYYY-MM-DD").optional(),
      comment: text("comment"),
    })
    .default({}),
  cover: z
    .object({
      name: z.string(),
      blob: z.instanceof(Blob),
      mime: z.enum(["image/jpeg", "image/png"]),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable()
    .optional(),
  /**
   * Write the cover into a MOV as well, as an iTunes item list in `udta` (the change-video-thumbnail
   * page, ADR-0098: macOS Quick Look shows it). The tag page leaves MOV covers alone.
   */
  coverInQuickTime: z.boolean().optional(),
  /** Set or shift the recording date (MP4 and MOV headers and Apple's creation date key, ./dates). */
  dates: DateChange.optional(),
});
export type EditMetadataOptions = z.infer<typeof EditMetadataOptions>;

/** The fields whose value really changes for this file, in form order. */
export function changedFields(set: TagValues, current: TagValues): TagField[] {
  return tagFields.filter((f) => {
    const next = set[f];
    if (next === undefined) return false;
    return next.trim() !== (current[f] ?? "").trim();
  });
}

/** Whether the cover changes: a new picture, or removing one the file has. */
export function coverChanges(cover: EditMetadataOptions["cover"], current?: Cover): boolean {
  if (cover === undefined) return false;
  if (cover === null) return current !== undefined;
  return true;
}

/** Tells the format from the first bytes, not the name. */
export function detectTagFormat(head: Uint8Array): TagFormat | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(0, 3) === "ID3") return "mp3";
  const type = ascii(4, 8);
  if (["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(type)) {
    // QuickTime movies say so in the major brand; every other ISO file (MP4, M4A, M4V, 3GP) is iTunes style.
    return type === "ftyp" && ascii(8, 12) === "qt  " ? "mov" : "mp4";
  }
  // An MP3 without an ID3v2 tag starts on a frame sync (11 set bits) with a valid layer.
  const b0 = head[0] ?? 0;
  const b1 = head[1] ?? 0;
  if (b0 === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0) return "mp3";
  return undefined;
}

/** Why a file cannot be edited here, from the first bytes. */
export function unsupportedReason(head: Uint8Array): string {
  const ascii = String.fromCharCode(...head.subarray(0, 4));
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
    return "MKV and WebM tags cannot be edited here yet. MP4, MOV, M4A, MP3 and FLAC can.";
  if (ascii === "RIFF")
    return "WAV and AVI files cannot be edited here. MP4, MOV, M4A, MP3 and FLAC can.";
  if (ascii === "OggS")
    return "Ogg and Opus files cannot be edited here yet. MP4, MOV, M4A, MP3 and FLAC can.";
  return "This file's tags cannot be edited here. MP4, MOV, M4A, MP3 and FLAC can.";
}

/** Width and height from a PNG or JPEG header, for FLAC's picture block. Undefined when unreadable. */
export function imageSize(data: Uint8Array): { width: number; height: number } | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50)
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (data[0] !== 0xff || data[1] !== 0xd8) return undefined;
  for (let at = 2; at + 9 < data.length; ) {
    if (data[at] !== 0xff) return undefined;
    const marker = data[at + 1] ?? 0;
    const len = view.getUint16(at + 2);
    // SOF0–SOF15 carry the size, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    at += 2 + len;
  }
  return undefined;
}

const list = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/**
 * The edit in words, from the options: "New title and cover; comment removed". Empty when nothing is
 * set. Fields set to the file's own value are not filtered out here (the panel never stores those).
 */
export function describeEdit(o: Pick<EditMetadataOptions, "set" | "cover">): string {
  const set = tagFields.filter((f) => o.set[f] !== undefined);
  const added = set.filter((f) => o.set[f]?.trim()).map((f) => fieldLabels[f].toLowerCase());
  const gone = set.filter((f) => !o.set[f]?.trim()).map((f) => fieldLabels[f].toLowerCase());
  if (o.cover) added.push("cover");
  if (o.cover === null) gone.push("cover");
  const parts = [
    added.length ? `new ${list(added)}` : "",
    gone.length ? `${list(gone)} removed` : "",
  ];
  const s = parts.filter(Boolean).join("; ");
  return s ? `${s[0]?.toUpperCase()}${s.slice(1)}` : "";
}
