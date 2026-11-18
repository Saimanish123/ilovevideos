/**
 * Opus encoder delay and flush. Measured in Chromium (2026-10-08) on WebCodecs' Opus encoder:
 *
 * - The OpusHead pre-skip it declares (312) is the codec's look-ahead only. Fed anything but 48 kHz
 *   it resamples first and that adds its own delay, undeclared: the real delay is 346 samples (at
 *   48 kHz) for 44.1 kHz input, 360 for 32 kHz, 382 for 22.05 kHz. At 16 kHz it declares 104 (the
 *   look-ahead in input samples, not 48 kHz ones) while the delay is 312.
 * - Flushed after non-48 kHz input it drops the end: 3 s at 44.1 kHz came out as 150 packets
 *   (143 688 samples once the pre-skip is skipped, 6.5 ms short), where the sound needs 151.
 *   WebKit's (26.5) declares the right pre-skip at 44.1 kHz but also needs more than the delay as
 *   flush silence: a 4 s WAV padded by 313 samples still came out 312 short.
 * - Nothing in the containers says where the sound ends. mediabunny writes the Ogg end granule as
 *   the sum of the packets (13.5 ms long for a 4 s WAV), a Matroska CodecDelay of 0 with the pre-skip
 *   in SeekPreRoll, and no DiscardPadding.
 *
 * So: measure the real delay once per input rate and layout (encode a pulse, decode it with a
 * pre-skip of 0, find it), append that much silence before the encoder is flushed so every real
 * sample comes out, then write the real pre-skip and the real end into the container
 * (./ogg-opus, ./matroska-timing, and the MP4 edit list in ./edit-list).
 *
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import { AudioSample, type AudioSampleSource } from "mediabunny";

/** Opus always decodes at 48 kHz; pre-skip and granules count 48 kHz samples (RFC 7845 §4). */
export const OPUS_RATE = 48_000;

export interface OpusDelay {
  /** Samples at 48 kHz from the first decoded sample to the first sample fed in. */
  preSkip: number;
  /** The pre-skip the encoder wrote into its OpusHead. */
  declared: number;
  /** Silent frames, at the input rate, to append so the flush emits every real sample: the delay and a frame. */
  padFrames: number;
}

/** Where the probe pulse sits in the probe signal (input samples), and its length. */
const PULSE_AT = 1024;
const PROBE_FRAMES = 4096;
/** Longest delay we believe: look-ahead plus any resampler, with a wide margin. */
const MAX_DELAY = 4096;

const pulse = (i: number) => 0.5 * Math.exp(-(i * i) / 72);
const measured = new Map<string, Promise<OpusDelay | null>>();

/** OpusHead fields (RFC 7845 §5.1): channels, pre-skip and input rate, or null when not one. */
export function readOpusHead(
  head: Uint8Array,
): { channels: number; preSkip: number; inputRate: number } | null {
  if (head.length < 19 || String.fromCharCode(...head.subarray(0, 8)) !== "OpusHead") return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  return {
    channels: view.getUint8(9),
    preSkip: view.getUint16(10, true),
    inputRate: view.getUint32(12, true),
  };
}

/** A view of a codec description, whichever buffer type it came as. */
export const bytesOf = (d: AllowSharedBufferSource): Uint8Array =>
  ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);

/** Writes `preSkip` into an OpusHead in place. */
export function setOpusHeadPreSkip(head: Uint8Array, preSkip: number) {
  new DataView(head.buffer, head.byteOffset, head.byteLength).setUint16(10, preSkip, true);
}

/**
 * Samples (48 kHz) one Opus packet decodes to, from its TOC byte (RFC 6716 §3.1). 0 for an empty or
 * malformed packet.
 */
export function opusPacketSamples(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) return 0;
  const config = toc >> 3;
  // SILK 10/20/40/60 ms, hybrid 10/20 ms, CELT 2.5/5/10/20 ms; in 48 kHz samples.
  const size =
    config < 12
      ? [480, 960, 1920, 2880][config & 3]
      : config < 16
        ? [480, 960][config & 1]
        : [120, 240, 480, 960][config & 3];
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return (size ?? 0) * frames;
}

/**
 * The real delay of this browser's WebCodecs Opus encoder for this input rate and layout, measured
 * once and cached. Null when there is no Opus encoder or decoder, or the pulse is not found: the
 * output then keeps the declared pre-skip and only its end is fixed.
 */
export function opusEncoderDelay(sampleRate: number, channels: number): Promise<OpusDelay | null> {
  const key = `${sampleRate}/${channels}`;
  let p = measured.get(key);
  if (!p) {
    p = measure(sampleRate, channels).catch(() => null);
    measured.set(key, p);
  }
  return p;
}

async function measure(sampleRate: number, channels: number): Promise<OpusDelay | null> {
  if (typeof AudioEncoder === "undefined" || typeof AudioDecoder === "undefined") return null;
  const config: AudioEncoderConfig = {
    codec: "opus",
    sampleRate,
    numberOfChannels: channels,
    bitrate: 64_000 * Math.max(1, channels),
  };
  if (!(await AudioEncoder.isConfigSupported(config)).supported) return null;

  const chunks: EncodedAudioChunk[] = [];
  let decoderConfig: AudioDecoderConfig | undefined;
  let failed = false;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      chunks.push(chunk);
      if (meta?.decoderConfig) decoderConfig = meta.decoderConfig;
    },
    error: () => {
      failed = true;
    },
  });
  encoder.configure(config);
  const data = new Float32Array(PROBE_FRAMES * channels);
  for (let c = 0; c < channels; c++)
    for (let i = -40; i <= 40; i++) data[c * PROBE_FRAMES + PULSE_AT + i] = pulse(i);
  const input = new AudioData({
    format: "f32-planar",
    sampleRate,
    numberOfFrames: PROBE_FRAMES,
    numberOfChannels: channels,
    timestamp: 0,
    data,
  });
  encoder.encode(input);
  input.close();
  await encoder.flush();
  encoder.close();
  const description = decoderConfig?.description;
  if (failed || !decoderConfig || !description || chunks.length === 0) return null;
  const head = bytesOf(description).slice();
  const declared = readOpusHead(head)?.preSkip;
  if (declared === undefined) return null;
  // Decode with a pre-skip of 0 so the decoder drops nothing and the pulse shows the whole delay.
  setOpusHeadPreSkip(head, 0);

  let packets = 0;
  for (const chunk of chunks) {
    const bytes = new Uint8Array(chunk.byteLength);
    chunk.copyTo(bytes);
    packets += opusPacketSamples(bytes);
  }
  const planes: Float32Array[] = [];
  const decoder = new AudioDecoder({
    output: (audio) => {
      const plane = new Float32Array(audio.numberOfFrames);
      audio.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
      planes.push(plane);
      audio.close();
    },
    error: () => {
      failed = true;
    },
  });
  decoder.configure({ ...decoderConfig, description: head });
  for (const chunk of chunks) decoder.decode(chunk);
  await decoder.flush();
  decoder.close();
  if (failed) return null;

  const decoded = new Float32Array(planes.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of planes) {
    decoded.set(p, pos);
    pos += p.length;
  }
  // A decoder that skips a pre-skip of its own anyway: count it back in.
  const dropped = Math.max(0, packets - decoded.length);
  let at = -1;
  let best = 0;
  for (let i = 1; i + 1 < decoded.length; i++) {
    const v = decoded[i] ?? 0;
    if (v > best) {
      best = v;
      at = i;
    }
  }
  // Half the pulse is plenty for a lossy codec on a smooth pulse; less means it was not found.
  if (at < 0 || best < 0.25) return null;
  // Sub-sample peak: a parabola through the peak and its neighbours.
  const l = decoded[at - 1] ?? 0;
  const r = decoded[at + 1] ?? 0;
  const bend = l - 2 * best + r;
  const peak = at + (bend < 0 ? (0.5 * (l - r)) / bend : 0);
  const preSkip = Math.round(peak + dropped - (PULSE_AT * OPUS_RATE) / sampleRate);
  if (preSkip < 0 || preSkip > MAX_DELAY) return null;
  return {
    preSkip,
    declared,
    // The delay plus one whole 20 ms frame: WebKit's encoder (Playwright WebKit 26.5) still dropped
    // the end of a 4 s 44.1 kHz input padded by the delay alone. Packets that end up wholly past the
    // end are dropped again when the container is written (./ogg-opus, ./matroska-timing).
    padFrames: Math.ceil(((preSkip + 960) * sampleRate) / OPUS_RATE) + 1,
  };
}

/**
 * AAC flush silence, input frames: the encoder delay (2112 in Chromium and WebKit, measured) and one
 * frame. WebKit's AAC encoder (Safari 26.5 engine) dropped the last 328 samples of a 3 s sound
 * without it; the edit list ends the sound where it really ends, so the silence is never played.
 */
const AAC_TAIL_FRAMES = 2112 + 1024;

/** Flush silence for an encoder fed by hand or through a Conversion; 0 for codecs that need none. */
export async function tailFrames(codec: string, sampleRate: number, channels: number) {
  if (codec === "aac") return AAC_TAIL_FRAMES;
  if (codec === "opus") return opusTailFrames(sampleRate, channels);
  return 0;
}

/** Silent frames for the encoder flush: the measured delay, or the declared look-ahead plus a frame. */
export async function opusTailFrames(sampleRate: number, channels: number): Promise<number> {
  const delay = await opusEncoderDelay(sampleRate, channels);
  return delay?.padFrames ?? Math.ceil(((312 + 960) * sampleRate) / OPUS_RATE);
}

/** `frames` of silence at `timestamp` (seconds), in the layout of the encoder input. */
export function silence(
  frames: number,
  sampleRate: number,
  channels: number,
  timestamp: number,
): AudioSample {
  return new AudioSample({
    data: new Float32Array(frames * channels),
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate,
    timestamp,
  });
}

/**
 * Silence in the same sample format as `like`: an encoder fed a different format part-way (WebKit's
 * AAC encoder, given f32 silence before s16 sound) starts over and swallows its start again.
 */
export function silenceLike(like: AudioSample, frames: number, timestamp: number): AudioSample {
  const bytes: Record<string, number> = { u8: 1, s16: 2, s32: 4, f32: 4 };
  const base = like.format.replace("-planar", "");
  const per = bytes[base] ?? 4;
  const data = new Uint8Array(frames * like.numberOfChannels * per);
  if (base === "u8") data.fill(128);
  return new AudioSample({
    data,
    format: like.format,
    numberOfChannels: like.numberOfChannels,
    sampleRate: like.sampleRate,
    timestamp,
  });
}

type Process = (
  sample: AudioSample,
) => AudioSample | AudioSample[] | null | Promise<AudioSample | AudioSample[] | null>;

/**
 * Conversion `audio.process` step for an Opus encode that must end exactly at `endSec` (output
 * time): samples are cut at `endSec`, anything after is dropped, and the encoder's flush silence is
 * appended right after the end so the last real samples are emitted (see above). `inner` runs first.
 */
export function opusEndGate(
  endSec: number,
  inner?: Process,
  codec = "opus",
  /**
   * Silent frames to feed before the first sample: the encoder's silenced start (AAC in WebKit,
   * ./priming `aacEncoderStart`), skipped again by the edit list with the priming.
   */
  leadFrames = 0,
): Process {
  let ended = false;
  let started = leadFrames <= 0;
  let shift = 0;
  return async (sample) => {
    const got = inner ? await inner(sample) : sample;
    if (got === null) return null;
    const list = Array.isArray(got) ? got : [got];
    const out: AudioSample[] = [];
    const head = list[0];
    if (!started && head) {
      started = true;
      out.push(silenceLike(head, leadFrames, head.timestamp));
      // Everything after the lead moves back by it: WebKit's encoder lets input with the same
      // timestamp overwrite the lead (measured: the click at 0 s still vanished).
      shift = leadFrames / head.sampleRate;
    }
    for (const s of list) {
      const half = 0.5 / s.sampleRate;
      if (ended || s.timestamp >= endSec - half) {
        if (s !== sample) s.close();
        continue;
      }
      let kept = s;
      const keepFrames = Math.round((endSec - s.timestamp) * s.sampleRate);
      if (keepFrames < s.numberOfFrames) {
        kept = s.trim(0, keepFrames);
        if (s !== sample) s.close();
      }
      const reachesEnd = kept.timestamp + kept.duration >= endSec - half;
      if (shift > 0) {
        if (kept === sample) {
          kept = sample.clone();
        }
        kept.setTimestamp(kept.timestamp + shift);
      }
      out.push(kept);
      if (reachesEnd) {
        ended = true;
        const frames = await tailFrames(codec, kept.sampleRate, kept.numberOfChannels);
        out.push(silenceLike(kept, frames, endSec + shift));
      }
    }
    return out.length === 0 ? null : out.length === 1 ? (out[0] ?? null) : out;
  };
}

/**
 * For encodes fed by hand: after the last sample, adds the encoder's flush silence at `atSec` (the
 * end of the sound) so its last samples come out. Nothing for codecs other than Opus and AAC. The container
 * is told where the sound ends afterwards (./priming `withEncoderDelaySignalled`).
 */
export async function addOpusTail(
  source: AudioSampleSource,
  codec: string,
  sampleRate: number,
  channels: number,
  atSec: number,
): Promise<void> {
  if (codec !== "opus" && codec !== "aac") return;
  const pad = silence(await tailFrames(codec, sampleRate, channels), sampleRate, channels, atSec);
  try {
    await source.add(pad);
  } finally {
    pad.close();
  }
}
