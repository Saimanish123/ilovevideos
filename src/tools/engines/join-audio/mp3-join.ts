/**
 * MP3 files joined frame for frame, without decoding: each file's audio frames (after its ID3v2 tag
 * and its Xing/Info frame, before an APE or ID3v1 tag) follow one another, behind one new Info frame
 * that counts them all, indexes them (TOC) and carries a LAME tag with the first file's encoder delay
 * and the last file's padding, so the joined file starts and ends exactly where its first and last
 * sources do. The output is a Blob of slices of the input Files: nothing is copied into memory.
 *
 * What a frame copy cannot remove: each inner join keeps the end padding of one file and the encoder
 * delay of the next (`joinGapSamples`, 13 to 39 ms at 44.1 kHz for LAME files), which only a
 * re-encode can drop. The first frame of every MP3 starts its own bit reservoir, so frames from two
 * files never depend on each other and every join decodes cleanly.
 * Pure parsing plus Blob slicing; no mediabunny. Runs in the engine worker; no network access.
 */
import { readMp3Gapless } from "../mediabunny/mp3-gapless";

const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};
const KBPS = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

interface Header {
  version: number;
  sampleRate: number;
  mono: boolean;
  size: number;
}

/** A layer III frame header at `p`, or undefined. */
function header(b: Uint8Array, p: number): Header | undefined {
  if (b[p] !== 0xff) return undefined;
  const b1 = b[p + 1] ?? 0;
  const b2 = b[p + 2] ?? 0;
  const b3 = b[p + 3] ?? 0;
  if ((b1 & 0xe0) !== 0xe0) return undefined;
  const version = (b1 >> 3) & 3;
  if (version === 1 || ((b1 >> 1) & 3) !== 1) return undefined;
  const bi = (b2 >> 4) & 15;
  const ri = (b2 >> 2) & 3;
  if (bi === 0 || bi === 15 || ri === 3) return undefined;
  const sampleRate = RATES[version]?.[ri] as number;
  const mpeg1 = version === 3;
  const kbps = (mpeg1 ? KBPS.v1 : KBPS.v2)[bi] as number;
  const size = Math.floor(((mpeg1 ? 144_000 : 72_000) * kbps) / sampleRate) + ((b2 >> 1) & 1);
  return { version, sampleRate, mono: b3 >> 6 === 3, size };
}

export interface Mp3Layout {
  name: string;
  version: number;
  sampleRate: number;
  mono: boolean;
  samplesPerFrame: number;
  /** Byte range of the audio frames (the Info frame and tags excluded). */
  start: number;
  end: number;
  frames: number;
  /** Byte offset (from `start`) of every frame, for the joined file's index. */
  offsets: Float64Array;
  /** From the source's LAME tag; undefined without one. */
  delay?: number;
  padding?: number;
  /** The first four header bytes of the first audio frame. */
  head: Uint8Array;
}

const CHUNK = 1 << 20;

/** Where the audio frames of an MP3 lie, frame by frame. Throws a sentence when it is not one. */
export async function scanMp3(file: Blob, name: string): Promise<Mp3Layout> {
  const size = file.size;
  const headBytes = new Uint8Array(await file.slice(0, Math.min(size, 1 << 16)).arrayBuffer());
  const gapless = readMp3Gapless(headBytes);
  let at = 0;
  if (headBytes[0] === 0x49 && headBytes[1] === 0x44 && headBytes[2] === 0x33) {
    const s =
      ((headBytes[6] ?? 0) << 21) |
      ((headBytes[7] ?? 0) << 14) |
      ((headBytes[8] ?? 0) << 7) |
      (headBytes[9] ?? 0);
    at = 10 + s + ((headBytes[5] ?? 0) & 0x10 ? 10 : 0);
  }
  // Tags at the end: ID3v1 (128 bytes, "TAG") and an APEv2 footer before it.
  let end = size;
  const tail = new Uint8Array(await file.slice(Math.max(0, size - 160), size).arrayBuffer());
  const text = (b: Uint8Array, p: number, n: number) =>
    String.fromCharCode(...b.subarray(p, p + n));
  if (tail.length >= 128 && text(tail, tail.length - 128, 3) === "TAG") end -= 128;
  const apeAt = tail.length - (size - end) - 32;
  if (apeAt >= 0 && text(tail, apeAt, 8) === "APETAGEX") {
    const v = new DataView(tail.buffer, tail.byteOffset + apeAt);
    const tagSize = v.getUint32(12, true);
    const hasHeader = (v.getUint32(20, true) & 0x80000000) !== 0;
    end -= tagSize + (hasHeader ? 32 : 0);
  }
  let first: Header | undefined;
  let headCopy = new Uint8Array(4);
  let start = -1;
  const offsets: number[] = [];
  let pos = at;
  let resyncs = 0;
  while (pos + 4 <= end) {
    const chunkEnd = Math.min(end, pos + CHUNK + 4);
    const b = new Uint8Array(await file.slice(pos, chunkEnd).arrayBuffer());
    let p = 0;
    while (p + 4 <= b.length) {
      const h = header(b, p);
      if (!h || (first && (h.sampleRate !== first.sampleRate || h.version !== first.version))) {
        // Lost sync (junk between frames): look for the next header, but not for long.
        if (++resyncs > 65_536) throw new Error(`${name} is not a readable MP3 file.`);
        p++;
        continue;
      }
      if (!first) {
        first = h;
        headCopy = b.slice(p, p + 4);
        start = pos + p;
        // A Xing/Info frame is the file's own index, not sound: skip it.
        if (
          gapless ||
          text(b, p + 4 + (h.version === 3 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17), 4).match(
            /Xing|Info/,
          )
        ) {
          start = pos + p + h.size;
          p += h.size;
          continue;
        }
      }
      if (first && h.mono !== first.mono)
        throw new Error(`${name} switches between mono and stereo, so it cannot be copied.`);
      offsets.push(pos + p - start);
      p += h.size;
    }
    if (p === 0) break;
    pos += p;
  }
  if (!first || offsets.length === 0) throw new Error(`${name} has no MP3 frames.`);
  const last = offsets[offsets.length - 1] as number;
  return {
    name,
    version: first.version,
    sampleRate: first.sampleRate,
    mono: first.mono,
    samplesPerFrame: first.version === 3 ? 1152 : 576,
    start,
    end: Math.min(
      end,
      start +
        last +
        (header(new Uint8Array(await file.slice(start + last, start + last + 4).arrayBuffer()), 0)
          ?.size ?? 0),
    ),
    frames: offsets.length,
    offsets: Float64Array.from(offsets),
    delay: gapless?.delay,
    padding: gapless?.padding,
    head: headCopy,
  };
}

/** Why these MP3s cannot be joined frame for frame, or undefined when they can. */
export function mp3Mismatch(layouts: Mp3Layout[]): string | undefined {
  const [a, ...rest] = layouts;
  if (!a) return "No files.";
  for (const [i, b] of rest.entries()) {
    if (b.sampleRate !== a.sampleRate)
      return `File ${i + 2} is ${b.sampleRate / 1000} kHz; file 1 is ${a.sampleRate / 1000} kHz.`;
    if (b.mono !== a.mono)
      return `File ${i + 2} is ${b.mono ? "mono" : "stereo"}; file 1 is ${a.mono ? "mono" : "stereo"}.`;
  }
  return undefined;
}

/** Samples of encoder padding and delay each inner join keeps (unknown files count LAME's usual 576 + 0). */
export function joinGapSamples(layouts: Mp3Layout[]): number[] {
  return layouts.slice(1).map((b, i) => (layouts[i]?.padding ?? 0) + (b.delay ?? 576));
}

/** The joined file's Info frame: frame count, size, index and LAME delay and padding. */
function infoFrame(
  first: Mp3Layout,
  frames: number,
  audioBytes: number,
  toc: Uint8Array,
  gapless: { delay: number; padding: number } | undefined,
): Uint8Array {
  const [, b1 = 0, b2 = 0, b3 = 0] = first.head;
  const mpeg1 = first.version === 3;
  const sideInfo = mpeg1 ? (first.mono ? 17 : 32) : first.mono ? 9 : 17;
  const needed = 4 + sideInfo + 16 + 100 + 36;
  const kbpsTable = mpeg1 ? KBPS.v1 : KBPS.v2;
  let index = 1;
  const sizeOf = (i: number) =>
    Math.floor(((mpeg1 ? 144_000 : 72_000) * (kbpsTable[i] as number)) / first.sampleRate);
  while (index < 14 && sizeOf(index) < needed) index++;
  const size = sizeOf(index);
  const frame = new Uint8Array(size);
  frame[0] = 0xff;
  frame[1] = b1 | 1;
  frame[2] = (index << 4) | (b2 & 0x0c);
  frame[3] = b3;
  const view = new DataView(frame.buffer);
  let p = 4 + sideInfo;
  frame.set([0x49, 0x6e, 0x66, 0x6f], p); // "Info"
  view.setUint32(p + 4, 1 | 2 | 4);
  view.setUint32(p + 8, frames);
  view.setUint32(p + 12, size + audioBytes);
  frame.set(toc, p + 16);
  p += 116;
  if (gapless) {
    frame.set([...new TextEncoder().encode("LAME3.100")], p);
    const delay = Math.max(0, Math.min(4095, Math.round(gapless.delay)));
    const padding = Math.max(0, Math.min(4095, Math.round(gapless.padding)));
    frame[p + 21] = delay >> 4;
    frame[p + 22] = ((delay & 0x0f) << 4) | (padding >> 8);
    frame[p + 23] = padding & 0xff;
  }
  return frame;
}

/**
 * The joined MP3 as a Blob of slices of `files` (in order) behind a new Info frame. `layouts` come
 * from `scanMp3` and must match (`mp3Mismatch`). The LAME tag is written when the first and last
 * files have one (their delay and padding are then known), as ffmpeg and players read it.
 */
export function joinMp3(files: Blob[], layouts: Mp3Layout[]): Blob {
  const first = layouts[0] as Mp3Layout;
  const last = layouts[layouts.length - 1] as Mp3Layout;
  const frames = layouts.reduce((s, l) => s + l.frames, 0);
  const audioBytes = layouts.reduce((s, l) => s + (l.end - l.start), 0);
  // Index: byte position (of 256) at each whole percent of the frames.
  const toc = new Uint8Array(100);
  let base = 0;
  let k = 0;
  let li = 0;
  let fi = 0;
  for (let pct = 0; pct < 100; pct++) {
    const target = Math.floor((pct / 100) * frames);
    while (li < layouts.length && k + (layouts[li] as Mp3Layout).frames <= target) {
      k += (layouts[li] as Mp3Layout).frames;
      base += (layouts[li] as Mp3Layout).end - (layouts[li] as Mp3Layout).start;
      li++;
      fi = 0;
    }
    fi = target - k;
    const off =
      li < layouts.length ? base + ((layouts[li] as Mp3Layout).offsets[fi] ?? 0) : audioBytes;
    toc[pct] = Math.min(255, Math.floor((256 * off) / Math.max(1, audioBytes)));
  }
  const gapless =
    first.delay !== undefined && last.padding !== undefined
      ? { delay: first.delay, padding: last.padding }
      : undefined;
  const parts: BlobPart[] = [infoFrame(first, frames, audioBytes, toc, gapless) as BlobPart];
  files.forEach((f, i) => {
    const l = layouts[i] as Mp3Layout;
    parts.push(f.slice(l.start, l.end));
  });
  return new Blob(parts, { type: "audio/mpeg" });
}
