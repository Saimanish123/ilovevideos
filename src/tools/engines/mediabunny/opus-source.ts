/**
 * Where an Opus source's sound really ends. Opus encoders pad the last packet, and the container
 * says how much of it is sound: the last Ogg page's granule position (RFC 7845 §4.5) or the last
 * Matroska block's DiscardPadding. mediabunny 1.55.5 reads neither, so an ffmpeg-made 4 s .opus read
 * as 4.0135 s and a 3 s WebM's sound as 3.008 s (measured 2026-10-08), and every tool that decoded
 * them wrote the padding as sound.
 *
 * The end returned is in mediabunny's timeline for the track, which a WebCodecs decode follows
 * sample for sample (the decoder applies the OpusHead pre-skip and stamps its output contiguously
 * from the first packet; measured: clicks land within 16 µs). Ogg is exact to the sample. Matroska
 * block times are whole milliseconds, so a WebM end is counted in packets of one frame size, which
 * is exact for every encoder that keeps its frame size (libopus, WebCodecs).
 *
 * Reads at most the last 256 KB of the file. No network access.
 */
import { EncodedPacketSink, type InputAudioTrack } from "mediabunny";
import { bytesOf, OPUS_RATE, opusPacketSamples, readOpusHead } from "./opus-delay";

/** The tail read for the last Ogg page or Matroska block group. */
const TAIL = 256 * 1024;

/** The granule position of the last complete Ogg page in `tail`, or null. */
export function lastOggGranule(tail: Uint8Array): bigint | null {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let at = tail.length - 27; at >= 0; at--) {
    if (view.getUint32(at) !== 0x4f676753) continue; // "OggS"
    const count = tail[at + 26] ?? 0;
    let size = 27 + count;
    for (let i = 0; i < count; i++) size += tail[at + 27 + i] ?? 0;
    if (at + size !== tail.length) continue;
    const granule = view.getBigInt64(at + 6, true);
    return granule >= 0n ? granule : null;
  }
  return null;
}

function vint(b: Uint8Array, p: number): { value: number; len: number } | null {
  const first = b[p];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (!(first & (0x80 >> (len - 1)))) len++;
  let value = first & (0xff >> len);
  for (let i = 1; i < len; i++) value = value * 256 + (b[p + i] ?? 0);
  return p + len <= b.length ? { value, len } : null;
}

/**
 * DiscardPadding (nanoseconds) of the BlockGroup in `tail` whose Block carries `frame`, or 0 when
 * that block has none. Null when the block is not found.
 */
export function discardPaddingOf(tail: Uint8Array, frame: Uint8Array): number | null {
  if (frame.length === 0) return null;
  for (let at = tail.length - frame.length; at >= 0; at--) {
    if (tail[at] !== frame[0]) continue;
    let same = true;
    for (let i = 1; i < frame.length && same; i++) same = tail[at + i] === frame[i];
    if (!same) continue;
    // The frame ends a Block; in a BlockGroup, DiscardPadding follows among its siblings
    // (BlockDuration, ReferenceBlock and the like may come first).
    let p = at + frame.length;
    for (let k = 0; k < 4; k++) {
      const id = (tail[p] ?? 0) === 0x75 && tail[p + 1] === 0xa2 ? 0x75a2 : (tail[p] ?? 0);
      const idLen = id === 0x75a2 ? 2 : 1;
      if (id !== 0x75a2 && id !== 0x9b && id !== 0xfb && id !== 0xfa) return 0;
      const size = vint(tail, p + idLen);
      if (!size || size.value > 8) return 0;
      const from = p + idLen + size.len;
      if (id === 0x75a2) {
        let v = 0n;
        for (let i = 0; i < size.value; i++) v = (v << 8n) | BigInt(tail[from + i] ?? 0);
        return size.value > 0 ? Number(BigInt.asIntN(8 * size.value, v)) : 0;
      }
      p = from + size.value;
    }
    return 0;
  }
  return null;
}

/**
 * The end of an Opus track's sound in Ogg or WebM/Matroska, from the container's end trimming;
 * undefined when the track is not Opus, the container signals nothing, or it cannot be read.
 */
export async function opusSourceEnd(
  file: File,
  track: InputAudioTrack,
): Promise<number | undefined> {
  if (track.codec !== "opus") return undefined;
  try {
    const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const config = await track.getDecoderConfig();
    const head = config?.description ? readOpusHead(bytesOf(config.description)) : null;
    if (!head) return undefined;
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL)).arrayBuffer());
    if (String.fromCharCode(...magic) === "OggS") {
      const granule = lastOggGranule(tail);
      if (granule === null || granule <= 0n) return undefined;
      return (Number(granule) - head.preSkip) / OPUS_RATE;
    }
    if (magic[0] === 0x1a && magic[1] === 0x45 && magic[2] === 0xdf && magic[3] === 0xa3) {
      const sink = new EncodedPacketSink(track);
      const last = await sink.getPacket(Number.POSITIVE_INFINITY);
      const first = await sink.getFirstPacket({ metadataOnly: true });
      if (!last || !first) return undefined;
      const discardNs = discardPaddingOf(tail, last.data);
      if (!discardNs) return undefined;
      const frame = opusPacketSamples(last.data);
      // Block times are whole milliseconds (ffmpeg's last block of a 3 s file sits at 3001 ms).
      // Encoders keep one frame size, so the packet count from the first and last times is exact,
      // and with it the end, to the sample; otherwise the last block's own time is used.
      const steps = (last.timestamp - first.timestamp) / (frame / OPUS_RATE);
      const packets = Math.round(steps) + 1;
      const samples =
        frame > 0 && Math.abs(steps - Math.round(steps)) < 0.1
          ? packets * frame - head.preSkip - Math.round((discardNs / 1e9) * OPUS_RATE)
          : undefined;
      return samples !== undefined
        ? first.timestamp + samples / OPUS_RATE
        : last.timestamp + (frame - head.preSkip) / OPUS_RATE - discardNs / 1e9;
    }
  } catch {
    // The end is a refinement; without it the sound is read as mediabunny reads it.
  }
  return undefined;
}
