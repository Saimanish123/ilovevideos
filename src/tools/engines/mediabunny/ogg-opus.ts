/**
 * Rewrites a finished Ogg Opus file (one logical stream, as mediabunny writes audio-only Opus) so it
 * states the real pre-skip and the real end (RFC 7845 §4): the OpusHead pre-skip is set, packets
 * that lie wholly after the end are dropped, and the last page's granule position is pre-skip plus
 * the length, which tells decoders to discard the encoder's padding. The pages are written again
 * from the packets, so every page's granule position and checksum are right.
 *
 * Pure: bytes in, bytes out. No network access.
 */
import { opusPacketSamples, readOpusHead, setOpusHeadPreSkip } from "./opus-delay";

interface Page {
  type: number;
  granule: bigint;
  serial: number;
  segments: number[];
  data: Uint8Array;
}

function readPages(file: Uint8Array): Page[] | null {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const pages: Page[] = [];
  let p = 0;
  while (p + 27 <= file.length) {
    if (view.getUint32(p) !== 0x4f676753) return null; // "OggS"
    const count = file[p + 26] ?? 0;
    const segments = [...file.subarray(p + 27, p + 27 + count)];
    const size = segments.reduce((a, b) => a + b, 0);
    const start = p + 27 + count;
    if (start + size > file.length) return null;
    pages.push({
      type: file[p + 5] ?? 0,
      granule: view.getBigInt64(p + 6, true),
      serial: view.getUint32(p + 14, true),
      segments,
      data: file.subarray(start, start + size),
    });
    p = start + size;
  }
  return p === file.length ? pages : null;
}

/** Packets of a single logical stream, joined across pages. */
function readPackets(pages: Page[]): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let pending: Uint8Array[] = [];
  for (const page of pages) {
    let at = 0;
    for (const lace of page.segments) {
      pending.push(page.data.subarray(at, at + lace));
      at += lace;
      if (lace < 255) {
        const len = pending.reduce((a, b) => a + b.length, 0);
        const packet = new Uint8Array(len);
        let o = 0;
        for (const part of pending) {
          packet.set(part, o);
          o += part.length;
        }
        packets.push(packet);
        pending = [];
      }
    }
  }
  return packets;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let b = 0; b < 8; b++) r = r & 0x8000_0000 ? (r << 1) ^ 0x04c1_1db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

/** Ogg's CRC-32 (polynomial 0x04C11DB7, no reflection, initial 0). */
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ b) & 0xff] ?? 0)) >>> 0;
  return crc >>> 0;
}

/** Target page payload: about mediabunny's own page size. */
const PAGE_TARGET = 8192;

class PageWriter {
  readonly pages: Uint8Array[] = [];
  private segments: number[] = [];
  private parts: Uint8Array[] = [];
  private size = 0;
  private sequence = 0;
  private granule = -1n;
  private continued = false;

  constructor(private readonly serial: number) {}

  /** Adds a packet that ends at `granule`; flushes the page after it when asked. */
  add(packet: Uint8Array, granule: bigint, flush: boolean, last: boolean) {
    let at = 0;
    for (;;) {
      const lace = Math.min(255, packet.length - at);
      this.segments.push(lace);
      this.parts.push(packet.subarray(at, at + lace));
      this.size += lace;
      at += lace;
      const done = lace < 255;
      if (done) this.granule = granule;
      if (this.segments.length === 255 && !(done && (flush || last))) {
        this.write(false);
        this.continued = !done;
      }
      if (done) break;
    }
    if (flush || last || this.size >= PAGE_TARGET) this.write(last);
  }

  private write(eos: boolean) {
    if (this.segments.length === 0) return;
    const bytes = new Uint8Array(27 + this.segments.length + this.size);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x4f676753);
    bytes[4] = 0;
    bytes[5] = (this.continued ? 1 : 0) | (this.sequence === 0 ? 2 : 0) | (eos ? 4 : 0);
    view.setBigInt64(6, this.granule, true);
    view.setUint32(14, this.serial, true);
    view.setUint32(18, this.sequence, true);
    bytes[26] = this.segments.length;
    bytes.set(this.segments, 27);
    let o = 27 + this.segments.length;
    for (const part of this.parts) {
      bytes.set(part, o);
      o += part.length;
    }
    view.setUint32(22, oggCrc(bytes), true);
    this.pages.push(bytes);
    this.sequence++;
    this.segments = [];
    this.parts = [];
    this.size = 0;
    this.granule = -1n;
    this.continued = false;
  }
}

export interface OggOpusFix {
  /** Real pre-skip (48 kHz samples); omit to keep the one in the file. */
  preSkip?: number;
  /** Length of the sound in seconds; the end granule becomes pre-skip + this × 48 000. */
  endSec: number;
}

/**
 * The file with the pre-skip and end written, or null when it is not a single-stream Ogg Opus
 * file. The end is never moved past the samples the packets hold.
 */
export function fixOggOpus(file: Uint8Array, fix: OggOpusFix): Uint8Array<ArrayBuffer> | null {
  const pages = readPages(file);
  if (!pages || pages.length < 2) return null;
  const serial = pages[0]?.serial ?? 0;
  if (pages.some((p) => p.serial !== serial)) return null;
  const packets = readPackets(pages);
  const head = packets[0];
  const opus = head ? readOpusHead(head) : null;
  if (!head || !opus || packets.length < 3) return null;
  const preSkip = fix.preSkip ?? opus.preSkip;
  const idHeader = head.slice();
  setOpusHeadPreSkip(idHeader, preSkip);

  const audio = packets.slice(2);
  const total = audio.reduce((n, p) => n + opusPacketSamples(p), 0);
  const end = Math.min(total, preSkip + Math.max(0, Math.round(fix.endSec * 48_000)));
  // Keep packets up to the one holding the last real sample; the rest is encoder padding.
  const kept: Uint8Array[] = [];
  let granule = 0;
  for (const packet of audio) {
    if (granule >= end && kept.length > 0) break;
    kept.push(packet);
    granule += opusPacketSamples(packet);
  }

  const out = new PageWriter(serial);
  out.add(idHeader, 0n, true, false);
  out.add(packets[1] ?? new Uint8Array(0), 0n, true, false);
  let at = 0;
  for (const [i, packet] of kept.entries()) {
    at += opusPacketSamples(packet);
    const last = i === kept.length - 1;
    out.add(packet, BigInt(last ? end : at), false, last);
  }
  const length = out.pages.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(length);
  let o = 0;
  for (const p of out.pages) {
    bytes.set(p, o);
    o += p.length;
  }
  return bytes;
}
