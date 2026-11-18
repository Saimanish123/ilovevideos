/**
 * MP3 tags: the ID3v2 tag at the start of the file (versions 2.3 and 2.4) and the 128-byte ID3v1 tag
 * at the end. The ID3v2 tag is rebuilt with the changed frames and every other frame copied as it is;
 * the MPEG audio frames after it, including the LAME/Xing header that carries the gapless timing, are
 * not touched. A file without an ID3v2 tag gets a version 2.3 tag (the most widely read). Pure.
 */
import type { Cover, TagField, TagValues } from "./fields";

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder();

export interface Id3Head {
  /** 3 or 4; undefined when the file has no ID3v2 tag. */
  version?: number;
  /** Bytes of the ID3v2 tag at the start (0 without one). */
  size: number;
  frames: Id3Frame[];
}

export interface Id3Frame {
  id: string;
  /** Frame body, after de-unsynchronisation. */
  data: Uint8Array;
  /** The frame exactly as stored (header included), for copying it unchanged. */
  raw: Uint8Array;
}

const syncsafe = (b: Uint8Array, at: number) =>
  (((b[at] ?? 0) & 0x7f) << 21) |
  (((b[at + 1] ?? 0) & 0x7f) << 14) |
  (((b[at + 2] ?? 0) & 0x7f) << 7) |
  ((b[at + 3] ?? 0) & 0x7f);

const toSyncsafe = (n: number) =>
  Uint8Array.of((n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f);

const u32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

/** Removes unsynchronisation (0xFF 0x00 → 0xFF). */
function deunsync(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    const c = b[i] ?? 0;
    out.push(c);
    if (c === 0xff && b[i + 1] === 0) i++;
  }
  return Uint8Array.from(out);
}

/** Total size of the ID3v2 tag at the start of `head`, from its header (0 when there is none). */
export function id3Size(head: Uint8Array): number {
  if (String.fromCharCode(...head.subarray(0, 3)) !== "ID3") return 0;
  const footer = ((head[5] ?? 0) & 0x10) !== 0;
  return 10 + syncsafe(head, 6) + (footer ? 10 : 0);
}

/** Reads the ID3v2 tag from the start of the file (the first `id3Size` bytes). */
export function readId3(tag: Uint8Array): Id3Head {
  if (String.fromCharCode(...tag.subarray(0, 3)) !== "ID3") return { size: 0, frames: [] };
  const version = tag[3] ?? 0;
  const flags = tag[5] ?? 0;
  const size = id3Size(tag);
  if (version !== 3 && version !== 4)
    throw new Error(`ID3v2.${version} tags cannot be edited here`);
  let body = tag.subarray(10, 10 + syncsafe(tag, 6));
  // Version 2.3 unsynchronises the whole tag; 2.4 marks it per frame (handled below).
  if (version === 3 && flags & 0x80) body = deunsync(body);
  let at = 0;
  if (flags & 0x40) {
    const ext =
      version === 4
        ? syncsafe(body, 0)
        : 4 +
          ((body[0] ?? 0) << 24) +
          ((body[1] ?? 0) << 16) +
          ((body[2] ?? 0) << 8) +
          (body[3] ?? 0);
    at = ext;
  }
  const frames: Id3Frame[] = [];
  while (at + 10 <= body.length) {
    const id = String.fromCharCode(...body.subarray(at, at + 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding
    const len =
      version === 4
        ? syncsafe(body, at + 4)
        : (((body[at + 4] ?? 0) << 24) |
            ((body[at + 5] ?? 0) << 16) |
            ((body[at + 6] ?? 0) << 8) |
            (body[at + 7] ?? 0)) >>>
          0;
    const fflags = body[at + 9] ?? 0;
    if (at + 10 + len > body.length) break;
    let data = body.subarray(at + 10, at + 10 + len);
    if (version === 4 && fflags & 0x02) data = deunsync(data);
    // A 2.4 data length indicator (4 bytes, syncsafe) comes before the body.
    if (version === 4 && fflags & 0x01) data = data.subarray(4);
    frames.push({ id, data, raw: body.subarray(at, at + 10 + len) });
    at += 10 + len;
  }
  return { version, size, frames };
}

/** Text in an ID3 encoding byte's encoding, up to the first terminator. */
function decodeText(encoding: number, b: Uint8Array): string {
  if (encoding === 0) return latin1.decode(cut(b, 1));
  if (encoding === 3) return utf8.decode(cut(b, 1));
  if (encoding === 1 || encoding === 2) {
    let be = encoding === 2;
    let from = 0;
    if (b[0] === 0xff && b[1] === 0xfe) {
      be = false;
      from = 2;
    } else if (b[0] === 0xfe && b[1] === 0xff) {
      be = true;
      from = 2;
    }
    return new TextDecoder(be ? "utf-16be" : "utf-16le").decode(cut(b.subarray(from), 2));
  }
  return "";
}

/** `b` up to its first terminator (one zero byte, or two aligned zero bytes for UTF-16). */
function cut(b: Uint8Array, width: 1 | 2): Uint8Array {
  for (let i = 0; i + width <= b.length; i += width)
    if (b[i] === 0 && (width === 1 || b[i + 1] === 0)) return b.subarray(0, i);
  return b;
}

/** Where the terminator after the text starting at `from` ends (for COMM and APIC descriptions). */
function afterTerminator(b: Uint8Array, from: number, encoding: number): number {
  const width = encoding === 1 || encoding === 2 ? 2 : 1;
  for (let i = from; i + width <= b.length; i += width)
    if (b[i] === 0 && (width === 1 || b[i + 1] === 0)) return i + width;
  return b.length;
}

const TEXT: Record<Exclude<TagField, "comment" | "date">, string> = {
  title: "TIT2",
  artist: "TPE1",
  album: "TALB",
  genre: "TCON",
};
const DATE_FRAMES = ["TDRC", "TYER", "TDAT", "TIME", "TRDA"];

/** "(17)" and "(17)Rock" from version 2.3 genres become the name. */
function genreName(s: string): string {
  const m = /^\((\d+)\)(.*)$/.exec(s);
  if (!m) return s;
  return m[2] || s;
}

export function readId3Tags(head: Id3Head): { values: TagValues; cover?: Cover } {
  const values: TagValues = {};
  let cover: Cover | undefined;
  const text = (id: string) => {
    const f = head.frames.find((x) => x.id === id);
    return f
      ? decodeText(f.data[0] ?? 0, f.data.subarray(1))
          .split("\0")[0]
          ?.trim()
      : undefined;
  };
  for (const [field, id] of Object.entries(TEXT) as [TagField, string][]) {
    const v = text(id);
    if (v) values[field] = field === "genre" ? genreName(v) : v;
  }
  const year = text("TDRC") ?? text("TYER");
  if (year) {
    const dat = text("TDAT");
    values.date =
      year.length === 4 && dat && /^\d{4}$/.test(dat)
        ? `${year}-${dat.slice(2)}-${dat.slice(0, 2)}`
        : year.slice(0, 10);
  }
  const comm = head.frames.find((f) => f.id === "COMM" && commDescription(f) === "");
  if (comm) {
    const e = comm.data[0] ?? 0;
    const v = decodeText(e, comm.data.subarray(afterTerminator(comm.data, 4, e))).trim();
    if (v) values.comment = v;
  }
  const pic =
    head.frames.find((f) => f.id === "APIC" && apicType(f) === 3) ??
    head.frames.find((f) => f.id === "APIC");
  if (pic) {
    const e = pic.data[0] ?? 0;
    const mimeEnd = afterTerminator(pic.data, 1, 0);
    const mime = latin1.decode(pic.data.subarray(1, mimeEnd - 1)).toLowerCase();
    const dataAt = afterTerminator(pic.data, mimeEnd + 1, e);
    const data = pic.data.slice(dataAt);
    if (data.length > 0)
      cover = {
        data,
        mime:
          mime.includes("png") || (data[0] === 0x89 && data[1] === 0x50)
            ? "image/png"
            : "image/jpeg",
      };
  }
  return { values, cover };
}

function commDescription(f: Id3Frame): string {
  const e = f.data[0] ?? 0;
  return decodeText(e, f.data.subarray(4, afterTerminator(f.data, 4, e)));
}

function apicType(f: Id3Frame): number {
  const mimeEnd = afterTerminator(f.data, 1, 0);
  return f.data[mimeEnd] ?? -1;
}

// ---- writing --------------------------------------------------------------------------------

const isLatin1 = (s: string) => [...s].every((c) => (c.codePointAt(0) ?? 0) <= 0xff);

/** Encoding byte and bytes for a string: Latin-1 when it fits, else UTF-8 (2.4) or UTF-16 with a BOM (2.3). */
function encodeText(
  s: string,
  version: number,
  terminate: boolean,
): { enc: number; bytes: Uint8Array } {
  if (isLatin1(s)) {
    const b = Uint8Array.from([...s].map((c) => c.codePointAt(0) ?? 0));
    return { enc: 0, bytes: terminate ? Uint8Array.from([...b, 0]) : b };
  }
  if (version === 4) {
    const b = new TextEncoder().encode(s);
    return { enc: 3, bytes: terminate ? Uint8Array.from([...b, 0]) : b };
  }
  const out = [0xff, 0xfe];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out.push(c & 0xff, c >>> 8);
  }
  if (terminate) out.push(0, 0);
  return { enc: 1, bytes: Uint8Array.from(out) };
}

function frame(id: string, body: Uint8Array, version: number): Uint8Array {
  const out = new Uint8Array(10 + body.length);
  out.set(
    Uint8Array.from(id, (c) => c.charCodeAt(0)),
    0,
  );
  out.set(version === 4 ? toSyncsafe(body.length) : u32(body.length), 4);
  out.set(body, 10);
  return out;
}

function textFrame(id: string, value: string, version: number): Uint8Array {
  const { enc, bytes } = encodeText(value, version, false);
  return frame(id, Uint8Array.from([enc, ...bytes]), version);
}

function commFrame(value: string, version: number): Uint8Array {
  // One encoding for the (empty) description and the text; "und": the language is not known.
  const { enc, bytes } = encodeText(value, version, false);
  const empty = enc === 1 ? [0xff, 0xfe, 0, 0] : enc === 0 || enc === 3 ? [0] : [0, 0];
  return frame("COMM", Uint8Array.from([enc, 0x75, 0x6e, 0x64, ...empty, ...bytes]), version);
}

function apicFrame(cover: Cover, version: number): Uint8Array {
  const mime = Uint8Array.from(cover.mime, (c) => c.charCodeAt(0));
  const head = Uint8Array.from([0, ...mime, 0, 3, 0]); // Latin-1, MIME, front cover, empty description
  const body = new Uint8Array(head.length + cover.data.length);
  body.set(head, 0);
  body.set(cover.data, head.length);
  return frame("APIC", body, version);
}

export interface Id3Edit {
  set: TagValues;
  fields: TagField[];
  cover?: Cover | null;
}

/** A new ID3v2 tag: changed frames replaced, every other frame copied byte for byte. */
export function writeId3(head: Id3Head, edit: Id3Edit): Uint8Array {
  const version = head.version ?? 3;
  const drop = (f: Id3Frame) => {
    for (const field of edit.fields) {
      if (field === "date" && DATE_FRAMES.includes(f.id)) return true;
      if (field === "comment" && f.id === "COMM" && commDescription(f) === "") return true;
      if (field !== "date" && field !== "comment" && TEXT[field] === f.id) return true;
    }
    return edit.cover !== undefined && f.id === "APIC" && apicType(f) === 3;
  };
  const parts: Uint8Array[] = head.frames
    .filter((f) => !drop(f))
    // A 2.4 frame stored unsynchronised is written back as its plain body.
    .map((f) =>
      version === 4 && f.raw.length !== f.data.length + 10 ? frame(f.id, f.data, 4) : f.raw,
    );
  for (const field of edit.fields) {
    const v = edit.set[field]?.trim();
    if (!v) continue;
    if (field === "comment") parts.push(commFrame(v, version));
    else if (field === "date") {
      if (version === 4) parts.push(textFrame("TDRC", v, 4));
      else {
        parts.push(textFrame("TYER", v.slice(0, 4), 3));
        const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(v);
        if (m) parts.push(textFrame("TDAT", `${m[2]}${m[1]}`, 3));
      }
    } else parts.push(textFrame(TEXT[field], v, version));
  }
  if (edit.cover) parts.push(apicFrame(edit.cover, version));
  const size = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(10 + size);
  out.set([0x49, 0x44, 0x33, version, 0, 0], 0);
  out.set(toSyncsafe(size), 6);
  let at = 10;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---- ID3v1 ----------------------------------------------------------------------------------

/** The 128-byte ID3v1 tag at the end of `tail` (the file's last 128 bytes), if there is one. */
export const hasId3v1 = (tail: Uint8Array) =>
  tail.length === 128 && tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47;

/**
 * The ID3v1 tag with the changed fields written too, so the two tags never disagree. Fixed-width
 * Latin-1: longer values are cut, other characters become "?".
 */
export function updateId3v1(tail: Uint8Array, edit: Id3Edit): Uint8Array {
  const out = tail.slice();
  const put = (at: number, width: number, value: string) => {
    out.fill(0, at, at + width);
    const chars = [...value].slice(0, width);
    chars.forEach((c, i) => {
      const code = c.codePointAt(0) ?? 63;
      out[at + i] = code <= 0xff ? code : 63;
    });
  };
  const v = (f: TagField) => edit.set[f]?.trim() ?? "";
  for (const f of edit.fields) {
    if (f === "title") put(3, 30, v(f));
    else if (f === "artist") put(33, 30, v(f));
    else if (f === "album") put(63, 30, v(f));
    else if (f === "date") put(93, 4, v(f).slice(0, 4));
    // Version 1.1 keeps a track number in the last two comment bytes.
    else if (f === "comment") put(97, out[125] === 0 && out[126] !== 0 ? 28 : 30, v(f));
  }
  return out;
}
