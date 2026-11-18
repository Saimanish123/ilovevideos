/**
 * APNG writer (PNG third edition, animation chunks `acTL`, `fcTL`, `fdAT`). Frames are truecolour
 * (8-bit RGB) or indexed (one palette for the whole animation: APNG has a single `PLTE`). Each frame
 * after the first is only the rectangle that changed since the one before, replacing what was there
 * (`blend_op` source, `dispose_op` none); a frame identical to the one before lengthens it instead.
 * Rows get the PNG filter with the smallest sum of absolute values (the libpng heuristic), and
 * deflate is the platform's `CompressionStream("deflate")` (zlib framing, what IDAT holds).
 *
 * Pure apart from `CompressionStream` (in every target browser and in Node).
 */

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

let crcTable: Uint32Array | undefined;
function crc32(parts: Uint8Array[]): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) c = (crcTable[(c ^ (p[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array[] {
  const head = new Uint8Array(8);
  const view = new DataView(head.buffer);
  view.setUint32(0, data.length);
  const t = Uint8Array.from(type, (c) => c.charCodeAt(0));
  head.set(t, 4);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, crc32([t, data]));
  return [head, data, tail];
}

function be(...fields: [number, 1 | 2 | 4][]): Uint8Array {
  const out = new Uint8Array(fields.reduce((s, [, n]) => s + n, 0));
  const v = new DataView(out.buffer);
  let at = 0;
  for (const [x, n] of fields) {
    if (n === 1) v.setUint8(at, x);
    else if (n === 2) v.setUint16(at, x);
    else v.setUint32(at, x);
    at += n;
  }
  return out;
}

export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Filtered scanlines of a `w`×`h` rectangle at (`x`, `y`) of a frame `stride` pixels wide with `bpp`
 * bytes per pixel. Indexed pictures use filter 0 throughout (PNG spec §12.8 recommendation).
 */
export function filterRows(
  px: Uint8Array,
  stride: number,
  bpp: number,
  rect: { x: number; y: number; w: number; h: number },
): Uint8Array {
  const rowBytes = rect.w * bpp;
  const out = new Uint8Array(rect.h * (rowBytes + 1));
  const scratch = new Uint8Array(rowBytes);
  for (let r = 0; r < rect.h; r++) {
    const at = ((rect.y + r) * stride + rect.x) * bpp;
    const row = px.subarray(at, at + rowBytes);
    const dst = r * (rowBytes + 1);
    const best = out.subarray(dst + 1, dst + 1 + rowBytes);
    out[dst] = 0;
    best.set(row);
    if (bpp === 1) continue;
    const prev = r > 0 ? px.subarray(at - stride * bpp, at - stride * bpp + rowBytes) : undefined;
    let bestSum = 0;
    for (let i = 0; i < rowBytes; i++) {
      const v = row[i] ?? 0;
      bestSum += v < 128 ? v : 256 - v;
    }
    for (let f = 1; f < 5; f++) {
      if (f >= 2 && !prev) break;
      let sum = 0;
      let i = 0;
      for (; i < rowBytes; i++) {
        const x = row[i] ?? 0;
        const a = i >= bpp ? (row[i - bpp] ?? 0) : 0;
        const b = prev ? (prev[i] ?? 0) : 0;
        const c = prev && i >= bpp ? (prev[i - bpp] ?? 0) : 0;
        const v =
          f === 1
            ? (x - a) & 0xff
            : f === 2
              ? (x - b) & 0xff
              : f === 3
                ? (x - ((a + b) >> 1)) & 0xff
                : (x - paeth(a, b, c)) & 0xff;
        scratch[i] = v;
        sum += v < 128 ? v : 256 - v;
        if (sum >= bestSum) break;
      }
      if (i === rowBytes && sum < bestSum) {
        bestSum = sum;
        out[dst] = f;
        best.set(scratch);
      }
    }
  }
  return out;
}

/** Bounding box of the pixels that differ between two frames, or undefined when identical. */
export function changedRect(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
  bpp: number,
): { x: number; y: number; w: number; h: number } | undefined {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  const row = width * bpp;
  for (let y = 0; y < height; y++) {
    const base = y * row;
    let first = -1;
    for (let i = 0; i < row; i++) {
      if (a[base + i] !== b[base + i]) {
        first = i;
        break;
      }
    }
    if (first < 0) continue;
    let last = first;
    for (let i = row - 1; i > first; i--) {
      if (a[base + i] !== b[base + i]) {
        last = i;
        break;
      }
    }
    const fx = Math.floor(first / bpp);
    const lx = Math.floor(last / bpp);
    if (fx < x0) x0 = fx;
    if (lx > x1) x1 = lx;
    if (y < y0) y0 = y;
    y1 = y;
  }
  if (x1 < 0) return undefined;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface ApngHeader {
  width: number;
  height: number;
  /** RGB (3) or indexed (1). */
  bpp: 1 | 3;
  /** RGB triples for indexed pictures. */
  palette?: number[][];
  fps: number;
  loop: boolean;
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Writes frames as they come. A frame's length is known only when the next one arrives (identical
 * frames fold into it), so each is written one step late; finished frames are kept as Blobs, which
 * the browser may hold outside the JavaScript heap. `acTL` needs the frame count, so the head is
 * built last and goes first.
 */
export class ApngWriter {
  private seq = 0;
  private count = 0;
  private pending?: { rect: Rect; data: Uint8Array; periods: number };
  private readonly written: Blob[] = [];
  constructor(private readonly h: ApngHeader) {}

  /** A new frame: `data` is the zlib stream of `filterRows` for `rect`. */
  add(rect: Rect, data: Uint8Array) {
    this.flush();
    this.pending = { rect, data, periods: 1 };
  }

  /** The frame on screen stays one more period (the next frame was identical). */
  extend() {
    if (this.pending) this.pending.periods++;
  }

  get frames() {
    return this.count + (this.pending ? 1 : 0);
  }

  private flush() {
    const f = this.pending;
    if (!f) return;
    this.pending = undefined;
    let num = f.periods;
    let den = Math.round(this.h.fps);
    // Both fields are 16-bit: a very long still is written in coarser units.
    while (num > 0xffff) {
      num = Math.round(num / 10);
      den = Math.max(1, Math.round(den / 10));
    }
    const parts = chunk(
      "fcTL",
      be(
        [this.seq++, 4],
        [f.rect.w, 4],
        [f.rect.h, 4],
        [f.rect.x, 4],
        [f.rect.y, 4],
        [num, 2],
        [den, 2],
        [0, 1],
        [0, 1],
      ),
    );
    if (this.count === 0) parts.push(...chunk("IDAT", f.data));
    else {
      const body = new Uint8Array(4 + f.data.length);
      new DataView(body.buffer).setUint32(0, this.seq++);
      body.set(f.data, 4);
      parts.push(...chunk("fdAT", body));
    }
    this.count++;
    this.written.push(new Blob(parts as BlobPart[]));
  }

  /** The finished file. */
  finish(): Blob {
    this.flush();
    if (!this.count) throw new Error("No frames");
    const h = this.h;
    const head: Uint8Array[] = [SIGNATURE];
    head.push(
      ...chunk(
        "IHDR",
        be([h.width, 4], [h.height, 4], [8, 1], [h.bpp === 1 ? 3 : 2, 1], [0, 1], [0, 1], [0, 1]),
      ),
    );
    if (h.bpp === 1) {
      const pal = h.palette ?? [[0, 0, 0]];
      const plte = new Uint8Array(pal.length * 3);
      pal.forEach((c, i) => {
        plte.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0], i * 3);
      });
      head.push(...chunk("PLTE", plte));
    }
    head.push(...chunk("acTL", be([this.count, 4], [h.loop ? 0 : 1, 4])));
    return new Blob(
      [
        ...(head as BlobPart[]),
        ...this.written,
        ...(chunk("IEND", new Uint8Array(0)) as BlobPart[]),
      ],
      { type: "image/apng" },
    );
  }
}

/** RGBA (canvas) → packed RGB. */
export function rgbaToRgb(rgba: Uint8Array | Uint8ClampedArray, out?: Uint8Array): Uint8Array {
  const n = rgba.length >> 2;
  const rgb = out ?? new Uint8Array(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    rgb[j] = rgba[i * 4] ?? 0;
    rgb[j + 1] = rgba[i * 4 + 1] ?? 0;
    rgb[j + 2] = rgba[i * 4 + 2] ?? 0;
  }
  return rgb;
}
