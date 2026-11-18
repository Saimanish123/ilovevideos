/**
 * MPEG-TS sound that the program table files as "private data". ffmpeg in Blu-ray/AVCHD mode
 * (`-mpegts_m2ts_mode 1`, the 192-byte-packet .m2ts/.mts it writes) and some recorders list AAC and
 * MP3 as stream_type 0x06 with no descriptor; ffprobe finds them by reading the stream, mediabunny
 * 1.55.5 only by the table, so it skips the track: no sound in video info and a "lossless copy" that
 * writes the picture alone (measured 2026-10-08: 188-byte TS with 0x0F works, 192-byte M2TS with
 * 0x06 lost its AAC).
 *
 * The fix, without patching the dependency (ADR-0032): a source that reads the first program table
 * and the first payload of each such stream, and when that payload starts with an ADTS, MPEG audio or
 * AC-3 sync word, reports the table with the stream type that says so (0x0F, 0x03/0x04, 0x81/0x87)
 * and its CRC recomputed. mediabunny reads only the first program table. Everything else is read as
 * it is. Pure parsing plus the source; no network access.
 */
import { CustomSource } from "mediabunny";

const TS = 188;
/** How far into the file the first program table and the first payloads are looked for. */
const SCAN_BYTES = 4 * 1024 * 1024;

/** The packet layout: 188 bytes, 204 with Reed-Solomon parity, or 192 with a 4-byte timecode first. */
export function packetLayout(head: Uint8Array): { offset: number; stride: number } | undefined {
  if (head[0] === 0x47 && head[TS] === 0x47) return { offset: 0, stride: TS };
  if (head[0] === 0x47 && head[TS + 16] === 0x47) return { offset: 0, stride: TS + 16 };
  if (head[4] === 0x47 && head[4 + TS + 4] === 0x47) return { offset: 4, stride: TS + 4 };
  return undefined;
}

/** CRC-32/MPEG-2 (polynomial 0x04C11DB7, initial 0xFFFFFFFF, no reflection), the PSI checksum. */
export function crc32Mpeg(bytes: Uint8Array, from: number, to: number): number {
  let crc = 0xffffffff;
  for (let i = from; i < to; i++) {
    crc ^= (bytes[i] ?? 0) << 24;
    for (let b = 0; b < 8; b++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  }
  return crc >>> 0;
}

/** The stream type a private stream's first payload bytes call for, or undefined. */
export function sniffAudioStreamType(es: Uint8Array): number | undefined {
  const b0 = es[0] ?? 0;
  const b1 = es[1] ?? 0;
  if (b0 === 0xff && (b1 & 0xf6) === 0xf0) return 0x0f; // ADTS: sync 0xFFF, layer 00
  if (b0 === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0) {
    // MPEG audio, layers I to III: MPEG-1 is 0x03, MPEG-2/2.5 is 0x04.
    return (b1 & 0x18) === 0x18 ? 0x03 : 0x04;
  }
  if (b0 === 0x0b && b1 === 0x77) return (es[5] ?? 0) >> 3 > 10 ? 0x87 : 0x81; // AC-3 / E-AC-3
  return undefined;
}

interface Packet {
  pos: number;
  pid: number;
  start: boolean;
  /** Payload offset inside `bytes`, or -1 when the packet carries none. */
  payload: number;
}

function readPacket(bytes: Uint8Array, pos: number): Packet | undefined {
  if (pos + TS > bytes.length || bytes[pos] !== 0x47) return undefined;
  const b1 = bytes[pos + 1] ?? 0;
  const afc = ((bytes[pos + 3] ?? 0) >> 4) & 3;
  let payload = pos + 4;
  if (afc === 2) payload = -1;
  else if (afc === 3) payload += 1 + (bytes[pos + 4] ?? 0);
  if (payload >= pos + TS) payload = -1;
  return { pos, pid: ((b1 & 0x1f) << 8) | (bytes[pos + 2] ?? 0), start: !!(b1 & 0x40), payload };
}

/** ES descriptors mediabunny reads a private stream's codec from (AC-3, E-AC-3, DTS, registration). */
const KNOWN_DESCRIPTORS = new Set([0x05, 0x6a, 0x7a, 0x7b, 0xcc]);

export interface TablePatch {
  /** File offset of the program table packet (its sync byte). */
  at: number;
  /** The packet as mediabunny should read it. */
  packet: Uint8Array;
  /** What changed, for tests and logs: PID and new stream type. */
  changes: { pid: number; streamType: number }[];
}

/**
 * Finds the first program table in `bytes` (the start of a file) and, for every private stream with
 * no descriptor whose first payload is ADTS, MPEG audio or AC-3, the table with that stream's type
 * corrected. Undefined when nothing needs changing or the table spans packets.
 */
export function privateAudioPatch(bytes: Uint8Array): TablePatch | undefined {
  const layout = packetLayout(bytes);
  if (!layout) return undefined;
  const { offset, stride } = layout;
  let pmtPid = -1;
  let pmt: Packet | undefined;
  for (let pos = offset; pos + TS <= bytes.length && !pmt; pos += stride) {
    const p = readPacket(bytes, pos);
    if (!p?.start || p.payload < 0) continue;
    const s = p.payload + 1 + (bytes[p.payload] ?? 0);
    if (p.pid === 0 && pmtPid < 0 && bytes[s] === 0x00) {
      const len = (((bytes[s + 1] ?? 0) & 0x0f) << 8) | (bytes[s + 2] ?? 0);
      for (let e = s + 8; e + 4 <= s + 3 + len - 4; e += 4) {
        const program = ((bytes[e] ?? 0) << 8) | (bytes[e + 1] ?? 0);
        if (program !== 0) {
          pmtPid = (((bytes[e + 2] ?? 0) & 0x1f) << 8) | (bytes[e + 3] ?? 0);
          break;
        }
      }
    } else if (p.pid === pmtPid && bytes[s] === 0x02) pmt = p;
  }
  if (!pmt) return undefined;
  const s = pmt.payload + 1 + (bytes[pmt.payload] ?? 0);
  const sectionLength = (((bytes[s + 1] ?? 0) & 0x0f) << 8) | (bytes[s + 2] ?? 0);
  const end = s + 3 + sectionLength; // CRC included
  if (end > pmt.pos + TS) return undefined; // a table over several packets: left alone
  const programInfo = (((bytes[s + 10] ?? 0) & 0x0f) << 8) | (bytes[s + 11] ?? 0);
  const candidates: { typeAt: number; pid: number }[] = [];
  for (let e = s + 12 + programInfo; e + 5 <= end - 4; ) {
    const type = bytes[e] ?? 0;
    const pid = (((bytes[e + 1] ?? 0) & 0x1f) << 8) | (bytes[e + 2] ?? 0);
    const infoLen = (((bytes[e + 3] ?? 0) & 0x0f) << 8) | (bytes[e + 4] ?? 0);
    let described = false;
    for (let d = e + 5; d + 2 <= e + 5 + infoLen; d += 2 + (bytes[d + 1] ?? 0))
      described ||= KNOWN_DESCRIPTORS.has(bytes[d] ?? 0);
    if (type === 0x06 && !described) candidates.push({ typeAt: e, pid });
    e += 5 + infoLen;
  }
  if (candidates.length === 0) return undefined;
  const changes: TablePatch["changes"] = [];
  const packet = bytes.slice(pmt.pos, pmt.pos + TS);
  for (const c of candidates) {
    const first = firstPayload(bytes, offset, stride, c.pid);
    const type = first ? sniffAudioStreamType(first) : undefined;
    if (type === undefined) continue;
    packet[c.typeAt - pmt.pos] = type;
    changes.push({ pid: c.pid, streamType: type });
  }
  if (changes.length === 0) return undefined;
  const crc = crc32Mpeg(packet, s - pmt.pos, end - 4 - pmt.pos);
  packet.set([crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff], end - 4 - pmt.pos);
  return { at: pmt.pos, packet, changes };
}

/** The elementary-stream bytes after the PES header of a PID's first PES packet. */
function firstPayload(
  bytes: Uint8Array,
  offset: number,
  stride: number,
  pid: number,
): Uint8Array | undefined {
  for (let pos = offset; pos + TS <= bytes.length; pos += stride) {
    const p = readPacket(bytes, pos);
    if (!p || p.pid !== pid || !p.start || p.payload < 0) continue;
    const q = p.payload;
    if (bytes[q] !== 0 || bytes[q + 1] !== 0 || bytes[q + 2] !== 1) return undefined;
    const headerEnd = q + 9 + (bytes[q + 8] ?? 0);
    return headerEnd < pos + TS ? bytes.subarray(headerEnd, pos + TS) : undefined;
  }
  return undefined;
}

/** True for the names MPEG-TS goes by (.ts, .m2ts, .mts, .m2t, .tsv, .trp) or its MIME types. */
export const looksTransportStream = (file: File) =>
  /\.(ts|m2ts|mts|m2t|tsv|trp)$/i.test(file.name) ||
  /^video\/(mp2t|vnd\.dlna\.mpeg-tts)$/i.test(file.type);

/**
 * A source over an MPEG-TS file that reports the corrected program table (`privateAudioPatch`),
 * worked out lazily on first read from the first 4 MB. All other bytes are plain `Blob.slice` reads.
 */
export function transportStreamSource(file: Blob): CustomSource {
  let patch: Promise<TablePatch | undefined> | undefined;
  const getPatch = () => {
    patch ??= file
      .slice(0, Math.min(file.size, SCAN_BYTES))
      .arrayBuffer()
      .then((b) => privateAudioPatch(new Uint8Array(b)))
      .catch(() => undefined);
    return patch;
  };
  return new CustomSource({
    getSize: async () => file.size,
    read: async (start, end) => {
      const [bytes, p] = await Promise.all([
        file
          .slice(start, end)
          .arrayBuffer()
          .then((b) => new Uint8Array(b)),
        getPatch(),
      ]);
      if (!p || end <= p.at || start >= p.at + TS) return bytes;
      const from = Math.max(start, p.at);
      const to = Math.min(end, p.at + TS);
      bytes.set(p.packet.subarray(from - p.at, to - p.at), from - start);
      return bytes;
    },
    prefetchProfile: "fileSystem",
  });
}
