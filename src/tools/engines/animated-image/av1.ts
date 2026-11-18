/**
 * AV1 bitstream pieces an AVIF writer needs (AV1 spec §5.3 OBU syntax, §5.5 sequence header; AV1
 * in ISOBMFF §2.3 `av1C`). Pure: bytes in, bytes out. WebCodecs gives AV1 chunks as low-overhead
 * OBU streams with no `description`, so the configuration record is built here from the sequence
 * header the first key frame carries.
 */

export const OBU_SEQUENCE_HEADER = 1;
export const OBU_TEMPORAL_DELIMITER = 2;
export const OBU_PADDING = 15;

export interface Obu {
  type: number;
  /** Whole OBU, header included. */
  start: number;
  end: number;
  /** Payload only. */
  payloadStart: number;
}

function leb128(b: Uint8Array, at: number): { value: number; length: number } {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const byte = b[at + i];
    if (byte === undefined) throw new Error("Truncated leb128");
    value += (byte & 0x7f) * 2 ** (7 * i);
    if (!(byte & 0x80)) return { value, length: i + 1 };
  }
  throw new Error("leb128 too long");
}

/** The OBUs of one temporal unit. Every OBU WebCodecs writes carries a size field. */
export function readObus(b: Uint8Array): Obu[] {
  const out: Obu[] = [];
  for (let at = 0; at < b.length; ) {
    const h = b[at] ?? 0;
    const type = (h >> 3) & 0x0f;
    const ext = (h >> 2) & 1;
    const hasSize = (h >> 1) & 1;
    let p = at + 1 + ext;
    let end: number;
    if (hasSize) {
      const s = leb128(b, p);
      p += s.length;
      end = p + s.value;
    } else end = b.length;
    if (end > b.length) throw new Error("Truncated OBU");
    out.push({ type, start: at, end, payloadStart: p });
    at = end;
  }
  return out;
}

/**
 * The sample as ISOBMFF stores it: temporal delimiters and padding removed (AV1 in ISOBMFF §2.4:
 * they should not be in samples; `libavif` and FFmpeg drop them too).
 */
export function stripForSample(b: Uint8Array): Uint8Array {
  const keep = readObus(b).filter(
    (o) => o.type !== OBU_TEMPORAL_DELIMITER && o.type !== OBU_PADDING,
  );
  const len = keep.reduce((s, o) => s + (o.end - o.start), 0);
  if (len === b.length) return b;
  const out = new Uint8Array(len);
  let at = 0;
  for (const o of keep) {
    out.set(b.subarray(o.start, o.end), at);
    at += o.end - o.start;
  }
  return out;
}

/** The sequence header OBU (whole, header included) of a key frame, if it has one. */
export function sequenceHeaderObu(b: Uint8Array): Uint8Array | undefined {
  const o = readObus(b).find((x) => x.type === OBU_SEQUENCE_HEADER);
  return o ? b.slice(o.start, o.end) : undefined;
}

class Bits {
  private pos = 0;
  constructor(
    private readonly b: Uint8Array,
    start: number,
  ) {
    this.pos = start * 8;
  }
  f(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos >> 3];
      if (byte === undefined) throw new Error("Truncated sequence header");
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  uvlc(): number {
    let zeros = 0;
    while (this.f(1) === 0) {
      zeros++;
      if (zeros >= 32) return 2 ** 32 - 1;
    }
    return zeros ? this.f(zeros) + 2 ** zeros - 1 : 0;
  }
}

export interface SequenceHeader {
  profile: number;
  level: number;
  tier: number;
  bitDepth: number;
  mono: boolean;
  subsamplingX: number;
  subsamplingY: number;
  chromaSamplePosition: number;
  maxWidth: number;
  maxHeight: number;
  /** Present when the stream signals it (`color_description_present_flag`). */
  color?: { primaries: number; transfer: number; matrix: number };
  fullRange: boolean;
}

/** Parses a sequence header OBU (whole OBU, header included), AV1 spec §5.5. */
export function parseSequenceHeader(obu: Uint8Array): SequenceHeader {
  const [o] = readObus(obu);
  if (!o || o.type !== OBU_SEQUENCE_HEADER) throw new Error("Not a sequence header");
  const r = new Bits(obu, o.payloadStart);
  const profile = r.f(3);
  r.f(1); // still_picture
  const reduced = r.f(1);
  let level = 0;
  let tier = 0;
  if (reduced) {
    level = r.f(5);
  } else {
    let decoderModel = 0;
    let bufferDelayLength = 0;
    if (r.f(1)) {
      // timing_info
      r.f(32);
      r.f(32);
      if (r.f(1)) r.uvlc();
      decoderModel = r.f(1);
      if (decoderModel) {
        bufferDelayLength = r.f(5) + 1;
        r.f(32);
        r.f(5);
        r.f(5);
      }
    }
    const initialDisplayDelay = r.f(1);
    const ops = r.f(5) + 1;
    for (let i = 0; i < ops; i++) {
      r.f(12);
      const lvl = r.f(5);
      const t = lvl > 7 ? r.f(1) : 0;
      if (i === 0) {
        level = lvl;
        tier = t;
      }
      if (decoderModel && r.f(1)) {
        r.f(bufferDelayLength);
        r.f(bufferDelayLength);
        r.f(1);
      }
      if (initialDisplayDelay && r.f(1)) r.f(4);
    }
  }
  const wBits = r.f(4) + 1;
  const hBits = r.f(4) + 1;
  const maxWidth = r.f(wBits) + 1;
  const maxHeight = r.f(hBits) + 1;
  if (!reduced && r.f(1)) {
    r.f(4);
    r.f(3);
  }
  r.f(1); // use_128x128_superblock
  r.f(1); // enable_filter_intra
  r.f(1); // enable_intra_edge_filter
  if (!reduced) {
    r.f(1); // interintra
    r.f(1); // masked compound
    r.f(1); // warped motion
    r.f(1); // dual filter
    const orderHint = r.f(1);
    if (orderHint) {
      r.f(1);
      r.f(1);
    }
    let forceScreenContent = 2;
    if (!r.f(1)) forceScreenContent = r.f(1);
    if (forceScreenContent > 0 && !r.f(1)) r.f(1);
    if (orderHint) r.f(3);
  }
  r.f(1); // superres
  r.f(1); // cdef
  r.f(1); // restoration
  // color_config
  const highBitDepth = r.f(1);
  let bitDepth = highBitDepth ? 10 : 8;
  if (profile === 2 && highBitDepth) bitDepth = r.f(1) ? 12 : 10;
  const mono = profile === 1 ? false : r.f(1) === 1;
  let color: SequenceHeader["color"];
  if (r.f(1)) color = { primaries: r.f(8), transfer: r.f(8), matrix: r.f(8) };
  let fullRange: boolean;
  let sx = 1;
  let sy = 1;
  let csp = 0;
  if (mono) {
    fullRange = r.f(1) === 1;
  } else if (color && color.primaries === 1 && color.transfer === 13 && color.matrix === 0) {
    fullRange = true;
    sx = 0;
    sy = 0;
  } else {
    fullRange = r.f(1) === 1;
    if (profile === 0) {
      sx = 1;
      sy = 1;
    } else if (profile === 1) {
      sx = 0;
      sy = 0;
    } else if (bitDepth === 12) {
      sx = r.f(1);
      sy = sx ? r.f(1) : 0;
    } else {
      sx = 1;
      sy = 0;
    }
    if (sx && sy) csp = r.f(2);
  }
  return {
    profile,
    level,
    tier,
    bitDepth,
    mono,
    subsamplingX: sx,
    subsamplingY: sy,
    chromaSamplePosition: csp,
    maxWidth,
    maxHeight,
    color,
    fullRange,
  };
}

/** The `av1C` payload (AV1CodecConfigurationRecord) with the sequence header as its config OBU. */
export function av1ConfigRecord(seq: SequenceHeader, seqObu: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + seqObu.length);
  out[0] = 0x81; // marker 1, version 1
  out[1] = ((seq.profile & 7) << 5) | (seq.level & 0x1f);
  out[2] =
    ((seq.tier & 1) << 7) |
    ((seq.bitDepth > 8 ? 1 : 0) << 6) |
    ((seq.bitDepth === 12 ? 1 : 0) << 5) |
    ((seq.mono ? 1 : 0) << 4) |
    ((seq.subsamplingX & 1) << 3) |
    ((seq.subsamplingY & 1) << 2) |
    (seq.chromaSamplePosition & 3);
  out[3] = 0; // no initial presentation delay
  out.set(seqObu, 4);
  return out;
}

/**
 * The smallest AV1 level whose picture size and sample rate fit (AV1 spec Annex A.3), as the
 * `seq_level_idx` and the two-digit form a codec string carries. Above 5.1 it stays 5.1's
 * neighbour 6.0; animated images never get there in practice.
 */
export function av1Level(width: number, height: number, fps: number): number {
  const pixels = width * height;
  const rate = pixels * fps;
  const levels: [number, number, number][] = [
    [0, 147456, 4423680],
    [1, 278784, 8363520],
    [4, 665856, 19975680],
    [5, 1065024, 31950720],
    [8, 2359296, 70778880],
    [9, 2359296, 141557760],
    [12, 8912896, 267386880],
    [13, 8912896, 534773760],
    [14, 8912896, 1069547520],
    [16, 35651584, 1069547520],
  ];
  for (const [idx, maxPixels, maxRate] of levels) {
    if (pixels <= maxPixels && rate <= maxRate) return idx;
  }
  return 16;
}

/** WebCodecs codec string for 8-bit 4:2:0 Main profile at the level these frames need. */
export function av1CodecString(width: number, height: number, fps: number): string {
  return `av01.0.${String(av1Level(width, height, fps)).padStart(2, "0")}M.08`;
}
