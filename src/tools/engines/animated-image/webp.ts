/**
 * Animated WebP muxer (WebP container specification: `VP8X`, `ANIM`, `ANMF`). Each frame is a still
 * WebP bitstream: the `VP8 ` (and `ALPH`, if any) chunks of a still WebP file a canvas encoded, or a
 * raw VP8 key frame from a WebCodecs encoder. Frames are rectangles at even offsets that replace what
 * is under them (no blending, no disposal). Pure: bytes in, byte parts out.
 */

export interface WebpFrame {
  /** Still WebP chunks to embed (`ALPH` then `VP8 `/`VP8L`), whole chunks with headers and padding. */
  chunks: Uint8Array;
  x: number;
  y: number;
  width: number;
  height: number;
  hasAlpha: boolean;
}

const fourcc = (b: Uint8Array, at: number) =>
  String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);

function le(...fields: [number, 1 | 2 | 3 | 4][]): Uint8Array {
  const out = new Uint8Array(fields.reduce((s, [, n]) => s + n, 0));
  let at = 0;
  for (const [x, n] of fields) {
    for (let i = 0; i < n; i++) out[at++] = Math.floor(x / 256 ** i) & 0xff;
  }
  return out;
}

function riffChunk(type: string, ...body: Uint8Array[]): Uint8Array {
  const len = body.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(8 + len + (len & 1));
  for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
  out.set(le([len, 4]), 4);
  let at = 8;
  for (const b of body) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/**
 * The image chunks of a still WebP file (as `canvas.convertToBlob({ type: "image/webp" })` writes):
 * `ALPH` when present, then `VP8 ` or `VP8L`. Throws on anything that is not a still WebP.
 */
export function stillChunks(file: Uint8Array): { chunks: Uint8Array; hasAlpha: boolean } {
  if (fourcc(file, 0) !== "RIFF" || fourcc(file, 8) !== "WEBP") throw new Error("Not a WebP file");
  const keep: Uint8Array[] = [];
  let hasAlpha = false;
  for (let at = 12; at + 8 <= file.length; ) {
    const type = fourcc(file, at);
    const len =
      (file[at + 4] ?? 0) |
      ((file[at + 5] ?? 0) << 8) |
      ((file[at + 6] ?? 0) << 16) |
      ((file[at + 7] ?? 0) * 2 ** 24);
    const end = at + 8 + len + (len & 1);
    if (type === "ANIM" || type === "ANMF") throw new Error("Already animated");
    if (type === "ALPH" || type === "VP8 " || type === "VP8L") {
      keep.push(file.slice(at, Math.min(end, file.length)));
      if (type === "ALPH") hasAlpha = true;
      if (type === "VP8L") hasAlpha = true;
    }
    at = end;
  }
  if (!keep.some((c) => fourcc(c, 0) !== "ALPH")) throw new Error("No image data");
  const chunks = new Uint8Array(keep.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of keep) {
    chunks.set(c, at);
    at += c.length;
  }
  return { chunks, hasAlpha };
}

/** A raw VP8 key frame (a WebCodecs chunk) as a `VP8 ` chunk. */
export function vp8Chunk(keyFrame: Uint8Array): Uint8Array {
  // Key frame: frame tag bit 0 is 0, then the 9d 01 2a start code (RFC 6386 §9.1).
  if (
    (keyFrame[0] ?? 1) & 1 ||
    keyFrame[3] !== 0x9d ||
    keyFrame[4] !== 0x01 ||
    keyFrame[5] !== 0x2a
  )
    throw new Error("Not a VP8 key frame");
  return riffChunk("VP8 ", keyFrame);
}

/**
 * Writes frames as they come. A frame's length is known only when the next one arrives (a frame
 * with no visible change folds into the one before), so each is written one step late, as a Blob.
 * Lengths are rounded to the millisecond on the running total, so the animation lasts as long as the
 * range did.
 */
export class WebpWriter {
  private pending?: WebpFrame & { periods: number };
  private readonly written: Blob[] = [];
  private bytes = 0;
  private elapsed = 0;
  private alpha = false;
  constructor(
    private readonly canvas: { width: number; height: number },
    private readonly fps: number,
    private readonly loop: boolean,
  ) {}

  add(frame: WebpFrame) {
    if (frame.x % 2 || frame.y % 2) throw new Error("Frame offsets must be even");
    this.flush();
    this.pending = { ...frame, periods: 1 };
  }

  extend() {
    if (this.pending) this.pending.periods++;
  }

  get frames() {
    return this.written.length + (this.pending ? 1 : 0);
  }

  private flush() {
    const f = this.pending;
    if (!f) return;
    this.pending = undefined;
    const at = (n: number) => Math.round((n * 1000) / this.fps);
    const ms = Math.min(0xffffff, Math.max(1, at(this.elapsed + f.periods) - at(this.elapsed)));
    this.elapsed += f.periods;
    if (f.hasAlpha) this.alpha = true;
    const c = riffChunk(
      "ANMF",
      le(
        [f.x / 2, 3],
        [f.y / 2, 3],
        [f.width - 1, 3],
        [f.height - 1, 3],
        [ms, 3],
        // Bit 1: do not blend (the rectangle replaces what is under it); bit 0: no disposal.
        [0x02, 1],
      ),
      f.chunks,
    );
    this.bytes += c.length;
    this.written.push(new Blob([c as BlobPart]));
  }

  finish(): Blob {
    this.flush();
    if (!this.written.length) throw new Error("No frames");
    const vp8x = riffChunk(
      "VP8X",
      le(
        [(this.alpha ? 0x10 : 0) | 0x02, 1],
        [0, 3],
        [this.canvas.width - 1, 3],
        [this.canvas.height - 1, 3],
      ),
    );
    // Background colour (white; browsers draw on transparent anyway) and loop count (0 is endless).
    const anim = riffChunk("ANIM", le([0xffffffff, 4], [this.loop ? 0 : 1, 2]));
    const head = new Uint8Array(12);
    head.set([82, 73, 70, 70], 0);
    head.set(le([4 + vp8x.length + anim.length + this.bytes, 4]), 4);
    head.set([87, 69, 66, 80], 8);
    return new Blob([head, vp8x, anim, ...this.written] as BlobPart[], { type: "image/webp" });
  }
}
