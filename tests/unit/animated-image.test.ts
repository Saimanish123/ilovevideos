import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ApngWriter, changedRect, deflate, filterRows } from "@/tools/engines/animated-image/apng";
import {
  av1CodecString,
  av1ConfigRecord,
  parseSequenceHeader,
  readObus,
  sequenceHeaderObu,
  stripForSample,
} from "@/tools/engines/animated-image/av1";
import { writeAvis } from "@/tools/engines/animated-image/avis";
import {
  changedRectRgba,
  copyRect,
  estimateAnimatedBytes,
} from "@/tools/engines/animated-image/math";
import {
  AnimatedImageOptions,
  animatedFfmpegCommand,
} from "@/tools/engines/animated-image/options";
import { stillChunks, vp8Chunk, WebpWriter } from "@/tools/engines/animated-image/webp";

const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => Number.parseInt(h, 16));

// Sequence header written by SVT-AV1 4.2 for 480×270 8-bit 4:2:0, BT.709 matrix only (primaries and
// transfer unspecified, as ffprobe also reads them): `ffmpeg -f lavfi -i testsrc2=s=480x270 -c:v libsvtav1 -colorspace bt709 -f obu`.

describe("AV1 bitstream", () => {
  it("reads OBUs and drops the temporal delimiter from a sample", () => {
    const tu = hex("12000a0e02000005623bf0d1abe6408080413201ff");
    const obus = readObus(tu);
    expect(obus.map((o) => o.type)).toEqual([2, 1, 6]);
    expect(stripForSample(tu)[0]).toBe(0x0a);
  });

  it("parses the sequence header and builds av1C", () => {
    const tu = hex("12000a0e02000005623bf0d1abe640808041");
    const seqObu = sequenceHeaderObu(tu);
    expect(seqObu?.length).toBe(16);
    const seq = parseSequenceHeader(seqObu as Uint8Array);
    expect(seq.profile).toBe(0);
    expect(seq.bitDepth).toBe(8);
    expect(seq.mono).toBe(false);
    expect([seq.subsamplingX, seq.subsamplingY]).toEqual([1, 1]);
    expect(seq.maxWidth).toBe(480);
    expect(seq.maxHeight).toBe(270);
    expect(seq.color).toEqual({ primaries: 2, transfer: 2, matrix: 1 });
    expect(seq.fullRange).toBe(false);
    const rec = av1ConfigRecord(seq, seqObu as Uint8Array);
    expect(rec[0]).toBe(0x81);
    expect(rec[1]).toBe(seq.level);
    expect(rec[2]).toBe(0b0000_1100);
    expect(rec.length).toBe(4 + 16);
  });

  it("picks the smallest level for the picture and rate", () => {
    expect(av1CodecString(480, 270, 24)).toBe("av01.0.00M.08");
    expect(av1CodecString(1280, 720, 30)).toBe("av01.0.05M.08");
    expect(av1CodecString(1920, 1080, 30)).toBe("av01.0.08M.08");
    expect(av1CodecString(3840, 2160, 30)).toBe("av01.0.12M.08");
  });
});

/** Top-level and nested box types, for structure checks. */
function boxes(
  b: Uint8Array,
  from = 0,
  to = b.length,
): { type: string; start: number; end: number }[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = [];
  for (let at = from; at + 8 <= to; ) {
    const size = v.getUint32(at);
    out.push({
      type: String.fromCharCode(...b.subarray(at + 4, at + 8)),
      start: at,
      end: at + size,
    });
    at += size;
  }
  return out;
}
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe("avis writer", () => {
  const seqObu = hex("0a0e02000005623bf0d1abe640808041");
  const seq = parseSequenceHeader(seqObu);
  const samples = [
    { data: join([seqObu, hex("32050102030405")]), key: true },
    { data: hex("320301020a"), key: false },
    { data: hex("3203010203"), key: false },
  ];
  const write = (loop: boolean) =>
    join(
      writeAvis({
        width: 480,
        height: 270,
        timescale: 24,
        durations: [1, 1, 1],
        samples,
        av1C: av1ConfigRecord(seq, seqObu),
        color: { primaries: 1, transfer: 1, matrix: 1, fullRange: false },
        bitDepth: 8,
        loop,
      }),
    );

  it("lays out ftyp, meta, moov, mdat with avis brands", () => {
    const f = write(true);
    expect(boxes(f).map((b) => b.type)).toEqual(["ftyp", "meta", "moov", "mdat"]);
    expect(String.fromCharCode(...f.subarray(8, 12))).toBe("avis");
    const brands = String.fromCharCode(...f.subarray(16, boxes(f)[0]?.end));
    expect(brands).toContain("avif");
    expect(brands).toContain("MA1B");
  });

  it("points the primary item and the chunk offset at the first sample", () => {
    const f = write(true);
    const mdat = boxes(f).find((b) => b.type === "mdat");
    const dataStart = (mdat?.start ?? 0) + 8;
    const v = new DataView(f.buffer);
    // stco: the single chunk offset.
    const stco = f.findIndex((_, i) => String.fromCharCode(...f.subarray(i, i + 4)) === "stco");
    expect(v.getUint32(stco + 4 + 4 + 4)).toBe(dataStart);
    const iloc = f.findIndex((_, i) => String.fromCharCode(...f.subarray(i, i + 4)) === "iloc");
    // version/flags 4, sizes 2, count 2, item 2, dref 2, extents 2, then offset and length.
    expect(v.getUint32(iloc + 4 + 4 + 2 + 2 + 2 + 2 + 2)).toBe(dataStart);
    expect(v.getUint32(iloc + 4 + 4 + 2 + 2 + 2 + 2 + 2 + 4)).toBe(samples[0]?.data.length);
    expect(f.subarray(dataStart, dataStart + 2)).toEqual(seqObu.subarray(0, 2));
    expect((mdat?.end ?? 0) - dataStart).toBe(samples.reduce((s, x) => s + x.data.length, 0));
  });

  it("signals an endless loop with the repeat flag and an indefinite track duration", () => {
    const find = (f: Uint8Array, t: string) =>
      f.findIndex((_, i) => String.fromCharCode(...f.subarray(i, i + 4)) === t);
    const loop = write(true);
    const once = write(false);
    expect(loop[find(loop, "elst") + 7]).toBe(1);
    expect(once[find(once, "elst") + 7]).toBe(0);
    const tkhd = find(loop, "tkhd");
    // v1: version/flags 4, creation 8, modification 8, track id 4, reserved 4, duration 8.
    expect(Array.from(loop.subarray(tkhd + 4 + 4 + 24, tkhd + 4 + 4 + 32))).toEqual(
      Array(8).fill(255),
    );
    const tkhdOnce = find(once, "tkhd");
    expect(new DataView(once.buffer).getUint32(tkhdOnce + 4 + 4 + 28)).toBe(125);
    // stss lists only the key frame.
    expect(find(loop, "stss")).toBeGreaterThan(0);
    expect(find(loop, "pict")).toBeGreaterThan(0);
  });
});

describe("APNG writer", () => {
  it("filters rows reversibly and picks a filter per row", () => {
    const w = 7;
    const h = 5;
    const px = new Uint8Array(w * h * 3).map((_, i) => (i * 37 + (i % 5) * 11) & 0xff);
    const out = filterRows(px, w, 3, { x: 0, y: 0, w, h });
    expect(out.length).toBe(h * (w * 3 + 1));
    // Undo the filters and compare.
    const rec = new Uint8Array(w * h * 3);
    const rb = w * 3;
    for (let y = 0; y < h; y++) {
      const f = out[y * (rb + 1)] ?? 0;
      for (let i = 0; i < rb; i++) {
        const x = out[y * (rb + 1) + 1 + i] ?? 0;
        const a = i >= 3 ? (rec[y * rb + i - 3] ?? 0) : 0;
        const b = y > 0 ? (rec[(y - 1) * rb + i] ?? 0) : 0;
        const c = y > 0 && i >= 3 ? (rec[(y - 1) * rb + i - 3] ?? 0) : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        const pred = [0, a, b, (a + b) >> 1, pr][f] ?? 0;
        rec[y * rb + i] = (x + pred) & 0xff;
      }
    }
    expect(rec).toEqual(px);
  });

  it("finds the changed rectangle exactly", () => {
    const a = new Uint8Array(10 * 6 * 3);
    const b = a.slice();
    expect(changedRect(a, b, 10, 6, 3)).toBeUndefined();
    b[(2 * 10 + 3) * 3 + 1] = 9;
    b[(4 * 10 + 7) * 3] = 1;
    expect(changedRect(a, b, 10, 6, 3)).toEqual({ x: 3, y: 2, w: 5, h: 3 });
  });

  it("writes a valid APNG with folded frames and exact delays", async () => {
    const w = 4;
    const h = 2;
    const full = { x: 0, y: 0, w, h };
    const px = new Uint8Array(w * h * 3).fill(200);
    const writer = new ApngWriter({ width: w, height: h, bpp: 3, fps: 12, loop: true });
    writer.add(full, await deflate(filterRows(px, w, 3, full)));
    writer.extend();
    writer.add(
      { x: 1, y: 0, w: 1, h: 1 },
      await deflate(filterRows(px, w, 3, { x: 1, y: 0, w: 1, h: 1 })),
    );
    const f = new Uint8Array(await writer.finish().arrayBuffer());
    expect(Array.from(f.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunks: { type: string; data: Uint8Array }[] = [];
    const v = new DataView(f.buffer);
    for (let at = 8; at < f.length; ) {
      const len = v.getUint32(at);
      chunks.push({
        type: String.fromCharCode(...f.subarray(at + 4, at + 8)),
        data: f.subarray(at + 8, at + 8 + len),
      });
      at += 12 + len;
    }
    expect(chunks.map((c) => c.type)).toEqual([
      "IHDR",
      "acTL",
      "fcTL",
      "IDAT",
      "fcTL",
      "fdAT",
      "IEND",
    ]);
    const actl = chunks[1]?.data as Uint8Array;
    expect(new DataView(actl.buffer, actl.byteOffset).getUint32(0)).toBe(2);
    const fctl = chunks[2]?.data as Uint8Array;
    const fv = new DataView(fctl.buffer, fctl.byteOffset);
    // Two periods at 12 fps: 2/12 s.
    expect([fv.getUint16(20), fv.getUint16(22)]).toEqual([2, 12]);
    const idat = chunks[3]?.data as Uint8Array;
    expect(inflateSync(idat).length).toBe(h * (w * 3 + 1));
    // fdAT carries sequence number 2 (fcTL 0, fcTL 1, fdAT 2).
    const fdat = chunks[5]?.data as Uint8Array;
    expect(new DataView(fdat.buffer, fdat.byteOffset).getUint32(0)).toBe(2);
  });
});

describe("animated WebP", () => {
  // A minimal still: RIFF/WEBP with one VP8 chunk (payload contents do not matter to the muxer).
  const vp8 = hex("9d012a");
  const still = (() => {
    const payload = join([hex("100000"), vp8, hex("0100010000")]);
    const head = join([
      Uint8Array.from("RIFF", (c) => c.charCodeAt(0)),
      Uint8Array.of(4 + 8 + payload.length + (payload.length & 1), 0, 0, 0),
      Uint8Array.from("WEBP", (c) => c.charCodeAt(0)),
      Uint8Array.from("VP8 ", (c) => c.charCodeAt(0)),
      Uint8Array.of(payload.length, 0, 0, 0),
    ]);
    return join([head, payload, new Uint8Array(payload.length & 1)]);
  })();

  it("takes the image chunks of a still WebP", () => {
    const { chunks, hasAlpha } = stillChunks(still);
    expect(String.fromCharCode(...chunks.subarray(0, 4))).toBe("VP8 ");
    expect(hasAlpha).toBe(false);
  });

  it("wraps a VP8 key frame and refuses an inter frame", () => {
    const key = hex("103c009d012ae0010e01");
    expect(String.fromCharCode(...vp8Chunk(key).subarray(0, 4))).toBe("VP8 ");
    expect(() => vp8Chunk(hex("113c009d012a"))).toThrow();
  });

  it("muxes frames with millisecond lengths that add up to the range", async () => {
    const { chunks } = stillChunks(still);
    const w = new WebpWriter({ width: 480, height: 270 }, 24, true);
    w.add({ chunks, x: 0, y: 0, width: 480, height: 270, hasAlpha: false });
    w.extend();
    w.add({ chunks, x: 10, y: 20, width: 5, height: 5, hasAlpha: false });
    w.add({ chunks, x: 0, y: 0, width: 480, height: 270, hasAlpha: false });
    expect(() => w.add({ chunks, x: 3, y: 0, width: 2, height: 2, hasAlpha: false })).toThrow();
    const f = new Uint8Array(await w.finish().arrayBuffer());
    const v = new DataView(f.buffer);
    expect(v.getUint32(4, true)).toBe(f.length - 8);
    const durations: number[] = [];
    const offsets: number[][] = [];
    for (let at = 12; at < f.length; ) {
      const type = String.fromCharCode(...f.subarray(at, at + 4));
      const len = v.getUint32(at + 4, true);
      if (type === "VP8X") expect(f[at + 8]).toBe(0x02);
      if (type === "ANIM") expect(v.getUint16(at + 12, true)).toBe(0);
      if (type === "ANMF") {
        const p = at + 8;
        const u24 = (o: number) =>
          (f[p + o] ?? 0) | ((f[p + o + 1] ?? 0) << 8) | ((f[p + o + 2] ?? 0) << 16);
        offsets.push([u24(0) * 2, u24(3) * 2]);
        durations.push(u24(12));
      }
      at += 8 + len + (len & 1);
    }
    // 2 + 1 + 1 periods at 24 fps = 4/24 s = 167 ms, rounded on the running total.
    expect(durations).toEqual([83, 42, 42]);
    expect(offsets[1]).toEqual([10, 20]);
  });
});

describe("animated-image math and options", () => {
  it("finds the visibly changed rectangle at even offsets", () => {
    const w = 8;
    const h = 4;
    const a = new Uint8ClampedArray(w * h * 4).fill(100);
    const b = a.slice();
    b[(1 * w + 3) * 4] = 103; // under the threshold
    expect(changedRectRgba(a, b, w, h, 6)).toBeUndefined();
    b[(1 * w + 3) * 4 + 2] = 120;
    b[(3 * w + 5) * 4 + 1] = 80;
    expect(changedRectRgba(a, b, w, h, 6)).toEqual({ x: 2, y: 0, w: 4, h: 4 });
    const shown = a.slice();
    copyRect(b, shown, w, { x: 2, y: 0, w: 4, h: 4 });
    expect(changedRectRgba(shown, b, w, h, 6)).toBeUndefined();
  });

  it("estimates grow with frames and area", () => {
    const one = estimateAnimatedBytes("webp", "balanced", 480, 270, 10);
    expect(estimateAnimatedBytes("webp", "balanced", 480, 270, 20)).toBeGreaterThan(one * 1.9);
    expect(estimateAnimatedBytes("avif", "balanced", 480, 270, 10)).toBeLessThan(one);
  });

  it("validates options and writes the matching ffmpeg command", () => {
    expect(() => AnimatedImageOptions.parse({ start: 2, end: 1 })).toThrow();
    const o = AnimatedImageOptions.parse({ format: "avif", end: 3 });
    expect(o.quality).toBe("balanced");
    const cmd = animatedFfmpegCommand("in.mp4", "in.avif", o, { width: 480, height: 270 });
    expect(cmd).toContain("libaom-av1 -b:v 233k");
    expect(cmd).toContain("-loop 0");
    expect(
      animatedFfmpegCommand(
        "a b.mov",
        "a b.png",
        { ...o, format: "apng", loop: false },
        { width: 480, height: 270 },
      ),
    ).toContain("-plays 1");
  });
});

describe("thumbnail suggestions", () => {
  const frame = (fill: (x: number, y: number) => number, w = 32, h = 18) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = fill(x, y);
        d.set([v, v, v, 255], (y * w + x) * 4);
      }
    return d;
  };
  it("scores black as unusable and mid-tones highest", async () => {
    const { exposure } = await import("@/tools/engines/frame-pick/score");
    expect(
      exposure(
        frame(() => 0),
        32,
        18,
      ),
    ).toBe(0);
    expect(
      exposure(
        frame(() => 118),
        32,
        18,
      ),
    ).toBeCloseTo(1, 2);
    expect(
      exposure(
        frame(() => 250),
        32,
        18,
      ),
    ).toBeLessThan(0.1);
  });
  it("keeps one of each scene and drops near-duplicates", async () => {
    const { signature, suggest, sharpness, exposure } = await import(
      "@/tools/engines/frame-pick/score"
    );
    const mk = (t: number, f: (x: number, y: number) => number) => {
      const d = frame(f);
      return {
        t,
        sharpness: sharpness(d, 32, 18),
        exposure: exposure(d, 32, 18),
        sig: signature(d, 32, 18),
      };
    };
    const checker = (x: number, y: number) =>
      (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 40 : 200;
    const bars = (x: number) => (x < 16 ? 60 : 180);
    const picks = suggest(
      [mk(0, () => 0), mk(1, checker), mk(1.1, checker), mk(2, bars), mk(2.1, bars)],
      6,
    );
    expect(picks.map((p) => p.t)).toEqual([1, 2]);
  });
});
