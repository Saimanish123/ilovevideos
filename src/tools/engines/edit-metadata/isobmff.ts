/**
 * Tags of MP4, M4A, M4V and MOV files, read and rewritten in place (ISO/IEC 14496-12 boxes, Apple's
 * `ilst` item list and QuickTime `udta` text atoms). Only the `moov` box is rebuilt: its `udta` gets
 * the new values and every chunk offset that points past it moves by the size change. The media data
 * is never read or copied; the output is the old file's bytes around a new `moov`. Pure: bytes in,
 * bytes out, no DOM and no mediabunny.
 *
 * Where each field lives:
 * - iTunes style (MP4, M4A, M4V; what ffmpeg and Apple write): `moov/udta/meta(mdir)/ilst/<item>/data`.
 * - QuickTime style (MOV): `moov/udta/©nam` and friends, each a counted string with a language code.
 * - Apple metadata keys (`moov/meta` with a `keys` box, as iPhones write): existing values are updated
 *   so the two places never disagree; no key is added there.
 * A field is updated wherever the file already has it and added to the style's main place otherwise.
 */
import type { Cover, TagField, TagValues } from "./fields";

export interface IsoBox {
  type: string;
  /** Absolute offsets within the buffer the box was read from. */
  start: number;
  header: number;
  end: number;
}

const dec = new TextDecoder();
const enc = new TextEncoder();

/** The type as a string; `©` (0xA9) maps to U+00A9, so "©nam" compares as written. */
const typeAt = (b: Uint8Array, at: number) =>
  String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);

export function childBoxes(b: Uint8Array, from: number, to: number): IsoBox[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: IsoBox[] = [];
  for (let at = from; at + 8 <= to; ) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    out.push({ type: typeAt(b, at + 4), start: at, header, end: at + size });
    at += size;
  }
  return out;
}

const typeBytes = (type: string) => Uint8Array.from(type, (c) => c.charCodeAt(0) & 0xff);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A box from its type and payload (32-bit size; tag boxes are small). */
export function makeBox(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(payload);
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, 8 + body.length);
  head.set(typeBytes(type), 4);
  return concat([head, body]);
}

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};

/** `meta` is a full box in ISO files and a plain one in QuickTime: tell by where `hdlr` sits. */
function metaChildrenStart(b: Uint8Array, meta: IsoBox): number {
  const body = meta.start + meta.header;
  return typeAt(b, body + 4) === "hdlr" ? body : body + 4;
}

// ---- field locations ------------------------------------------------------------------------

/** iTunes `ilst` item types per field; the first is the one written. */
const ITEM: Record<TagField, string[]> = {
  title: ["©nam"],
  artist: ["©ART", "©art"],
  album: ["©alb"],
  genre: ["©gen", "gnre"],
  date: ["©day"],
  comment: ["©cmt"],
};

/** QuickTime `udta` text atoms per field; the first is the one written. */
const ATOM: Record<TagField, string[]> = {
  title: ["©nam"],
  artist: ["©ART", "©aut"],
  album: ["©alb"],
  genre: ["©gen"],
  date: ["©day"],
  comment: ["©cmt"],
};

/** Apple metadata keys per field (the capture date key is left alone: it is not this field). */
const KEY: Partial<Record<TagField, string>> = {
  title: "com.apple.quicktime.title",
  artist: "com.apple.quicktime.artist",
  album: "com.apple.quicktime.album",
  genre: "com.apple.quicktime.genre",
  comment: "com.apple.quicktime.comment",
};

const ID3_GENRES_FIRST = [
  "Blues",
  "Classic Rock",
  "Country",
  "Dance",
  "Disco",
  "Funk",
  "Grunge",
  "Hip-Hop",
  "Jazz",
  "Metal",
  "New Age",
  "Oldies",
  "Other",
  "Pop",
  "R&B",
  "Rap",
  "Reggae",
  "Rock",
  "Techno",
  "Industrial",
];

// ---- reading --------------------------------------------------------------------------------

/** The `data` box of an `ilst` item: its type code and payload. */
function itemData(b: Uint8Array, item: IsoBox): { type: number; payload: Uint8Array } | undefined {
  const data = childBoxes(b, item.start + item.header, item.end).find((c) => c.type === "data");
  if (!data || data.end - data.start < data.header + 8) return undefined;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const type = view.getUint32(data.start + data.header) & 0xffffff;
  return { type, payload: b.subarray(data.start + data.header + 8, data.end) };
}

function itemText(b: Uint8Array, item: IsoBox): string | undefined {
  const d = itemData(b, item);
  if (!d) return undefined;
  if (d.type === 1) return dec.decode(d.payload);
  if (d.type === 2) return new TextDecoder("utf-16be").decode(d.payload);
  // `gnre`: an ID3v1 genre number plus one.
  if (item.type === "gnre" && d.payload.length >= 2) {
    const n = ((d.payload[0] ?? 0) << 8) | (d.payload[1] ?? 0);
    return ID3_GENRES_FIRST[n - 1];
  }
  return undefined;
}

/** A QuickTime text atom: 16-bit length, 16-bit language, then the text. */
function atomText(b: Uint8Array, atom: IsoBox): string | undefined {
  const body = atom.start + atom.header;
  if (atom.end - body < 4) return undefined;
  const len = ((b[body] ?? 0) << 8) | (b[body + 1] ?? 0);
  const lang = ((b[body + 2] ?? 0) << 8) | (b[body + 3] ?? 0);
  const bytes = b.subarray(body + 4, Math.min(atom.end, body + 4 + len));
  // Packed ISO language codes (≥ 0x400) come with UTF-8; old Mac codes with Mac Roman, whose
  // ASCII range is shared, so anything else is shown as Latin-1 rather than guessed.
  return lang >= 0x400 || bytes.every((c) => c < 0x80)
    ? dec.decode(bytes)
    : String.fromCharCode(...bytes);
}

interface MoovMap {
  udta?: IsoBox;
  /** `udta/meta` (iTunes). */
  udtaMeta?: IsoBox;
  ilst?: IsoBox;
  /** `moov/meta` with `keys` (Apple metadata keys). */
  keysMeta?: IsoBox;
  keys?: string[];
  keysIlst?: IsoBox;
}

function mapMoov(b: Uint8Array, moov: IsoBox): MoovMap {
  const out: MoovMap = {};
  for (const c of childBoxes(b, moov.start + moov.header, moov.end)) {
    if (c.type === "udta") {
      out.udta = c;
      const meta = childBoxes(b, c.start + c.header, c.end).find((x) => x.type === "meta");
      if (meta) {
        out.udtaMeta = meta;
        out.ilst = childBoxes(b, metaChildrenStart(b, meta), meta.end).find(
          (x) => x.type === "ilst",
        );
      }
    } else if (c.type === "meta") {
      const kids = childBoxes(b, metaChildrenStart(b, c), c.end);
      const keys = kids.find((x) => x.type === "keys");
      if (keys) {
        out.keysMeta = c;
        out.keys = readKeys(b, keys);
        out.keysIlst = kids.find((x) => x.type === "ilst");
      }
    }
  }
  return out;
}

function readKeys(b: Uint8Array, keys: IsoBox): string[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: string[] = [];
  let at = keys.start + keys.header + 8; // version/flags, entry count
  while (at + 8 <= keys.end) {
    const size = view.getUint32(at);
    if (size < 8 || at + size > keys.end) break;
    out.push(dec.decode(b.subarray(at + 8, at + size)));
    at += size;
  }
  return out;
}

/** The field values and front cover a `moov` box carries. */
export function readIsoTags(moovBytes: Uint8Array): { values: TagValues; cover?: Cover } {
  const b = moovBytes;
  const moov = childBoxes(b, 0, b.length)[0];
  const values: TagValues = {};
  let cover: Cover | undefined;
  if (moov?.type !== "moov") return { values };
  const m = mapMoov(b, moov);
  const set = (f: TagField, v: string | undefined) => {
    if (v?.trim() && values[f] === undefined) values[f] = v.trim();
  };
  if (m.ilst) {
    for (const item of childBoxes(b, m.ilst.start + m.ilst.header, m.ilst.end)) {
      for (const f of Object.keys(ITEM) as TagField[])
        if (ITEM[f].includes(item.type)) set(f, itemText(b, item));
      if (item.type === "covr" && !cover) {
        const d = itemData(b, item);
        if (d && d.payload.length > 0) {
          const png = d.type === 14 || (d.payload[0] === 0x89 && d.payload[1] === 0x50);
          cover = { data: d.payload.slice(), mime: png ? "image/png" : "image/jpeg" };
        }
      }
    }
  }
  if (m.udta) {
    for (const atom of childBoxes(b, m.udta.start + m.udta.header, m.udta.end))
      for (const f of Object.keys(ATOM) as TagField[])
        if (ATOM[f].includes(atom.type)) set(f, atomText(b, atom));
  }
  if (m.keys && m.keysIlst) {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (const item of childBoxes(b, m.keysIlst.start + m.keysIlst.header, m.keysIlst.end)) {
      const key: string | undefined = m.keys[view.getUint32(item.start + 4) - 1];
      for (const [f, k] of Object.entries(KEY) as [TagField, string][])
        if (k === key) set(f, itemText(b, item));
    }
  }
  return { values, cover };
}

// ---- writing --------------------------------------------------------------------------------

const dataBox = (type: number, payload: Uint8Array) =>
  makeBox("data", u32(type & 0xffffff), u32(0), payload);

const textItem = (type: string, value: string) => makeBox(type, dataBox(1, enc.encode(value)));

/** QuickTime text atom with the packed language code for "und" (0x55C4) and UTF-8 text. */
function textAtom(type: string, value: string): Uint8Array {
  const text = enc.encode(value);
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint16(0, text.length);
  new DataView(head.buffer).setUint16(2, 0x55c4);
  return makeBox(type, head, text);
}

/** An empty `meta` for `udta`: full box, handler `mdir` (Apple's metadata directory), empty `ilst`. */
function newItunesMeta(ilst: Uint8Array): Uint8Array {
  const hdlr = makeBox(
    "hdlr",
    u32(0),
    u32(0),
    typeBytes("mdir"),
    typeBytes("appl"),
    u32(0),
    u32(0),
    new Uint8Array(1),
  );
  return makeBox("meta", u32(0), hdlr, ilst);
}

export interface IsoEdit {
  set: TagValues;
  fields: TagField[];
  /** undefined: keep; null: remove; a cover: replace. */
  cover?: Cover | null;
  style: "itunes" | "quicktime";
}

/** Rebuilds a box with some of its children replaced (a map of child start → new bytes, or null to drop). */
function rebuild(
  b: Uint8Array,
  box: IsoBox,
  childrenFrom: number,
  replace: Map<number, Uint8Array | null>,
  append: Uint8Array[] = [],
): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(box.start + box.header, childrenFrom)];
  for (const c of childBoxes(b, childrenFrom, box.end)) {
    const r = replace.get(c.start);
    if (r === null) continue;
    parts.push(r ?? b.subarray(c.start, c.end));
  }
  parts.push(...append);
  const body = concat(parts);
  if (box.header === 16) {
    const head = new Uint8Array(16);
    const v = new DataView(head.buffer);
    v.setUint32(0, 1);
    head.set(typeBytes(box.type), 4);
    v.setBigUint64(8, BigInt(16 + body.length));
    return concat([head, body]);
  }
  return makeBox(box.type, body);
}

function newIlst(b: Uint8Array, ilst: IsoBox | undefined, edit: IsoEdit): Uint8Array {
  const drop = new Set<string>(edit.fields.flatMap((f) => ITEM[f]));
  if (edit.cover !== undefined) drop.add("covr");
  const kept = ilst
    ? childBoxes(b, ilst.start + ilst.header, ilst.end)
        .filter((c) => !drop.has(c.type))
        .map((c) => b.subarray(c.start, c.end))
    : [];
  const added: Uint8Array[] = [];
  for (const f of edit.fields) {
    const v = edit.set[f]?.trim();
    const type = ITEM[f][0];
    if (v && type) added.push(textItem(type, v));
  }
  if (edit.cover)
    added.push(
      makeBox("covr", dataBox(edit.cover.mime === "image/png" ? 14 : 13, edit.cover.data)),
    );
  return makeBox("ilst", ...kept, ...added);
}

/** The new `udta`, or null when there is nothing left in it. */
function newUdta(b: Uint8Array, m: MoovMap, edit: IsoEdit): Uint8Array | null {
  const replace = new Map<number, Uint8Array | null>();
  const append: Uint8Array[] = [];
  const atoms = m.udta ? childBoxes(b, m.udta.start + m.udta.header, m.udta.end) : [];
  // QuickTime atoms: updated where they exist; in the QuickTime style, added where they do not.
  for (const f of edit.fields) {
    const v = edit.set[f]?.trim();
    const existing = atoms.filter((a) => ATOM[f].includes(a.type));
    existing.forEach((a, i) => {
      replace.set(a.start, v && i === 0 ? textAtom(a.type, v) : null);
    });
    const type = ATOM[f][0];
    if (existing.length === 0 && v && type && edit.style === "quicktime")
      append.push(textAtom(type, v));
  }
  // The iTunes item list: always in the iTunes style; in QuickTime files only when already there,
  // or when a cover is written (ADR-0098). An FFmpeg metadata-key list in `udta/meta` (handler
  // mdta) is indexed by key number, so iTunes items cannot go into it.
  if (m.udtaMeta && edit.cover && handlerOf(b, m.udtaMeta) === "mdta")
    throw new Error("this MOV keeps its tags as numbered metadata keys, where a cover cannot go");
  if (m.udtaMeta) {
    const metaStart = metaChildrenStart(b, m.udtaMeta);
    const ilst = newIlst(b, m.ilst, edit);
    const inner = new Map<number, Uint8Array | null>();
    if (m.ilst) inner.set(m.ilst.start, ilst);
    replace.set(m.udtaMeta.start, rebuild(b, m.udtaMeta, metaStart, inner, m.ilst ? [] : [ilst]));
  } else if (edit.style === "itunes" || edit.cover) {
    const ilst = newIlst(b, undefined, edit);
    if (ilst.length > 8) append.push(newItunesMeta(ilst));
  }
  if (!m.udta) return append.length ? makeBox("udta", ...append) : null;
  return rebuild(b, m.udta, m.udta.start + m.udta.header, replace, append);
}

/** The handler type of a `meta` box ("mdir" for iTunes tags, "mdta" for metadata keys). */
function handlerOf(b: Uint8Array, meta: IsoBox): string | undefined {
  const hdlr = childBoxes(b, metaChildrenStart(b, meta), meta.end).find((x) => x.type === "hdlr");
  return hdlr ? typeAt(b, hdlr.start + hdlr.header + 8) : undefined;
}

/** Apple metadata keys: existing values updated (or dropped when cleared); keys are never added. */
function newKeysMeta(b: Uint8Array, m: MoovMap, edit: IsoEdit): Uint8Array | undefined {
  if (!m.keysMeta || !m.keys || !m.keysIlst) return undefined;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const replace = new Map<number, Uint8Array | null>();
  for (const item of childBoxes(b, m.keysIlst.start + m.keysIlst.header, m.keysIlst.end)) {
    const key: string | undefined = m.keys[view.getUint32(item.start + 4) - 1];
    const f = edit.fields.find((x) => KEY[x] === key);
    if (!f) continue;
    const v = edit.set[f]?.trim();
    replace.set(
      item.start,
      v ? makeBox(typeAt(b, item.start + 4), dataBox(1, enc.encode(v))) : null,
    );
  }
  if (replace.size === 0) return undefined;
  const ilst = rebuild(b, m.keysIlst, m.keysIlst.start + m.keysIlst.header, replace);
  return rebuild(
    b,
    m.keysMeta,
    metaChildrenStart(b, m.keysMeta),
    new Map([[m.keysIlst.start, ilst]]),
  );
}

/**
 * Apple metadata key lists (`meta` with `keys` and `ilst`): at `moov/meta`, where iPhones write them,
 * and at `moov/udta/meta`, where FFmpeg writes them (`-movflags use_metadata_tags`).
 */
function keyMetas(b: Uint8Array, moov: IsoBox): { path: IsoBox[]; keys: string[]; ilst: IsoBox }[] {
  const out: { path: IsoBox[]; keys: string[]; ilst: IsoBox }[] = [];
  const look = (meta: IsoBox, path: IsoBox[]) => {
    const kids = childBoxes(b, metaChildrenStart(b, meta), meta.end);
    const keys = kids.find((x) => x.type === "keys");
    const ilst = kids.find((x) => x.type === "ilst");
    if (keys && ilst) out.push({ path: [...path, meta], keys: readKeys(b, keys), ilst });
  };
  for (const c of childBoxes(b, moov.start + moov.header, moov.end)) {
    if (c.type === "meta") look(c, []);
    if (c.type === "udta")
      for (const u of childBoxes(b, c.start + c.header, c.end)) if (u.type === "meta") look(u, [c]);
  }
  return out;
}

/** The text of an Apple metadata key, when the file has it. */
export function readKeyText(moovBytes: Uint8Array, key: string): string | undefined {
  const b = moovBytes;
  const moov = childBoxes(b, 0, b.length)[0];
  if (moov?.type !== "moov") return undefined;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (const { keys, ilst } of keyMetas(b, moov))
    for (const item of childBoxes(b, ilst.start + ilst.header, ilst.end)) {
      if (keys[view.getUint32(item.start + 4) - 1] !== key) continue;
      const d = itemData(b, item);
      if (d?.type === 1) return dec.decode(d.payload);
    }
  return undefined;
}

/**
 * Rewrites the text of an Apple metadata key wherever the file has it (`next` returns the new text,
 * or undefined to keep it). Keys are never added. Returns the new `moov` (chunk offsets not moved;
 * see `shiftChunkOffsets`) and whether anything changed.
 */
export function rewriteKeyText(
  moovBytes: Uint8Array,
  key: string,
  next: (current: string) => string | undefined,
): { moov: Uint8Array; changed: boolean } {
  const b = moovBytes;
  const moov = childBoxes(b, 0, b.length)[0];
  if (moov?.type !== "moov") return { moov: b, changed: false };
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const top = new Map<number, Uint8Array | null>();
  let changed = false;
  for (const { path, keys, ilst } of keyMetas(b, moov)) {
    const items = new Map<number, Uint8Array | null>();
    for (const item of childBoxes(b, ilst.start + ilst.header, ilst.end)) {
      if (keys[view.getUint32(item.start + 4) - 1] !== key) continue;
      const d = itemData(b, item);
      if (d?.type !== 1) continue;
      const old = dec.decode(d.payload);
      const text = next(old);
      if (text === undefined || text === old) continue;
      items.set(item.start, makeBox(typeAt(b, item.start + 4), dataBox(1, enc.encode(text))));
    }
    if (items.size === 0) continue;
    changed = true;
    const meta = path[path.length - 1] as IsoBox;
    const newIlst = rebuild(b, ilst, ilst.start + ilst.header, items);
    let built = rebuild(b, meta, metaChildrenStart(b, meta), new Map([[ilst.start, newIlst]]));
    // Up the path (udta), then into moov.
    for (let i = path.length - 2; i >= 0; i--) {
      const box = path[i] as IsoBox;
      const child = path[i + 1] as IsoBox;
      built = rebuild(b, box, box.start + box.header, new Map([[child.start, built]]));
    }
    top.set((path[0] as IsoBox).start, built);
  }
  if (!changed) return { moov: b, changed };
  return { moov: rebuild(b, moov, moov.start + moov.header, top), changed };
}

/** The rebuilt `moov` with the edit applied; chunk offsets are not moved yet (see `shiftChunkOffsets`). */
export function editMoov(moovBytes: Uint8Array, edit: IsoEdit): Uint8Array {
  const b = moovBytes;
  const moov = childBoxes(b, 0, b.length)[0];
  if (moov?.type !== "moov") throw new Error("not a moov box");
  const m = mapMoov(b, moov);
  const replace = new Map<number, Uint8Array | null>();
  const udta = newUdta(b, m, edit);
  const append: Uint8Array[] = [];
  if (m.udta) replace.set(m.udta.start, udta);
  else if (udta) append.push(udta);
  const keysMeta = newKeysMeta(b, m, edit);
  if (keysMeta && m.keysMeta) replace.set(m.keysMeta.start, keysMeta);
  return rebuild(b, moov, moov.start + moov.header, replace, append);
}

/** True when the movie is fragmented (`mvex`): its fragments may point at absolute offsets. */
export function isFragmented(moovBytes: Uint8Array): boolean {
  const moov = childBoxes(moovBytes, 0, moovBytes.length)[0];
  if (!moov) return false;
  return childBoxes(moovBytes, moov.start + moov.header, moov.end).some((c) => c.type === "mvex");
}

/**
 * Adds `delta` to every `stco`/`co64` chunk offset at or after `from` (file offsets of media placed
 * after the old `moov`), in place. Returns false when a 32-bit offset would overflow.
 */
export function shiftChunkOffsets(moovBytes: Uint8Array, from: number, delta: number): boolean {
  const b = moovBytes;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const walk = (box: IsoBox, path: string[]): boolean => {
    for (const c of childBoxes(b, box.start + box.header, box.end)) {
      if (path.length > 0 && c.type === path[0]) {
        if (!walk(c, path.slice(1))) return false;
      } else if (path.length === 0 && (c.type === "stco" || c.type === "co64")) {
        const count = view.getUint32(c.start + c.header + 4);
        const base = c.start + c.header + 8;
        for (let i = 0; i < count; i++) {
          if (c.type === "stco") {
            const at = base + i * 4;
            if (at + 4 > c.end) break;
            const v = view.getUint32(at);
            if (v < from) continue;
            if (v + delta > 0xffff_ffff || v + delta < 0) return false;
            view.setUint32(at, v + delta);
          } else {
            const at = base + i * 8;
            if (at + 8 > c.end) break;
            const v = view.getBigUint64(at);
            if (v < BigInt(from)) continue;
            view.setBigUint64(at, v + BigInt(delta));
          }
        }
      }
    }
    return true;
  };
  const moov = childBoxes(b, 0, b.length)[0];
  if (!moov) return false;
  for (const trak of childBoxes(b, moov.start + moov.header, moov.end).filter(
    (c) => c.type === "trak",
  ))
    if (!walk(trak, ["mdia", "minf", "stbl"])) return false;
  return true;
}

/** A `free` box of `size` bytes (at least 8), used to keep the media where it was. */
export function freeBox(size: number): Uint8Array {
  const b = new Uint8Array(size);
  new DataView(b.buffer).setUint32(0, size);
  b.set(typeBytes("free"), 4);
  return b;
}
