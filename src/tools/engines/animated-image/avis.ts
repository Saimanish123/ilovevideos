/**
 * Animated AVIF writer: an AV1 image sequence in an `avis` file (AVIF v1.1 §7, HEIF ISO/IEC 23008-12
 * image sequences, AV1 in ISOBMFF). Layout `ftyp`, `meta`, `moov`, `mdat`:
 *
 * - `meta` names the first frame as the primary still item, so a reader that does not play
 *   sequences still shows a picture (its data is the first sample, not a copy).
 * - `moov` holds one `pict` track with every frame; looping is the edit list's repeat flag, and an
 *   endless loop has an indefinite track duration (how libavif signals and reads it).
 *
 * Pure: samples in, byte parts out (the caller makes a Blob without joining them).
 */

export interface AvisSample {
  /** AV1 temporal unit without temporal delimiters (`stripForSample`). */
  data: Uint8Array;
  key: boolean;
}

export interface AvisInput {
  width: number;
  height: number;
  /** Media timescale; each sample lasts `durations[i]` ticks of it. */
  timescale: number;
  durations: number[];
  samples: AvisSample[];
  /** `av1C` payload (`av1ConfigRecord`). */
  av1C: Uint8Array;
  /** nclx colour, when known (from the sequence header or the encoder). */
  color?: { primaries: number; transfer: number; matrix: number; fullRange: boolean };
  bitDepth: number;
  /** true loops for ever; false plays once. */
  loop: boolean;
}

const MOVIE_TIMESCALE = 1000;
/** All ones in a 64-bit duration field: "indefinite" (an endless loop). */
const INDEFINITE = -1;

class W {
  parts: number[] = [];
  u8(n: number) {
    this.parts.push(n & 0xff);
    return this;
  }
  u16(n: number) {
    return this.u8(n >> 8).u8(n);
  }
  u32(n: number) {
    return this.u16(Math.floor(n / 65536) & 0xffff).u16(n & 0xffff);
  }
  u64(n: number) {
    if (n === INDEFINITE) return this.u32(0xffffffff).u32(0xffffffff);
    return this.u32(Math.floor(n / 2 ** 32)).u32(n >>> 0);
  }
  str(s: string) {
    for (const c of s) this.u8(c.charCodeAt(0));
    return this;
  }
  bytes(b: Uint8Array) {
    for (const x of b) this.parts.push(x);
    return this;
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.parts.push(0);
    return this;
  }
  done() {
    return Uint8Array.from(this.parts);
  }
}

function box(type: string, ...body: Uint8Array[]): Uint8Array {
  const len = 8 + body.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(len);
  new DataView(out.buffer).setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let at = 8;
  for (const b of body) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

const full = (type: string, version: number, flags: number, ...body: Uint8Array[]) =>
  box(
    type,
    new W()
      .u8(version)
      .u8(flags >> 16)
      .u16(flags & 0xffff)
      .done(),
    ...body,
  );

const MATRIX = new W()
  .u32(0x00010000)
  .u32(0)
  .u32(0)
  .u32(0)
  .u32(0x00010000)
  .u32(0)
  .u32(0)
  .u32(0)
  .u32(0x40000000)
  .done();

function hdlr(): Uint8Array {
  return full("hdlr", 0, 0, new W().u32(0).str("pict").zeros(12).u8(0).done());
}

function colr(c: NonNullable<AvisInput["color"]>): Uint8Array {
  return box(
    "colr",
    new W()
      .str("nclx")
      .u16(c.primaries)
      .u16(c.transfer)
      .u16(c.matrix)
      .u8(c.fullRange ? 0x80 : 0)
      .done(),
  );
}

function meta(o: AvisInput, firstOffset: number): Uint8Array {
  const first = o.samples[0];
  const props = [
    full("ispe", 0, 0, new W().u32(o.width).u32(o.height).done()),
    full("pixi", 0, 0, new W().u8(3).u8(o.bitDepth).u8(o.bitDepth).u8(o.bitDepth).done()),
    box("av1C", o.av1C),
    ...(o.color ? [colr(o.color)] : []),
  ];
  // 1-based property indices; av1C is essential (a reader must understand it to decode).
  const assoc = new W()
    .u32(1)
    .u16(1)
    .u8(props.length)
    .u8(1)
    .u8(2)
    .u8(0x80 | 3);
  if (o.color) assoc.u8(4);
  return full(
    "meta",
    0,
    0,
    hdlr(),
    full("pitm", 0, 0, new W().u16(1).done()),
    full(
      "iloc",
      0,
      0,
      new W()
        .u8(0x44) // offset_size 4, length_size 4
        .u8(0) // base_offset_size 0
        .u16(1)
        .u16(1) // item 1
        .u16(0) // this file
        .u16(1)
        .u32(firstOffset)
        .u32(first?.data.length ?? 0)
        .done(),
    ),
    full(
      "iinf",
      0,
      0,
      new W().u16(1).done(),
      full("infe", 2, 0, new W().u16(1).u16(0).str("av01").u8(0).done()),
    ),
    box("iprp", box("ipco", ...props), full("ipma", 0, 0, assoc.done())),
  );
}

function sampleEntry(o: AvisInput): Uint8Array {
  const head = new W()
    .zeros(6)
    .u16(1) // data_reference_index
    .u16(0)
    .u16(0)
    .zeros(12)
    .u16(o.width)
    .u16(o.height)
    .u32(0x00480000)
    .u32(0x00480000)
    .u32(0)
    .u16(1) // frame_count
    .zeros(32) // compressorname
    .u16(0x0018)
    .u16(0xffff)
    .done();
  // CodingConstraintsBox (HEIF §7.2.3.4): not all intra, intra prediction used, up to 15 references.
  const ccst = full("ccst", 0, 0, new W().u32((1 << 30) | (15 << 26)).done());
  return box("av01", head, box("av1C", o.av1C), ...(o.color ? [colr(o.color)] : []), ccst);
}

function moov(o: AvisInput, dataOffset: number): Uint8Array {
  const mediaDuration = o.durations.reduce((s, d) => s + d, 0);
  const movieDuration = Math.round((mediaDuration * MOVIE_TIMESCALE) / o.timescale);
  const mvhd = full(
    "mvhd",
    0,
    0,
    new W()
      .u32(0)
      .u32(0)
      .u32(MOVIE_TIMESCALE)
      .u32(movieDuration)
      .u32(0x00010000)
      .u16(0x0100)
      .zeros(10)
      .bytes(MATRIX)
      .zeros(24)
      .u32(2)
      .done(),
  );
  // tkhd v1: an endless loop is an indefinite duration (all ones), as libavif writes and reads it.
  const tkhd = full(
    "tkhd",
    1,
    3,
    new W()
      .u64(0)
      .u64(0)
      .u32(1)
      .u32(0)
      .u64(o.loop ? INDEFINITE : movieDuration)
      .zeros(8)
      .u16(0)
      .u16(0)
      .u16(0)
      .u16(0)
      .bytes(MATRIX)
      .u32(o.width * 65536)
      .u32(o.height * 65536)
      .done(),
  );
  const elst = full(
    "elst",
    0,
    o.loop ? 1 : 0,
    new W().u32(1).u32(movieDuration).u32(0).u32(0x00010000).done(),
  );
  const mdhd = full(
    "mdhd",
    0,
    0,
    new W().u32(0).u32(0).u32(o.timescale).u32(mediaDuration).u16(0x55c4).u16(0).done(),
  );
  // stts: runs of equal durations.
  const runs: [number, number][] = [];
  for (const d of o.durations) {
    const last = runs[runs.length - 1];
    if (last && last[1] === d) last[0]++;
    else runs.push([1, d]);
  }
  const stts = new W().u32(runs.length);
  for (const [n, d] of runs) stts.u32(n).u32(d);
  const keys = o.samples.flatMap((s, i) => (s.key ? [i + 1] : []));
  const stss =
    keys.length === o.samples.length
      ? []
      : [full("stss", 0, 0, new W().u32(keys.length).done(), ...keys.map((k) => u32(k)))];
  const stsz = new W().u32(0).u32(o.samples.length);
  for (const s of o.samples) stsz.u32(s.data.length);
  const stbl = box(
    "stbl",
    full("stsd", 0, 0, new W().u32(1).done(), sampleEntry(o)),
    full("stts", 0, 0, stts.done()),
    ...stss,
    full("stsc", 0, 0, new W().u32(1).u32(1).u32(o.samples.length).u32(1).done()),
    full("stsz", 0, 0, stsz.done()),
    full("stco", 0, 0, new W().u32(1).u32(dataOffset).done()),
  );
  const minf = box(
    "minf",
    full("vmhd", 0, 1, new W().zeros(8).done()),
    box("dinf", full("dref", 0, 0, new W().u32(1).done(), full("url ", 0, 1))),
    stbl,
  );
  const trak = box("trak", tkhd, box("edts", elst), box("mdia", mdhd, hdlr(), minf));
  return box("moov", mvhd, trak);
}

const u32 = (n: number) => new W().u32(n).done();

/** The file as parts in order; `new Blob(parts)` is the AVIF. */
export function writeAvis(o: AvisInput): Uint8Array[] {
  if (!o.samples.length) throw new Error("No frames");
  if (o.samples.length !== o.durations.length) throw new Error("One duration per frame");
  const ftyp = box(
    "ftyp",
    new W()
      .str("avis")
      .u32(0)
      .str("avis")
      .str("avif")
      .str("msf1")
      .str("iso8")
      .str("mif1")
      .str("miaf")
      .str("MA1B")
      .done(),
  );
  const payload = o.samples.reduce((s, x) => s + x.data.length, 0);
  if (payload + 8 > 0xffffffff) throw new Error("Too large for one mdat");
  // Sizes do not depend on the offsets (fixed-width fields), so lay out once with zeros, then fill.
  const metaLen = meta(o, 0).length;
  const moovLen = moov(o, 0).length;
  const dataOffset = ftyp.length + metaLen + moovLen + 8;
  const mdatHead = new W()
    .u32(payload + 8)
    .str("mdat")
    .done();
  return [
    ftyp,
    meta(o, dataOffset),
    moov(o, dataOffset),
    mdatHead,
    ...o.samples.map((s) => s.data),
  ];
}
