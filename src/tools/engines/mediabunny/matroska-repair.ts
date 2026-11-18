/**
 * A Matroska or WebM file cut short (a recording that crashed, a download that stopped). Its Segment
 * and last Cluster claim more bytes than the file has, and mediabunny 1.55.5 then reads no packet at
 * all: a 300 kB cut of a 428 kB MKV gave 0 packets (ffmpeg recovers 70 video and 129 sound packets),
 * and the remux wrote a 148-byte "success" (measured 2026-10-08).
 *
 * The source below reports the file as if it ended cleanly: the cut Cluster's size is set to the
 * blocks it still holds whole, the Segment's to what is left, and the partial element at the end is
 * not reported. Everything else is read from the file as it is. Only files that need it are changed.
 *
 * Reads element headers from the local file; no network access.
 */
import { CustomSource } from "mediabunny";

const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;

interface Header {
  id: number;
  /** Bytes of id plus size field, and the size (-1 for unknown). */
  len: number;
  size: number;
  sizeAt: number;
  sizeWidth: number;
}

function header(b: Uint8Array, at: number): Header | null {
  const first = b[0];
  if (first === undefined || first === 0) return null;
  let idLen = 1;
  while (idLen <= 4 && !(first & (0x80 >> (idLen - 1)))) idLen++;
  if (idLen > 4 || b.length < idLen + 1) return null;
  let id = 0;
  for (let i = 0; i < idLen; i++) id = id * 256 + (b[i] ?? 0);
  const s0 = b[idLen] ?? 0;
  if (s0 === 0) return null;
  let w = 1;
  while (!(s0 & (0x80 >> (w - 1)))) w++;
  if (b.length < idLen + w) return null;
  let size = s0 & (0xff >> w);
  let ones = size === 0xff >> w;
  for (let i = 1; i < w; i++) {
    const v = b[idLen + i] ?? 0;
    size = size * 256 + v;
    if (v !== 0xff) ones = false;
  }
  return { id, len: idLen + w, size: ones ? -1 : size, sizeAt: at + idLen, sizeWidth: w };
}

function sizeBytes(size: number, width: number): Uint8Array {
  const out = new Uint8Array(width);
  let v = size;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] = (out[0] ?? 0) | (0x80 >> (width - 1));
  return out;
}

export interface MatroskaRepair {
  /** Bytes to report: up to the end of the last whole element. */
  size: number;
  /** Size fields rewritten in place. */
  patches: { at: number; bytes: Uint8Array }[];
}

/**
 * How to read a cut-short Matroska file, or null when it is whole (or not Matroska, or its layout
 * is not one this follows). `read(start, end)` returns the file's bytes in that range.
 */
export async function planMatroskaRepair(
  fileSize: number,
  read: (start: number, end: number) => Promise<Uint8Array>,
): Promise<MatroskaRepair | null> {
  const at = async (p: number) => header(await read(p, Math.min(fileSize, p + 12)), p);
  const ebml = await at(0);
  if (ebml?.id !== 0x1a45dfa3 || ebml.size < 0) return null;
  const segStart = ebml.len + ebml.size;
  const seg = await at(segStart);
  if (seg?.id !== SEGMENT) return null;
  const segData = segStart + seg.len;
  if (seg.size >= 0 && segData + seg.size <= fileSize) return null;
  // Walk the Segment's children to the one that runs past the end of the file.
  let p = segData;
  let cut = -1;
  const patches: MatroskaRepair["patches"] = [];
  while (p < fileSize) {
    const h = await at(p);
    if (!h) {
      cut = p;
      break;
    }
    if (h.size < 0) return null; // unknown sizes (live): mediabunny reads those itself
    const end = p + h.len + h.size;
    if (end <= fileSize) {
      p = end;
      continue;
    }
    if (h.id !== CLUSTER) {
      cut = p;
      break;
    }
    // The cut Cluster keeps the blocks it holds whole.
    let q = p + h.len;
    while (q < fileSize) {
      const k = await at(q);
      if (!k || k.size < 0 || q + k.len + k.size > fileSize) break;
      q += k.len + k.size;
    }
    if (q === p + h.len) {
      cut = p;
      break;
    }
    if (q - (p + h.len) >= 2 ** (7 * h.sizeWidth) - 1) return null;
    patches.push({ at: h.sizeAt, bytes: sizeBytes(q - (p + h.len), h.sizeWidth) });
    cut = q;
    break;
  }
  if (cut < 0) cut = Math.min(p, fileSize);
  if (seg.size >= 0) {
    if (cut - segData >= 2 ** (7 * seg.sizeWidth) - 1) return null;
    patches.push({ at: seg.sizeAt, bytes: sizeBytes(cut - segData, seg.sizeWidth) });
  }
  return { size: cut, patches };
}

/** True when the file is Matroska or WebM by name or type. */
export const looksMatroska = (file: File) =>
  /\.(mkv|mka|mk3d|webm)$/i.test(file.name) || /(matroska|webm)/i.test(file.type);

/**
 * A source over a Matroska/WebM file that reads a cut-short file as if it ended cleanly (see
 * above), decided on first use. A whole file reads exactly as it is.
 */
export function matroskaSource(file: File): CustomSource {
  const bytes = async (start: number, end: number) =>
    new Uint8Array(await file.slice(start, end).arrayBuffer());
  let plan: Promise<MatroskaRepair | null> | undefined;
  const repair = () => {
    plan ??= planMatroskaRepair(file.size, bytes).catch(() => null);
    return plan;
  };
  return new CustomSource({
    getSize: async () => (await repair())?.size ?? file.size,
    read: async (start, end) => {
      const r = await repair();
      const out = await bytes(start, end);
      for (const p of r?.patches ?? []) {
        for (let i = 0; i < p.bytes.length; i++) {
          const at = p.at + i - start;
          if (at >= 0 && at < out.length) out[at] = p.bytes[i] ?? 0;
        }
      }
      return out;
    },
    prefetchProfile: "fileSystem",
  });
}
