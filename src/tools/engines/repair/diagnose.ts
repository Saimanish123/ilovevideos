/**
 * What is wrong with a video file, read from its structure, not by playing it (ADR-0097). Reads box
 * and element headers and the MP4 sample tables only, in small slices of the Blob; never the media.
 *
 * - MP4/MOV with a complete index (`moov`) whose media stops early: every sample the index lists is
 *   checked against the file's real length, per track, so the result knows exactly what is there.
 * - Fragmented MP4 (browser recorders, some cameras): the last complete fragment.
 * - MP4/MOV without an index (the recording stopped before it was written): diagnosed, not repaired.
 * - Matroska and WebM: the segment's declared size against the file's length.
 *
 * Pure apart from Blob reads; unit-tested on fixtures.
 */

export type Diagnosis =
  | { kind: "intact"; container: RepairContainer }
  | {
      kind: "truncated";
      container: "mp4" | "mov";
      /** Per track: samples listed by the index, and how many lead in complete. */
      tracks: { id: number; type: string; total: number; complete: number }[];
      /** Bytes missing from the end (index offsets past the end of the file). */
      missingBytes: number;
      /** Duration the index states, seconds. */
      statedSec: number;
      /** Seconds that can be kept: the earliest end of a complete lead over the cut tracks. */
      keepSec: number;
    }
  | {
      kind: "fragments-cut";
      container: "mp4" | "mov";
      /** Byte length of the file up to the end of the last complete fragment. */
      keepBytes: number;
      fragments: number;
      completeFragments: number;
    }
  | {
      kind: "no-index";
      container: "mp4" | "mov";
      /** Bytes of media data present without an index. */
      mediaBytes: number;
    }
  | {
      kind: "matroska-cut";
      container: "mkv" | "webm";
      declaredBytes?: number;
      missingBytes?: number;
    }
  | { kind: "unknown"; reason: string };

export type RepairContainer = "mp4" | "mov" | "mkv" | "webm";

const read = async (b: Blob, from: number, to: number) =>
  new Uint8Array(await b.slice(from, Math.min(to, b.size)).arrayBuffer());

const fourcc = (b: Uint8Array, at: number) =>
  String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);

interface TopBox {
  type: string;
  start: number;
  header: number;
  /** Declared size; may run past the end of the file. */
  size: number;
}

/** Top-level boxes, including a last one that runs past the end of the file. */
export async function topBoxes(file: Blob): Promise<TopBox[]> {
  const out: TopBox[] = [];
  for (let at = 0; at + 8 <= file.size && out.length < 100_000; ) {
    const h = await read(file, at, at + 16);
    const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let size = v.getUint32(0);
    let header = 8;
    if (size === 1) {
      if (h.length < 16) break;
      size = Number(v.getBigUint64(8));
      header = 16;
    } else if (size === 0) size = file.size - at;
    const type = fourcc(h, 4);
    if (size < header || !/^[\x20-\x7e©]{4}$/.test(type)) break;
    out.push({ type, start: at, header, size });
    at += size;
  }
  return out;
}

/** Child boxes of a box held in memory. */
function kids(b: Uint8Array, from: number, to: number) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: { type: string; body: number; end: number }[] = [];
  for (let at = from; at + 8 <= to; ) {
    let size = v.getUint32(at);
    let head = 8;
    if (size === 1) {
      size = Number(v.getBigUint64(at + 8));
      head = 16;
    } else if (size === 0) size = to - at;
    if (size < head || at + size > to) break;
    out.push({ type: fourcc(b, at + 4), body: at + head, end: at + size });
    at += size;
  }
  return out;
}

const child = (b: Uint8Array, box: { body: number; end: number }, type: string) =>
  kids(b, box.body, box.end).find((k) => k.type === type);

export interface SampleTable {
  id: number;
  /** Handler: "vide", "soun", … */
  type: string;
  /** Absolute byte offset and size of every sample, in decode order. */
  offsets: number[];
  sizes: number[];
  /** Media timescale and each sample's duration in it (`mdhd`, `stts`). */
  timescale: number;
  durations: number[];
}

/** Every track's samples from a complete `moov` (stsz, stsc, stco/co64). */
export function sampleTables(moov: Uint8Array): SampleTable[] {
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const root = kids(moov, 0, moov.length)[0];
  if (root?.type !== "moov") return [];
  const out: SampleTable[] = [];
  for (const trak of kids(moov, root.body, root.end).filter((k) => k.type === "trak")) {
    const tkhd = child(moov, trak, "tkhd");
    const mdia = child(moov, trak, "mdia");
    const hdlr = mdia && child(moov, mdia, "hdlr");
    const stbl = (() => {
      const minf = mdia && child(moov, mdia, "minf");
      return minf && child(moov, minf, "stbl");
    })();
    if (!tkhd || !hdlr || !stbl) continue;
    const id = v.getUint32(tkhd.body + ((moov[tkhd.body] ?? 0) === 1 ? 20 : 12));
    const type = fourcc(moov, hdlr.body + 8);
    const stsz = child(moov, stbl, "stsz");
    const stsc = child(moov, stbl, "stsc");
    const stco = child(moov, stbl, "stco") ?? child(moov, stbl, "co64");
    if (!stsz || !stsc || !stco) continue;
    const fixed = v.getUint32(stsz.body + 4);
    const count = v.getUint32(stsz.body + 8);
    const sizes = Array.from({ length: count }, (_, i) =>
      fixed !== 0 ? fixed : v.getUint32(stsz.body + 12 + i * 4),
    );
    const wide = stco.end - stco.body > 0 && fourcc(moov, stco.body - 4) === "co64";
    const chunks = v.getUint32(stco.body + 4);
    const chunkAt = (i: number) =>
      wide ? Number(v.getBigUint64(stco.body + 8 + i * 8)) : v.getUint32(stco.body + 8 + i * 4);
    const runs = v.getUint32(stsc.body + 4);
    const runAt = (i: number) => ({
      first: v.getUint32(stsc.body + 8 + i * 12),
      perChunk: v.getUint32(stsc.body + 12 + i * 12),
    });
    const offsets: number[] = [];
    let s = 0;
    for (let r = 0; r < runs && s < count; r++) {
      const run = runAt(r);
      const lastChunk = r + 1 < runs ? runAt(r + 1).first - 1 : chunks;
      for (let c = run.first; c <= lastChunk && s < count; c++) {
        let at = chunkAt(c - 1);
        for (let k = 0; k < run.perChunk && s < count; k++) {
          offsets.push(at);
          at += sizes[s] ?? 0;
          s++;
        }
      }
    }
    const mdhd = child(moov, mdia, "mdhd");
    const timescale = mdhd ? v.getUint32(mdhd.body + ((moov[mdhd.body] ?? 0) === 1 ? 20 : 12)) : 0;
    const stts = child(moov, stbl, "stts");
    const durations: number[] = [];
    if (stts) {
      const runsN = v.getUint32(stts.body + 4);
      for (let r = 0; r < runsN && durations.length < count; r++) {
        const n = v.getUint32(stts.body + 8 + r * 8);
        const d = v.getUint32(stts.body + 12 + r * 8);
        for (let k = 0; k < n && durations.length < count; k++) durations.push(d);
      }
    }
    out.push({ id, type, offsets, sizes: sizes.slice(0, offsets.length), timescale, durations });
  }
  return out;
}

/** How many samples lead in complete: each one's bytes lie inside a file of `size` bytes. */
export function completeLead(t: SampleTable, size: number): number {
  let n = 0;
  while (n < t.offsets.length && (t.offsets[n] ?? 0) + (t.sizes[n] ?? 0) <= size) n++;
  return n;
}

const matroskaId = (h: Uint8Array) =>
  h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3;

/** An EBML variable-size integer: its length and value (all ones = unknown size, as recorders write). */
function vint(b: Uint8Array, at: number): { len: number; value: number; unknown: boolean } {
  const first = b[at] ?? 0;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  let value = first & (0xff >> len);
  let ones = value === 0xff >> len;
  for (let i = 1; i < len; i++) {
    const x = b[at + i] ?? 0;
    value = value * 256 + x;
    if (x !== 0xff) ones = false;
  }
  return { len, value, unknown: ones };
}

export async function diagnose(file: Blob): Promise<Diagnosis> {
  const head = await read(file, 0, 64);
  if (matroskaId(head)) {
    const container = new TextDecoder().decode(head).includes("webm") ? "webm" : "mkv";
    // EBML header element, then the Segment (0x18538067).
    const ebmlSize = vint(head, 4);
    const segAt = 4 + ebmlSize.len + ebmlSize.value;
    const seg = await read(file, segAt, segAt + 12);
    if (!(seg[0] === 0x18 && seg[1] === 0x53 && seg[2] === 0x80 && seg[3] === 0x67))
      return {
        kind: "unknown",
        reason: "The Matroska file has no segment where one should start.",
      };
    const size = vint(seg, 4);
    const declared = segAt + 4 + size.len + size.value;
    if (size.unknown) return { kind: "matroska-cut", container };
    if (declared > file.size)
      return {
        kind: "matroska-cut",
        container,
        declaredBytes: declared,
        missingBytes: declared - file.size,
      };
    return { kind: "intact", container };
  }
  const boxes = await topBoxes(file);
  if (!boxes[0] || !["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(boxes[0].type))
    return { kind: "unknown", reason: "This is not an MP4, MOV, MKV or WebM file." };
  const ftyp = boxes.find((b) => b.type === "ftyp");
  const container =
    ftyp && fourcc(await read(file, ftyp.start + 8, ftyp.start + 12), 0) === "qt  " ? "mov" : "mp4";
  const moov = boxes.find((b) => b.type === "moov");
  const mdats = boxes.filter((b) => b.type === "mdat");
  if (!moov || moov.start + moov.size > file.size) {
    const media = mdats.reduce(
      (s, m) => s + Math.max(0, Math.min(m.size, file.size - m.start) - m.header),
      0,
    );
    return { kind: "no-index", container, mediaBytes: media };
  }
  const moovBytes = await read(file, moov.start, moov.start + moov.size);
  const root = kids(moovBytes, 0, moovBytes.length)[0];
  const fragmented = !!root && kids(moovBytes, root.body, root.end).some((k) => k.type === "mvex");
  if (fragmented) {
    const moofs = boxes.filter((b) => b.type === "moof");
    let keep = moov.start + moov.size;
    let complete = 0;
    for (const m of moofs) {
      const data = boxes.find((b) => b.type === "mdat" && b.start >= m.start + m.size);
      if (!data || data.start + data.size > file.size || m.start + m.size > file.size) break;
      keep = data.start + data.size;
      complete++;
    }
    const last = boxes[boxes.length - 1];
    const cut = !!last && last.start + last.size > file.size;
    if (complete === moofs.length && !cut) return { kind: "intact", container };
    return {
      kind: "fragments-cut",
      container,
      keepBytes: keep,
      fragments: moofs.length,
      completeFragments: complete,
    };
  }
  const tables = sampleTables(moovBytes);
  const tracks = tables.map((t) => ({
    id: t.id,
    type: t.type,
    total: t.offsets.length,
    complete: completeLead(t, file.size),
  }));
  const listedEnd = Math.max(
    0,
    ...tables.map((t) => {
      const i = t.offsets.length - 1;
      return i < 0 ? 0 : (t.offsets[i] ?? 0) + (t.sizes[i] ?? 0);
    }),
  );
  if (tracks.every((t) => t.complete === t.total)) return { kind: "intact", container };
  const mv = kids(moovBytes, root?.body ?? 0, root?.end ?? 0).find((k) => k.type === "mvhd");
  let statedSec = 0;
  if (mv) {
    const dv = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
    const v1 = moovBytes[mv.body] === 1;
    const scale = dv.getUint32(mv.body + (v1 ? 20 : 12));
    const dur = v1 ? Number(dv.getBigUint64(mv.body + 24)) : dv.getUint32(mv.body + 16);
    statedSec = scale > 0 ? dur / scale : 0;
  }
  let keepSec = statedSec;
  for (const t of tables) {
    const lead = completeLead(t, file.size);
    if (lead === t.offsets.length || !(t.timescale > 0)) continue;
    let ticks = 0;
    for (let i = 0; i < lead; i++) ticks += t.durations[i] ?? 0;
    keepSec = Math.min(keepSec, ticks / t.timescale);
  }
  return {
    kind: "truncated",
    container,
    tracks,
    missingBytes: Math.max(0, listedEnd - file.size),
    statedSec,
    keepSec,
  };
}
