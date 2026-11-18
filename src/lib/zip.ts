/**
 * Minimal ZIP writer (store only, no compression). Video and audio are already compressed, so
 * deflate would cost time for no gain. The archive is a Blob composed of the original file Blobs,
 * so the parts are not copied; each part is read once to compute its CRC-32. No dependency.
 * Limits: classic ZIP (no ZIP64), so under 4 GiB in total and under 65,535 entries.
 */

export const ZIP_MAX_BYTES = 0xffff_ffff - 1_048_576;

let table: Uint32Array | undefined;
function crcTable(): Uint32Array {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

export function crc32(bytes: Uint8Array, seed = 0): number {
  const t = crcTable();
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = (t[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function crcOfBlob(blob: Blob, signal?: AbortSignal): Promise<number> {
  let crc = 0;
  const reader = blob.stream().getReader();
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) return crc;
    crc = crc32(value, crc);
  }
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}

export function canZip(entries: ZipEntry[]): boolean {
  const total = entries.reduce((s, e) => s + e.blob.size + 128 + e.name.length * 2, 0);
  return entries.length > 0 && entries.length < 0xffff && total < ZIP_MAX_BYTES;
}

export async function makeZip(
  entries: ZipEntry[],
  opts: { signal?: AbortSignal; date?: Date } = {},
): Promise<Blob> {
  if (!canZip(entries)) throw new Error("Too large for a ZIP archive");
  const enc = new TextEncoder();
  const { date, time } = dosDateTime(opts.date ?? new Date());
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = new Uint8Array(enc.encode(e.name));
    const crc = await crcOfBlob(e.blob, opts.signal);
    const size = e.blob.size;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, e.blob);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    const rec = new Uint8Array(46 + name.length);
    rec.set(new Uint8Array(cd.buffer), 0);
    rec.set(name, 46);
    central.push(rec);
    offset += 30 + name.length + size;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}

/**
 * Makes names unique within one archive, keeping the extension: two inputs called "clip.mov" from
 * different folders become "clip.mp4" and "clip (2).mp4" instead of one overwriting the other.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    let out = name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let n = 2; seen.has(out.toLowerCase()); n++) out = `${base} (${n})${ext}`;
    seen.add(out.toLowerCase());
    return out;
  });
}
