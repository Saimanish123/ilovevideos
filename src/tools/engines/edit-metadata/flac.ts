/**
 * FLAC tags (RFC 9639 §8): the Vorbis comment block and the front-cover picture block among the
 * metadata blocks after "fLaC". The blocks are rebuilt with the changed comments; STREAMINFO, the
 * seek table (whose offsets count from the first audio frame, so they stay right) and every other
 * block are copied as they are, and the audio frames are not touched. Pure.
 */
import type { Cover, TagField, TagValues } from "./fields";

export interface FlacBlock {
  type: number;
  body: Uint8Array;
}

export interface FlacHead {
  /** Bytes from the start of the file to the first audio frame. */
  size: number;
  blocks: FlacBlock[];
}

const KEYS: Record<TagField, string[]> = {
  title: ["TITLE"],
  artist: ["ARTIST"],
  album: ["ALBUM"],
  genre: ["GENRE"],
  date: ["DATE"],
  comment: ["COMMENT", "DESCRIPTION"],
};
const VORBIS = 4;
const PICTURE = 6;

/** Size of the metadata before the first frame, reading block headers from `head` (grows as needed). */
export function flacHeadSize(head: Uint8Array): number | undefined {
  if (String.fromCharCode(...head.subarray(0, 4)) !== "fLaC") return undefined;
  let at = 4;
  for (;;) {
    if (at + 4 > head.length) return undefined;
    const last = ((head[at] ?? 0) & 0x80) !== 0;
    const len = ((head[at + 1] ?? 0) << 16) | ((head[at + 2] ?? 0) << 8) | (head[at + 3] ?? 0);
    at += 4 + len;
    if (last) return at;
  }
}

export function readFlac(head: Uint8Array): FlacHead {
  const size = flacHeadSize(head);
  if (size === undefined) throw new Error("not a FLAC file");
  const blocks: FlacBlock[] = [];
  for (let at = 4; at < size; ) {
    const type = (head[at] ?? 0) & 0x7f;
    const len = ((head[at + 1] ?? 0) << 16) | ((head[at + 2] ?? 0) << 8) | (head[at + 3] ?? 0);
    blocks.push({ type, body: head.subarray(at + 4, at + 4 + len) });
    at += 4 + len;
  }
  return { size, blocks };
}

const dec = new TextDecoder();
const enc = new TextEncoder();

function comments(block: FlacBlock | undefined): { vendor: Uint8Array; items: string[] } {
  if (!block) return { vendor: new Uint8Array(), items: [] };
  const v = new DataView(block.body.buffer, block.body.byteOffset, block.body.byteLength);
  const vendorLen = v.getUint32(0, true);
  const vendor = block.body.subarray(4, 4 + vendorLen);
  let at = 4 + vendorLen;
  const count = v.getUint32(at, true);
  at += 4;
  const items: string[] = [];
  for (let i = 0; i < count && at + 4 <= block.body.length; i++) {
    const len = v.getUint32(at, true);
    items.push(dec.decode(block.body.subarray(at + 4, at + 4 + len)));
    at += 4 + len;
  }
  return { vendor, items };
}

const keyOf = (item: string) => item.slice(0, Math.max(0, item.indexOf("="))).toUpperCase();

export function readFlacTags(head: FlacHead): { values: TagValues; cover?: Cover } {
  const values: TagValues = {};
  const { items } = comments(head.blocks.find((b) => b.type === VORBIS));
  for (const f of Object.keys(KEYS) as TagField[]) {
    const hit = items.find((i) => KEYS[f].includes(keyOf(i)));
    const v = hit?.slice(hit.indexOf("=") + 1).trim();
    if (v) values[f] = v;
  }
  let cover: Cover | undefined;
  const pics = head.blocks.filter((b) => b.type === PICTURE).map(readPicture);
  const pic = pics.find((p) => p?.kind === 3) ?? pics[0];
  if (pic) cover = { data: pic.data, mime: pic.mime.includes("png") ? "image/png" : "image/jpeg" };
  return { values, cover };
}

function readPicture(b: FlacBlock) {
  try {
    const v = new DataView(b.body.buffer, b.body.byteOffset, b.body.byteLength);
    const kind = v.getUint32(0);
    const mimeLen = v.getUint32(4);
    const mime = String.fromCharCode(...b.body.subarray(8, 8 + mimeLen)).toLowerCase();
    let at = 8 + mimeLen;
    at += 4 + v.getUint32(at); // description
    at += 16; // width, height, depth, colours
    const len = v.getUint32(at);
    return { kind, mime, data: b.body.slice(at + 4, at + 4 + len) };
  } catch {
    return undefined;
  }
}

const le32 = (n: number) => Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24);
const be32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface FlacEdit {
  set: TagValues;
  fields: TagField[];
  cover?: Cover | null;
}

/** New metadata blocks (with "fLaC" in front), to be followed by the file's audio frames. */
export function writeFlac(head: FlacHead, edit: FlacEdit): Uint8Array {
  const vorbis = head.blocks.find((b) => b.type === VORBIS);
  const { vendor, items } = comments(vorbis);
  const drop = new Set(edit.fields.flatMap((f) => KEYS[f]));
  const kept = items.filter((i) => !drop.has(keyOf(i)));
  for (const f of edit.fields) {
    const v = edit.set[f]?.trim();
    const key = KEYS[f][0];
    if (v && key) kept.push(`${key}=${v}`);
  }
  const encoded = kept.map((i) => enc.encode(i));
  const vorbisBody = join([
    le32(vendor.length),
    vendor,
    le32(encoded.length),
    ...encoded.flatMap((e) => [le32(e.length), e]),
  ]);
  const blocks: FlacBlock[] = [];
  let placed = false;
  for (const b of head.blocks) {
    if (b.type === VORBIS) {
      if (!placed) blocks.push({ type: VORBIS, body: vorbisBody });
      placed = true;
    } else if (b.type === PICTURE && edit.cover !== undefined && readPicture(b)?.kind === 3) {
      // the front cover is replaced or removed
    } else blocks.push(b);
  }
  // STREAMINFO must stay first; a new comment block goes right after it.
  if (!placed) blocks.splice(1, 0, { type: VORBIS, body: vorbisBody });
  if (edit.cover) {
    const mime = enc.encode(edit.cover.mime);
    const pic = join([
      be32(3),
      be32(mime.length),
      mime,
      be32(0),
      be32(edit.cover.width ?? 0),
      be32(edit.cover.height ?? 0),
      be32(24),
      be32(0),
      be32(edit.cover.data.length),
      edit.cover.data,
    ]);
    // Before any padding, so the padding stays last.
    const pad = blocks.findIndex((b) => b.type === 1);
    blocks.splice(pad === -1 ? blocks.length : pad, 0, { type: PICTURE, body: pic });
  }
  const parts: Uint8Array[] = [Uint8Array.of(0x66, 0x4c, 0x61, 0x43)];
  blocks.forEach((b, i) => {
    const len = b.body.length;
    if (len > 0xffffff) throw new Error("A FLAC metadata block cannot hold more than 16 MB.");
    parts.push(
      Uint8Array.of(
        (i === blocks.length - 1 ? 0x80 : 0) | b.type,
        len >>> 16,
        (len >>> 8) & 0xff,
        len & 0xff,
      ),
      b.body,
    );
  });
  return join(parts);
}
