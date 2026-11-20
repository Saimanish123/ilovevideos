/**
 * What a recording writes beside its media so it can be finished after a crash (ADR-0130), and the
 * pure parts of finishing it: reading the packet index, splitting an MP4's unindexed media data back
 * into packets, and fixing the headers a WAV, WebM or Ogg file writes only at the end.
 *
 * An MP4 or M4A keeps its index (`moov`) in memory until Stop, so a file cut off mid-recording is
 * media data nobody can play. Beside it the recorder appends one 24-byte entry per encoded packet
 * (track, key flag, size, time, duration) and keeps the decoder configurations in the recording's
 * JSON. The media data is the packets themselves, back to back in runs per track; walking it with
 * both tracks' size lists, and telling an H.264 packet by its NAL length prefixes adding up exactly to
 * its size, gives every packet back, which a muxer then indexes into a normal file.
 *
 * No network access (README.md#privacy-and-processing §2).
 */
import type { AudioCodecId, CaptureKind, VideoCodecId } from "./plan";

/** Bytes per index entry. */
export const ENTRY_BYTES = 24;
/** Interrupted recordings older than this are removed rather than offered. */
export const RECOVER_DAYS = 7;

export interface JournalEntry {
  track: "video" | "audio";
  key: boolean;
  size: number;
  /** Seconds. */
  timestamp: number;
  /** Seconds. */
  duration: number;
}

export interface StoredVideoConfig {
  codec: string;
  codedWidth?: number;
  codedHeight?: number;
  /** Base64 of the decoder description (avcC). */
  description?: string;
}
export interface StoredAudioConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  /** Base64 of the decoder description (AudioSpecificConfig). */
  description?: string;
}

/** The recording's JSON, rewritten about once a second while it runs. */
export interface RecordingMeta {
  v: 1;
  kind: CaptureKind;
  /** ms since the epoch, when recording started. */
  started: number;
  mime: string;
  extension: string;
  /** Seconds recorded and bytes encoded at the last update. */
  seconds: number;
  bytes: number;
  fps?: number;
  video?: { codec: VideoCodecId; width: number; height: number; config?: StoredVideoConfig };
  audio?: {
    codec: AudioCodecId;
    channels: number;
    sampleRate: number;
    bitrate?: number;
    config?: StoredAudioConfig;
  };
  /** Set at Stop: the file was finished normally and is not offered for recovery. */
  finished?: true;
}

export function encodeEntries(entries: JournalEntry[]): ArrayBuffer {
  const buf = new ArrayBuffer(entries.length * ENTRY_BYTES);
  const v = new DataView(buf);
  entries.forEach((e, i) => {
    const o = i * ENTRY_BYTES;
    v.setUint8(o, e.track === "video" ? 0 : 1);
    v.setUint8(o + 1, e.key ? 1 : 0);
    v.setUint32(o + 4, e.size, true);
    v.setFloat64(o + 8, e.timestamp, true);
    v.setFloat64(o + 16, e.duration, true);
  });
  return buf;
}

/** Entries from an index file; a torn last entry (cut off mid-write) is ignored. */
export function decodeEntries(buf: ArrayBuffer): JournalEntry[] {
  const v = new DataView(buf);
  const n = Math.floor(buf.byteLength / ENTRY_BYTES);
  const out: JournalEntry[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * ENTRY_BYTES;
    const track = v.getUint8(o);
    const size = v.getUint32(o + 4, true);
    const timestamp = v.getFloat64(o + 8, true);
    const duration = v.getFloat64(o + 16, true);
    if (track > 1 || size === 0 || !Number.isFinite(timestamp) || !Number.isFinite(duration)) break;
    out.push({
      track: track === 0 ? "video" : "audio",
      key: v.getUint8(o + 1) === 1,
      size,
      timestamp,
      duration,
    });
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Bytes, read from a file in large windows (an `arrayBuffer()` per packet would be thousands of reads). */
export interface ByteReader {
  size: number;
  read(at: number, length: number): Promise<Uint8Array>;
}

export function blobReader(blob: Blob, window = 8 * 1024 * 1024): ByteReader {
  let start = 0;
  let buf = new Uint8Array(0);
  return {
    size: blob.size,
    async read(at, length) {
      if (at >= start && at + length <= start + buf.length)
        return buf.subarray(at - start, at - start + length);
      start = at;
      buf = new Uint8Array(
        await blob.slice(at, Math.min(blob.size, at + Math.max(window, length))).arrayBuffer(),
      );
      return buf.subarray(0, Math.min(length, buf.length));
    },
  };
}

/** Where an MP4's `mdat` payload starts, from its top-level boxes; undefined when there is none. */
export async function mdatStart(
  r: ByteReader,
): Promise<{ start: number; end: number } | undefined> {
  let pos = 0;
  while (pos + 8 <= r.size) {
    const h = await r.read(pos, 16);
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    const size32 = dv.getUint32(0);
    const type = String.fromCharCode(h[4] ?? 0, h[5] ?? 0, h[6] ?? 0, h[7] ?? 0);
    let size = size32;
    let header = 8;
    if (size32 === 1 && h.length >= 16) {
      size = Number(dv.getBigUint64(8));
      header = 16;
    }
    if (type === "mdat") {
      // The size is patched only at Stop: a cut-off file has the placeholder (0, or too small).
      const end = size >= header && pos + size <= r.size && size > header ? pos + size : r.size;
      return { start: pos + header, end };
    }
    if (!/^[a-z0-9 ]{4}$/i.test(type) || size < 8) return undefined;
    pos += size;
  }
  return undefined;
}

/**
 * Whether `data` is one H.264 packet in length-prefixed (AVCC) form: NAL units whose lengths add up
 * exactly to the packet, each with a clear forbidden bit and a known unit type.
 */
export function isAvcPacket(data: Uint8Array, lengthSize = 4): boolean {
  let off = 0;
  let units = 0;
  while (off < data.length) {
    if (off + lengthSize > data.length) return false;
    let len = 0;
    for (let i = 0; i < lengthSize; i++) len = len * 256 + (data[off + i] ?? 0);
    const nal = data[off + lengthSize];
    if (len === 0 || nal === undefined || off + lengthSize + len > data.length) return false;
    if ((nal & 0x80) !== 0 || (nal & 0x1f) === 0 || (nal & 0x1f) > 23) return false;
    off += lengthSize + len;
    units++;
  }
  return units > 0 && off === data.length;
}

/** The NAL length size an avcC description declares (1, 2 or 4). */
export function avcLengthSize(description?: Uint8Array): number {
  const b = description?.[4];
  return b === undefined ? 4 : (b & 0x03) + 1;
}

export interface FoundPacket extends JournalEntry {
  /** Where the packet's bytes start in the file. */
  offset: number;
}

/**
 * Walks an MP4's media data with the index: at each position, the next video packet when its bytes
 * are an H.264 packet of the indexed size, else the next sound packet. Stops at the end of what was
 * written, or where neither fits (the index may run ahead of the data by up to one write).
 */
export async function findPackets(
  r: ByteReader,
  data: { start: number; end: number },
  entries: JournalEntry[],
  lengthSize = 4,
): Promise<FoundPacket[]> {
  const video = entries.filter((e) => e.track === "video");
  const audio = entries.filter((e) => e.track === "audio");
  const out: FoundPacket[] = [];
  let vi = 0;
  let ai = 0;
  let pos = data.start;
  while (pos < data.end) {
    const v = video[vi];
    const a = audio[ai];
    const vFits = !!v && pos + v.size <= data.end;
    const aFits = !!a && pos + a.size <= data.end;
    if (v && a) {
      if (!vFits) break;
      if (await isVideoAt(r, pos, v.size, lengthSize)) {
        out.push({ ...v, offset: pos });
        pos += v.size;
        vi++;
        continue;
      }
      // An indexed picture packet the muxer never wrote: the next one or two may be here instead.
      const skip = await skippedVideo(r, pos, video, vi, data.end, lengthSize);
      if (skip !== undefined) {
        vi = skip;
        continue;
      }
      if (aFits) {
        out.push({ ...a, offset: pos });
        pos += a.size;
        ai++;
      } else break;
    } else if (v) {
      // Sound and picture both recorded, but the sound's index ended: a picture packet must still
      // prove itself, or what follows may be unindexed sound.
      if (!vFits || (audio.length > 0 && !(await isVideoAt(r, pos, v.size, lengthSize)))) break;
      out.push({ ...v, offset: pos });
      pos += v.size;
      vi++;
    } else if (a) {
      // The picture's index ended first: stop where an unindexed picture packet seems to start.
      if (!aFits || (video.length > 0 && looksLikeAvc(await r.read(pos, 6), lengthSize))) break;
      out.push({ ...a, offset: pos });
      pos += a.size;
      ai++;
    } else break;
  }
  return out;
}

/** The start of a length-prefixed H.264 unit: a short length and a slice, SEI or parameter set. */
function looksLikeAvc(head: Uint8Array, lengthSize: number): boolean {
  if (head.length <= lengthSize) return false;
  let len = 0;
  for (let i = 0; i < lengthSize; i++) len = len * 256 + (head[i] ?? 0);
  const nal = head[lengthSize] ?? 0x80;
  return (
    len > 0 &&
    len < 64 * 1024 * 1024 &&
    (nal & 0x80) === 0 &&
    [1, 5, 6, 7, 8, 9].includes(nal & 0x1f)
  );
}

async function skippedVideo(
  r: ByteReader,
  pos: number,
  video: JournalEntry[],
  from: number,
  end: number,
  lengthSize: number,
): Promise<number | undefined> {
  for (let k = from + 1; k <= from + 2; k++) {
    const e = video[k];
    if (e && pos + e.size <= end && (await isVideoAt(r, pos, e.size, lengthSize))) return k;
  }
  return undefined;
}

async function isVideoAt(r: ByteReader, pos: number, size: number, lengthSize: number) {
  return isAvcPacket(await r.read(pos, size), lengthSize);
}

/**
 * A cut-off WAV made whole: the RIFF and data sizes written from the bytes on disk (whole sample
 * frames only). Returns the new header and the data range, or undefined when it is not a RIFF WAV.
 */
export function fixWavHeader(
  head: Uint8Array,
  fileSize: number,
): { header: Uint8Array; dataStart: number; dataLength: number } | undefined {
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const tag = (o: number) =>
    String.fromCharCode(head[o] ?? 0, head[o + 1] ?? 0, head[o + 2] ?? 0, head[o + 3] ?? 0);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return undefined;
  let pos = 12;
  let block = 0;
  while (pos + 8 <= head.length) {
    const id = tag(pos);
    const size = dv.getUint32(pos + 4, true);
    if (id === "fmt ") block = dv.getUint16(pos + 20, true);
    if (id === "data") {
      const dataStart = pos + 8;
      if (block <= 0) return undefined;
      const dataLength = Math.floor(Math.max(0, fileSize - dataStart) / block) * block;
      const header = head.slice(0, dataStart);
      const hv = new DataView(header.buffer);
      hv.setUint32(4, dataStart + dataLength - 8, true);
      hv.setUint32(pos + 4, dataLength, true);
      return { header, dataStart, dataLength };
    }
    pos += 8 + size + (size % 2);
  }
  return undefined;
}

/**
 * The end of the last whole Ogg page: a cut-off Ogg file is whole up to there. Pages are walked
 * from the start by their headers ("OggS", segment table); 0 when there is none.
 */
export function oggWholeLength(bytes: Uint8Array): number {
  let pos = 0;
  let end = 0;
  while (pos + 27 <= bytes.length) {
    if (
      bytes[pos] !== 0x4f ||
      bytes[pos + 1] !== 0x67 ||
      bytes[pos + 2] !== 0x67 ||
      bytes[pos + 3] !== 0x53
    )
      break;
    const segments = bytes[pos + 26] ?? 0;
    if (pos + 27 + segments > bytes.length) break;
    let body = 0;
    for (let i = 0; i < segments; i++) body += bytes[pos + 27 + i] ?? 0;
    const next = pos + 27 + segments + body;
    if (next > bytes.length) break;
    end = next;
    pos = next;
  }
  return end;
}

const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const CLUSTER_ID = 0x1f43b675;
/** Elements that may follow a cluster inside a segment; anything else means the cluster ran on. */
const SEGMENT_CHILDREN = new Set([
  0x114d9b74,
  0x1549a966,
  0x1654ae6b,
  CLUSTER_ID,
  0x1c53bb6b,
  0x1941a469,
  0x1043a770,
  0x1254c367,
  0xec,
]);

function readId(b: Uint8Array, pos: number): { id: number; len: number } | undefined {
  const first = b[pos];
  if (first === undefined || first === 0) return undefined;
  let len = 1;
  while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 4 || pos + len > b.length) return undefined;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + (b[pos + i] ?? 0);
  return { id, len };
}
function readSize(
  b: Uint8Array,
  pos: number,
): { size: number; len: number; unknown: boolean } | undefined {
  const first = b[pos];
  if (first === undefined || first === 0) return undefined;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || pos + len > b.length) return undefined;
  let size = first & (0xff >> len);
  let ones = size === 0xff >> len;
  for (let i = 1; i < len; i++) {
    const x = b[pos + i] ?? 0;
    size = size * 256 + x;
    if (x !== 0xff) ones = false;
  }
  return { size, len, unknown: ones };
}
/** An all-ones size of `len` bytes: "unknown", read to the end of the parent. */
function unknownSize(len: number): Uint8Array {
  const out = new Uint8Array(len).fill(0xff);
  out[0] = (0xff >> len) | (0x80 >> (len - 1));
  return out;
}

export interface BytePatch {
  at: number;
  bytes: Uint8Array;
}

/** `value` as an EBML size of exactly `len` bytes. */
function sizeOfLength(value: number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let v = value;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] = (out[0] ?? 0) | (0x80 >> (len - 1));
  return out;
}

/** Elements inside a cluster: its timestamp, blocks and the rest a muxer writes. */
const CLUSTER_CHILDREN = new Set([0xe7, 0xa3, 0xa0, 0xab, 0xa7, 0x5854]);

export interface WebmRepair {
  patches: BytePatch[];
  /** Where the file is cut: after the last whole block. */
  end: number;
}

/**
 * A cut-off WebM made readable. The Segment's size is written only at Stop, and so is the size of
 * the cluster being written: the Segment's becomes "unknown" (read to the end), and the last cluster
 * is closed after its last whole block, where the file is then cut. Walks the elements with the
 * reader, skipping whole clusters, so a large file is not read whole.
 */
export async function webmPatches(r: ByteReader): Promise<WebmRepair | undefined> {
  const at = async (pos: number) => {
    const b = await r.read(pos, 16);
    const id = readId(b, 0);
    const size = id && readSize(b, id.len);
    return id && size ? { id: id.id, idLen: id.len, ...size } : undefined;
  };
  const ebml = await at(0);
  if (!ebml || ebml.id !== EBML_ID) return undefined;
  let pos = ebml.idLen + ebml.len + ebml.size;
  const seg = await at(pos);
  if (!seg || seg.id !== SEGMENT_ID) return undefined;
  const patches: BytePatch[] = [{ at: pos + seg.idLen, bytes: unknownSize(seg.len) }];
  pos += seg.idLen + seg.len;
  let last: { start: number; sizeAt: number; len: number; data: number } | undefined;
  let end = r.size;
  while (pos < r.size) {
    const e = await at(pos);
    const next = e ? pos + e.idLen + e.len + e.size : r.size;
    const intact = e && SEGMENT_CHILDREN.has(e.id) && !e.unknown && next <= r.size;
    if (e?.id === CLUSTER_ID)
      last = { start: pos, sizeAt: pos + e.idLen, len: e.len, data: pos + e.idLen + e.len };
    if (intact && e.id === CLUSTER_ID) {
      // A whole cluster whose next element is not a segment child ran on past its size (it was
      // being written): it is checked below like a cut one.
      const after = next < r.size ? await at(next) : undefined;
      if (!after || SEGMENT_CHILDREN.has(after.id)) {
        pos = next;
        continue;
      }
    } else if (intact) {
      pos = next;
      continue;
    }
    if (!last || (e && e.id !== CLUSTER_ID && SEGMENT_CHILDREN.has(e.id))) {
      end = pos;
      break;
    }
    // Inside the last cluster: keep every whole child, then close the cluster there.
    let c = last.data;
    while (c < r.size) {
      const k = await at(c);
      if (!k || !CLUSTER_CHILDREN.has(k.id) || k.unknown) break;
      const kEnd = c + k.idLen + k.len + k.size;
      if (kEnd > r.size) break;
      c = kEnd;
    }
    patches.push({ at: last.sizeAt, bytes: sizeOfLength(c - last.data, last.len) });
    end = c;
    break;
  }
  return { patches, end };
}
