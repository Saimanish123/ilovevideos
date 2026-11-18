/**
 * Reads byte ranges of a File or Blob through one moving window, so a forward scan of a large file
 * (Matroska clusters) costs one read per few megabytes instead of one per element. Random reads
 * (MP4 samples) outside the window are served directly. Nothing is kept beyond the window.
 */
export class BlobReader {
  private at = 0;
  private buf = new Uint8Array(0);

  constructor(
    private readonly blob: Blob,
    private readonly chunk = 4 * 1024 * 1024,
  ) {}

  get size(): number {
    return this.blob.size;
  }

  /** `len` bytes from `pos` (fewer at the end of the file). */
  async bytes(pos: number, len: number): Promise<Uint8Array> {
    const end = Math.min(this.blob.size, pos + len);
    if (pos >= this.at && end <= this.at + this.buf.length)
      return this.buf.subarray(pos - this.at, end - this.at);
    if (end - pos > this.chunk / 2)
      return new Uint8Array(await this.blob.slice(pos, end).arrayBuffer());
    this.at = pos;
    this.buf = new Uint8Array(
      await this.blob.slice(pos, Math.min(this.blob.size, pos + this.chunk)).arrayBuffer(),
    );
    return this.buf.subarray(0, end - pos);
  }
}

// ---- EBML (RFC 8794): variable-length IDs and sizes ------------------------------------------

/** A variable-length integer: its value with the length marker removed, or -1 for "unknown size". */
export function readVint(b: Uint8Array, at: number): { value: number; length: number } | undefined {
  const first = b[at];
  if (first === undefined || first === 0) return undefined;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || at + length > b.length) return undefined;
  let value = first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = b[at + i] ?? 0;
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value: allOnes ? -1 : value, length };
}

/** An element ID, marker bits kept (as the specification writes IDs: 0x1A45DFA3). */
export function readId(b: Uint8Array, at: number): { id: number; length: number } | undefined {
  const first = b[at];
  if (first === undefined || first === 0) return undefined;
  let length = 1;
  while (length <= 4 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 4 || at + length > b.length) return undefined;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + (b[at + i] ?? 0);
  return { id, length };
}

export interface Element {
  id: number;
  /** Absolute offsets (in the file, or in the buffer the element was read from). */
  start: number;
  data: number;
  /** undefined for an element of unknown size (a live-written Segment or Cluster). */
  end?: number;
}

/** The element header at `at` of a buffer whose first byte is at file offset `base`. */
export function elementAt(b: Uint8Array, at: number, base = 0): Element | undefined {
  const id = readId(b, at);
  if (!id) return undefined;
  const size = readVint(b, at + id.length);
  if (!size) return undefined;
  const data = at + id.length + size.length;
  return {
    id: id.id,
    start: base + at,
    data: base + data,
    end: size.value < 0 ? undefined : base + data + size.value,
  };
}

/** Children of a fully loaded element body `b[from, to)`, whose first byte is at `base`. */
export function elementsIn(b: Uint8Array, from: number, to: number, base = 0): Element[] {
  const out: Element[] = [];
  for (let at = from; at < to; ) {
    const e = elementAt(b, at, base);
    if (!e || e.end === undefined || e.end - base > to) break;
    out.push(e);
    at = e.end - base;
  }
  return out;
}

export const uintOf = (b: Uint8Array, from: number, to: number) => {
  let v = 0;
  for (let i = from; i < to; i++) v = v * 256 + (b[i] ?? 0);
  return v;
};

export const floatOf = (b: Uint8Array, from: number, to: number) => {
  const view = new DataView(b.buffer, b.byteOffset + from, to - from);
  return to - from === 4 ? view.getFloat32(0) : to - from === 8 ? view.getFloat64(0) : 0;
};

const utf8 = new TextDecoder();
export const stringOf = (b: Uint8Array, from: number, to: number) =>
  utf8.decode(b.subarray(from, to)).replace(/\0+$/, "");
