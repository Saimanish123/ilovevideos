/**
 * Gapless information of an MP3: the encoder delay and padding LAME (and ffmpeg, as "Lavc"/"Lavf")
 * writes into the Xing/Info frame. mediabunny's MP3 reader ignores it, so a native decode starts with
 * the encoder delay plus the decoder's own 529-sample delay (1105 samples, 25 ms at 44.1 kHz for a
 * typical file) and ends with the padding. The window below is where the real sound lies in the
 * decoded stream, the same one ffmpeg uses (mp3dec.c `start_skip_samples`, `first_discard_sample`).
 * Pure; unit-tested. No network access.
 */

/** Samples every MPEG layer III decoder delays its output by (the synthesis filterbank). */
export const MP3_DECODER_DELAY = 529;

export interface Mp3Gapless {
  sampleRate: number;
  /** Encoder delay in samples, from the LAME tag. */
  delay: number;
  /** Encoder padding in samples at the end, from the LAME tag. */
  padding: number;
  /** Audio frames counted by the Xing/Info header (the tag frame itself excluded), if present. */
  frames?: number;
  samplesPerFrame: number;
  /** Seconds of decoded output to drop at the start: delay + decoder delay. */
  skipSec: number;
  /** Where the sound ends in the decoded stream, in seconds; undefined without a frame count. */
  endSec?: number;
}

const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

/**
 * Reads the gapless window from the start of an MP3 file (the first 64 KB is plenty: an ID3v2 tag,
 * then the Xing/Info frame). Undefined when there is no Xing/Info frame with a LAME-style tag.
 */
export function readMp3Gapless(head: Uint8Array): Mp3Gapless | undefined {
  let at = 0;
  // ID3v2: 10-byte header with a syncsafe size, plus a 10-byte footer when flagged.
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    const size =
      ((head[6] ?? 0) << 21) | ((head[7] ?? 0) << 14) | ((head[8] ?? 0) << 7) | (head[9] ?? 0);
    at = 10 + size + ((head[5] ?? 0) & 0x10 ? 10 : 0);
  }
  // First frame sync at or shortly after the tag.
  const limit = Math.min(head.length - 4, at + 4096);
  while (at < limit && !(head[at] === 0xff && ((head[at + 1] ?? 0) & 0xe0) === 0xe0)) at++;
  if (at >= limit) return undefined;
  const b1 = head[at + 1] ?? 0;
  const b2 = head[at + 2] ?? 0;
  const b3 = head[at + 3] ?? 0;
  const version = (b1 >> 3) & 3;
  const layer = (b1 >> 1) & 3;
  if (layer !== 1 || version === 1) return undefined; // layer III only; 1 is reserved
  const sampleRate = RATES[version]?.[(b2 >> 2) & 3];
  if (!sampleRate) return undefined;
  const mono = b3 >> 6 === 3;
  const mpeg1 = version === 3;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  let p = at + 4 + sideInfo;
  const tag = String.fromCharCode(...head.subarray(p, p + 4));
  if (tag !== "Xing" && tag !== "Info") return undefined;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (p + 8 > head.length) return undefined;
  const flags = view.getUint32(p + 4);
  p += 8;
  let frames: number | undefined;
  if (flags & 1) {
    frames = view.getUint32(p);
    p += 4;
  }
  if (flags & 2) p += 4; // bytes
  if (flags & 4) p += 100; // TOC
  if (flags & 8) p += 4; // quality
  const encoder = String.fromCharCode(...head.subarray(p, p + 4));
  if (!/^(LAME|Lavf|Lavc)$/.test(encoder) || p + 24 > head.length) return undefined;
  const d0 = head[p + 21] ?? 0;
  const d1 = head[p + 22] ?? 0;
  const d2 = head[p + 23] ?? 0;
  const delay = (d0 << 4) | (d1 >> 4);
  const padding = ((d1 & 0x0f) << 8) | d2;
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  const skip = delay + MP3_DECODER_DELAY;
  return {
    sampleRate,
    delay,
    padding,
    frames,
    samplesPerFrame,
    skipSec: skip / sampleRate,
    endSec:
      frames !== undefined
        ? (frames * samplesPerFrame - padding + MP3_DECODER_DELAY) / sampleRate
        : undefined,
  };
}

const L3_KBPS: Record<"v1" | "v2", number[]> = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

/**
 * Writes the gapless facts into an MP3: a Xing/Info frame with a LAME tag holding the encoder delay
 * and padding (in samples), so players and ffmpeg drop exactly the encoder's and decoder's delay at
 * the start and the padding at the end. mediabunny's MP3 writer adds a Xing frame (frame count, size,
 * table of contents) but no LAME tag, so an MKV's MP3 copied out played 1105 samples (25 ms) late.
 * The Xing frame mediabunny wrote is replaced by one large enough for the tag; one that is missing is
 * added. Null when the bytes do not start (after an ID3v2 tag) with a layer III frame.
 */
export function withMp3Gapless(
  file: Uint8Array,
  gapless: { delay: number; padding: number; frames: number },
): Uint8Array<ArrayBuffer> | null {
  let at = 0;
  if (file[0] === 0x49 && file[1] === 0x44 && file[2] === 0x33) {
    const size =
      ((file[6] ?? 0) << 21) | ((file[7] ?? 0) << 14) | ((file[8] ?? 0) << 7) | (file[9] ?? 0);
    at = 10 + size + ((file[5] ?? 0) & 0x10 ? 10 : 0);
  }
  const b1 = file[at + 1] ?? 0;
  const b2 = file[at + 2] ?? 0;
  const b3 = file[at + 3] ?? 0;
  if (file[at] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3;
  if (((b1 >> 1) & 3) !== 1 || version === 1) return null;
  const mpeg1 = version === 3;
  const rate = RATES[version]?.[(b2 >> 2) & 3];
  if (!rate) return null;
  const mono = b3 >> 6 === 3;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const frameSize = (index: number, pad: number) => {
    const kbps = (mpeg1 ? L3_KBPS.v1 : L3_KBPS.v2)[index] ?? 0;
    return Math.floor(((mpeg1 ? 144_000 : 72_000) * kbps) / rate) + pad;
  };
  // An existing Xing/Info frame at the start: read its fields, then replace it.
  let rest = at;
  let toc: Uint8Array | null = null;
  const tag = String.fromCharCode(...file.subarray(at + 4 + sideInfo, at + 8 + sideInfo));
  if (tag === "Xing" || tag === "Info") {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const flags = view.getUint32(at + 8 + sideInfo);
    if (flags & 4) {
      const tocAt = at + 12 + sideInfo + (flags & 1 ? 4 : 0) + (flags & 2 ? 4 : 0);
      toc = file.slice(tocAt, tocAt + 100);
    }
    rest = at + frameSize((b2 >> 4) & 15, (b2 >> 1) & 1);
  }
  // Header + side info + "Info" + flags + frames + bytes + TOC + LAME tag (36 bytes).
  const needed = 4 + sideInfo + 4 + 4 + 4 + 4 + 100 + 36;
  let index = 1;
  while (index < 15 && frameSize(index, 0) < needed) index++;
  const size = frameSize(index, 0);
  if (size < needed) return null;
  const frame = new Uint8Array(size);
  frame[0] = 0xff;
  frame[1] = b1 | 1; // no CRC
  frame[2] = (index << 4) | (b2 & 0x0c); // same sampling rate, no padding
  frame[3] = b3;
  const view = new DataView(frame.buffer);
  let p = 4 + sideInfo;
  frame.set([0x49, 0x6e, 0x66, 0x6f], p); // "Info"
  view.setUint32(p + 4, 1 | 2 | 4);
  view.setUint32(p + 8, gapless.frames);
  const total = at + size + (file.length - rest);
  view.setUint32(p + 12, total);
  if (toc) frame.set(toc, p + 16);
  else for (let i = 0; i < 100; i++) frame[p + 16 + i] = Math.round((i / 100) * 255);
  p += 116;
  frame.set([...new TextEncoder().encode("LAME3.100")], p);
  const delay = Math.max(0, Math.min(4095, Math.round(gapless.delay)));
  const padding = Math.max(0, Math.min(4095, Math.round(gapless.padding)));
  frame[p + 21] = delay >> 4;
  frame[p + 22] = ((delay & 0x0f) << 4) | (padding >> 8);
  frame[p + 23] = padding & 0xff;
  const out = new Uint8Array(total);
  out.set(file.subarray(0, at), 0);
  out.set(frame, at);
  out.set(file.subarray(rest), at + size);
  return out;
}
