/**
 * FLAC's last frame, when it is tiny. mediabunny 1.55.5's FLAC reader asks for at least 16 bytes
 * (its longest frame header) from the start of every frame and treats a shorter read as the end of
 * the stream, so a final frame under 16 bytes is never read. Encoders write exactly that when a file
 * ends on a short stretch of silence: a 140-sample partial frame of two constant subframes is 13
 * bytes (measured on 2026-10-08 with ffmpeg 9 output: 88 204 samples in the file, 88 064 decoded).
 *
 * The fix, without patching the dependency: the source reports a few zero bytes after the file so
 * the reader's request succeeds. The frame then carries those bytes at its end; a FLAC decoder stops
 * at the frame's CRC-16 and ignores anything shorter than the smallest frame (10 bytes) after it
 * (libavcodec `flac_decode_frame`, which Chromium's WebCodecs FLAC decoder uses). Only files whose
 * last frame needs it are padded, with no more than 16 − its length bytes (at most 6).
 *
 * Pure parsing here, plus the source used by `openInput`. No network access.
 */
import { CustomSource } from "mediabunny";

/** Bytes mediabunny's FLAC reader needs after the start of a frame (its longest frame header). */
export const FLAC_READ_AHEAD = 16;
/** The smallest valid FLAC frame (RFC 9639 §9): 6-byte header, 2-byte subframe, CRC-16. */
const MIN_FRAME = 10;

/** CRC-8 (polynomial x^8 + x^2 + x + 1, initial 0), the FLAC frame header checksum. */
function crc8(bytes: Uint8Array, from: number, to: number): number {
  let crc = 0;
  for (let i = from; i < to; i++) {
    crc ^= bytes[i] ?? 0;
    for (let b = 0; b < 8; b++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/**
 * Length of a valid FLAC frame header starting at `at` (CRC-8 included), or 0 when the bytes there
 * are not one (RFC 9639 §9.1).
 */
export function flacFrameHeaderLength(bytes: Uint8Array, at: number): number {
  if (bytes[at] !== 0xff || ((bytes[at + 1] ?? 0) & 0xfe) !== 0xf8) return 0;
  const b2 = bytes[at + 2] ?? 0;
  const b3 = bytes[at + 3] ?? 0;
  const blockBits = b2 >> 4;
  const rateBits = b2 & 0x0f;
  if (blockBits === 0 || rateBits === 0x0f || b3 & 1 || b3 >> 4 > 10) return 0;
  // Coded frame or sample number: UTF-8-like, 1 to 7 bytes.
  const lead = bytes[at + 4] ?? 0xff;
  let coded = 1;
  if (lead & 0x80) {
    coded = 0;
    for (let mask = 0x80; lead & mask && coded < 8; mask >>= 1) coded++;
    if (coded < 2 || coded > 7) return 0;
  }
  const extraBlock = blockBits === 6 ? 1 : blockBits === 7 ? 2 : 0;
  const extraRate = rateBits === 12 ? 1 : rateBits === 13 || rateBits === 14 ? 2 : 0;
  const crcAt = at + 4 + coded + extraBlock + extraRate;
  if (crcAt >= bytes.length) return 0;
  return crc8(bytes, at, crcAt) === bytes[crcAt] ? crcAt + 1 - at : 0;
}

/**
 * Zero bytes to report after the file so mediabunny reads its last frame, given the file's last
 * `FLAC_READ_AHEAD` bytes: 0 unless a frame starts there and is shorter than the reader's request.
 */
export function flacTailPad(tail: Uint8Array): number {
  const n = tail.length;
  for (let len = MIN_FRAME; len < FLAC_READ_AHEAD && len <= n; len++) {
    const at = n - len;
    const header = flacFrameHeaderLength(tail, at);
    // The header must leave room for at least a subframe and the CRC-16.
    if (header > 0 && header + 4 <= len) return FLAC_READ_AHEAD - len;
  }
  return 0;
}

/** True when the file is FLAC by name or type (how the picker and the drop label it). */
export const looksFlac = (file: File) =>
  /\.flac$/i.test(file.name) || /^audio\/(x-)?flac$/i.test(file.type);

/**
 * A source over a FLAC file that reports the zero bytes `flacTailPad` asks for after its end, read
 * lazily on first use. Reads inside the file are plain `Blob.slice` reads.
 */
export function flacSource(file: File): CustomSource {
  let pad: Promise<number> | undefined;
  const padBytes = () => {
    pad ??= file
      .slice(Math.max(0, file.size - FLAC_READ_AHEAD))
      .arrayBuffer()
      .then((b) => flacTailPad(new Uint8Array(b)))
      .catch(() => 0);
    return pad;
  };
  return new CustomSource({
    getSize: async () => file.size + (await padBytes()),
    read: async (start, end) => {
      const real =
        start < file.size
          ? new Uint8Array(await file.slice(start, Math.min(end, file.size)).arrayBuffer())
          : new Uint8Array(0);
      if (end <= file.size) return real;
      const out = new Uint8Array(end - start);
      out.set(real);
      return out;
    },
    prefetchProfile: "fileSystem",
  });
}

/** CRC-16 (polynomial x^16 + x^15 + x^2 + 1, initial 0), the FLAC frame footer checksum. */
function crc16(bytes: Uint8Array, to: number): number {
  let crc = 0;
  for (let i = 0; i < to; i++) {
    crc ^= (bytes[i] ?? 0) << 8;
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** FLAC's UTF-8-like coded number (RFC 9639 §9.1.5), 1 to 7 bytes. */
function codedNumber(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  let v = n;
  let bytes = 2;
  while (v >= 2 ** (5 * bytes + 1)) bytes++;
  for (let i = 1; i < bytes; i++) {
    out.unshift(0x80 | (v & 0x3f));
    v = Math.floor(v / 64);
  }
  out.unshift(((0xff << (8 - bytes)) & 0xff) | v);
  return out;
}

/**
 * A FLAC frame renumbered: its coded frame number (fixed block size) or first-sample number
 * (variable) set to `n`, with both checksums recomputed. A cut copied frame for frame otherwise
 * keeps the source's numbers, and ffprobe reads a start time of 0.464 s. The frame as it was when its
 * header is not one this reads.
 */
export function renumberFlacFrame(frame: Uint8Array, n: number): Uint8Array {
  const headerLen = flacFrameHeaderLength(frame, 0);
  if (headerLen === 0 || frame.length < headerLen + 2) return frame;
  const lead = frame[4] ?? 0;
  let oldLen = 1;
  if (lead & 0x80) {
    oldLen = 0;
    for (let mask = 0x80; lead & mask && oldLen < 8; mask >>= 1) oldLen++;
  }
  const coded = codedNumber(n);
  const head = [...frame.subarray(0, 4), ...coded, ...frame.subarray(4 + oldLen, headerLen - 1)];
  const out = new Uint8Array(head.length + 1 + frame.length - headerLen);
  out.set(head, 0);
  out[head.length] = crc8(out, 0, head.length);
  out.set(frame.subarray(headerLen, frame.length - 2), head.length + 1);
  const c = crc16(out, out.length - 2);
  out[out.length - 2] = c >> 8;
  out[out.length - 1] = c & 0xff;
  return out;
}

/** True for a variable-block-size FLAC frame (its number counts samples, not frames). */
export const flacVariableBlocks = (frame: Uint8Array) => ((frame[1] ?? 0) & 1) === 1;
