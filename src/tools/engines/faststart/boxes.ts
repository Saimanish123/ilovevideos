/**
 * Fast start for MP4 and MOV, done the way qt-faststart does it: the file's index (the `moov` box)
 * moves in front of the media (`mdat`), and every chunk offset in the index (`stco`, `co64`) that
 * points past the new position is shifted by the index's size. No packet is read or rewritten; the
 * media bytes are the same bytes, so every track, tag and chapter survives. Pure and streaming:
 * it reads box headers and the index only, through `read`, so it runs on a File in the browser and
 * on a Buffer in the unit tests. No network access.
 */

export type Read = (offset: number, length: number) => Promise<Uint8Array>;

export interface Box {
  type: string;
  /** Offset of the box's first byte in the file. */
  start: number;
  /** Whole box, header included. */
  size: number;
}

export type Layout =
  /** The index already comes before the media: players can start at once. */
  | { kind: "front"; boxes: Box[] }
  /** The index is after the media: `mdatBytes` of media stand between the start and the index. */
  | { kind: "end"; boxes: Box[]; moov: Box; mdatBytes: number }
  /** Fragmented MP4 (`moof`): streamable by design; nothing to move. */
  | { kind: "fragmented"; boxes: Box[] }
  /** No index at all (a damaged or unfinished recording). */
  | { kind: "no-index"; boxes: Box[] };

const type4 = (b: Uint8Array, at: number) =>
  String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);

/** The file's top-level boxes, from their headers alone. */
export async function topLevelBoxes(read: Read, fileSize: number): Promise<Box[]> {
  const boxes: Box[] = [];
  let at = 0;
  while (at + 8 <= fileSize && boxes.length < 10_000) {
    const h = await read(at, Math.min(16, fileSize - at));
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let size = dv.getUint32(0);
    const type = type4(h, 4);
    if (size === 1) {
      if (h.byteLength < 16) break;
      size = Number(dv.getBigUint64(8));
    } else if (size === 0) {
      size = fileSize - at;
    }
    if (size < 8 || at + size > fileSize) {
      // A truncated last box (an interrupted recording): keep what is readable.
      boxes.push({ type, start: at, size: fileSize - at });
      break;
    }
    boxes.push({ type, start: at, size });
    at += size;
  }
  return boxes;
}

export async function readLayout(read: Read, fileSize: number): Promise<Layout> {
  const boxes = await topLevelBoxes(read, fileSize);
  const moov = boxes.find((b) => b.type === "moov");
  if (boxes.some((b) => b.type === "moof")) return { kind: "fragmented", boxes };
  if (!moov) return { kind: "no-index", boxes };
  const media = boxes.filter((b) => b.type === "mdat" && b.start < moov.start);
  if (media.length === 0) return { kind: "front", boxes };
  return { kind: "end", boxes, moov, mdatBytes: media.reduce((s, b) => s + b.size, 0) };
}

/** Boxes inside which chunk offset tables live. */
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

interface Parsed {
  type: string;
  /** Raw bytes of a leaf box's payload (after its header). */
  payload?: Uint8Array;
  children?: Parsed[];
}

function parseChildren(b: Uint8Array, from: number, to: number): Parsed[] {
  const out: Parsed[] = [];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = from;
  while (at + 8 <= to) {
    let size = dv.getUint32(at);
    const type = type4(b, at + 4);
    let header = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) throw new Error(`Damaged ${type} box in the index.`);
    const body = { from: at + header, to: at + size };
    out.push(
      CONTAINERS.has(type)
        ? { type, children: parseChildren(b, body.from, body.to) }
        : { type, payload: b.subarray(body.from, body.to) },
    );
    at += size;
  }
  return out;
}

/** Shifts offsets in [lo, hi) by `delta`; stco tables whose offsets no longer fit 32 bits become co64. */
function shiftTable(p: Parsed, delta: number, lo: number, hi: number): Parsed {
  if ((p.type !== "stco" && p.type !== "co64") || !p.payload) return p;
  const src = new DataView(p.payload.buffer, p.payload.byteOffset, p.payload.byteLength);
  const count = src.getUint32(4);
  const wide = p.type === "co64";
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = wide ? Number(src.getBigUint64(8 + i * 8)) : src.getUint32(8 + i * 4);
    offsets.push(o >= lo && o < hi ? o + delta : o);
  }
  const needWide = wide || offsets.some((o) => o > 0xffff_ffff);
  const out = new Uint8Array(8 + count * (needWide ? 8 : 4));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, src.getUint32(0)); // version and flags
  dv.setUint32(4, count);
  offsets.forEach((o, i) => {
    if (needWide) dv.setBigUint64(8 + i * 8, BigInt(o));
    else dv.setUint32(8 + i * 4, o);
  });
  return { type: needWide ? "co64" : "stco", payload: out };
}

function mapTables(p: Parsed, fn: (p: Parsed) => Parsed): Parsed {
  if (p.children) return { type: p.type, children: p.children.map((c) => mapTables(c, fn)) };
  return fn(p);
}

const sizeOf = (p: Parsed): number => {
  const body = p.children
    ? p.children.reduce((s, c) => s + sizeOf(c), 0)
    : (p.payload?.byteLength ?? 0);
  return body + 8 > 0xffff_ffff ? body + 16 : body + 8;
};

function write(p: Parsed, out: Uint8Array, at: number): number {
  const size = sizeOf(p);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const large = size > 0xffff_ffff;
  dv.setUint32(at, large ? 1 : size);
  for (let i = 0; i < 4; i++) out[at + 4 + i] = p.type.charCodeAt(i);
  let pos = at + 8;
  if (large) {
    dv.setBigUint64(pos, BigInt(size));
    pos += 8;
  }
  if (p.children) for (const c of p.children) pos = write(c, out, pos);
  else if (p.payload) {
    out.set(p.payload, pos);
    pos += p.payload.byteLength;
  }
  return pos;
}

/** The index with its chunk offsets in [lo, hi) moved by `delta`. */
export function shiftIndex(moov: Uint8Array, delta: number, lo: number, hi: number): Uint8Array {
  const root = parseChildren(moov, 0, moov.byteLength);
  const shifted = root.map((p) => mapTables(p, (t) => shiftTable(t, delta, lo, hi)));
  const total = shifted.reduce((s, p) => s + sizeOf(p), 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of shifted) at = write(p, out, at);
  return out;
}

/** True when an index holds offsets this rewrite does not know how to move (encryption `saio`). */
export function hasForeignOffsets(moov: Uint8Array): boolean {
  let found = false;
  const walk = (list: Parsed[]) => {
    for (const p of list) {
      if (p.type === "saio") found = true;
      if (p.children) walk(p.children);
    }
  };
  walk(parseChildren(moov, 0, moov.byteLength));
  return found;
}

export interface FastStartPlan {
  /** Byte ranges of the source and the new index, in output order. */
  parts: ({ from: number; to: number } | Uint8Array)[];
  /** Size of the index that moved to the front. */
  indexBytes: number;
}

/**
 * The output as source ranges plus the rewritten index: the leading `ftyp` (if any), the index, then
 * everything else in its original order. Offsets that pointed between the insertion point and the
 * old index move by the new index's size; offsets after the old index are unchanged (it was removed
 * there and added before them).
 */
export async function planFastStart(read: Read, fileSize: number): Promise<FastStartPlan | Layout> {
  const layout = await readLayout(read, fileSize);
  if (layout.kind !== "end") return layout;
  const { boxes, moov } = layout;
  const first = boxes[0];
  const insert = first?.type === "ftyp" ? first.start + first.size : 0;
  const raw = await read(moov.start, moov.size);
  const header =
    new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0) === 1 ? 16 : 8;
  const body = raw.subarray(header);
  let delta = moov.size;
  let index = body;
  // Converting an stco to co64 grows the index, which moves the media further: repeat until stable.
  for (let i = 0; i < 4; i++) {
    index = shiftIndex(body, delta, insert, moov.start);
    const size = index.byteLength + (index.byteLength + 8 > 0xffff_ffff ? 16 : 8);
    if (size === delta) break;
    delta = size;
  }
  const whole = new Uint8Array(delta);
  write({ type: "moov", payload: index }, whole, 0);
  const parts: FastStartPlan["parts"] = [];
  if (insert > 0) parts.push({ from: 0, to: insert });
  parts.push(whole);
  if (moov.start > insert) parts.push({ from: insert, to: moov.start });
  if (moov.start + moov.size < fileSize) parts.push({ from: moov.start + moov.size, to: fileSize });
  return { parts, indexBytes: delta };
}

export const isPlan = (p: FastStartPlan | Layout): p is FastStartPlan => "parts" in p;
