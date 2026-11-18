/**
 * AAC encoder delay ("priming"). Every AAC encoder emits silence before the first real sample (the
 * filterbank's look-back plus look-ahead): Chromium's WebCodecs AAC encoder on macOS emits 2112
 * samples, 47.9 ms at 44.1 kHz. WebCodecs does not report it and stamps the first packet with the
 * first input timestamp, so without an edit list the sound plays that much late and the track runs
 * that much long. mediabunny cannot write an edit list with a media time (see ./edit-list), so the
 * runner measures the delay once per format in this browser and writes the edit list afterwards.
 * `withEncoderDelaySignalled` does the same for Opus in every container (./opus-delay).
 *
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import {
  AudioSampleSource,
  BlobSource,
  BufferSource,
  Input,
  MP4,
  type Output,
  QTFF,
} from "mediabunny";
import { applyPrimingEdits, editTrailingMoov, type PrimingEdit } from "./edit-list";
import {
  aacPlan,
  fixMatroskaOpus,
  type MatroskaTrackPlan,
  matroskaOpusTracks,
  matroskaSoundTracks,
} from "./matroska-timing";
import { fixOggOpus } from "./ogg-opus";
import { bytesOf, OPUS_RATE, opusEncoderDelay, readOpusHead, silence } from "./opus-delay";
import { bytesOf as wholeBytes } from "./output-store";
import type { OutputId } from "./shared";

/** Longest delay we believe: no AAC-LC encoder primes with more than a few frames. */
const MAX_PRIMING = 4096;
/** The probe: a burst of pseudo-random noise (its cross-correlation has one sharp peak). */
const BURST_FROM = 2048;
const BURST_TO = 6144;
const PROBE_FRAMES = 16_384;

/** The probe signal: a tone from the first sample (to see whether the start survives), then the burst. */
function probeSignal(rate: number): Float32Array {
  const x = new Float32Array(PROBE_FRAMES);
  for (let i = 0; i < BURST_FROM; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 1000 * i) / rate);
  let seed = 1;
  for (let i = BURST_FROM; i < BURST_TO; i++) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fff_ffff;
    x[i] = 0.3 * ((seed / 0x7fff_ffff) * 2 - 1);
  }
  return x;
}

export interface AacStart {
  /** Encoder delay (priming) in samples. */
  priming: number;
  /**
   * Input samples the encoder silences at its very start, rounded up to whole frames: 1024 in
   * WebKit (Safari 26.5 engine; a click at 0 s vanished), 0 in Chromium. Encodes that know it feed
   * that much silence first, and the edit list skips it with the priming.
   */
  lost: number;
}

const measured = new Map<string, Promise<AacStart>>();

/** Priming and lost start of this browser's AAC encoder for this rate and layout, measured once. */
export function aacEncoderStart(sampleRate: number, channels: number): Promise<AacStart> {
  const key = `${sampleRate}/${channels}`;
  let p = measured.get(key);
  if (!p) {
    p = measure(sampleRate, channels).catch(() => ({ priming: 0, lost: 0 }));
    measured.set(key, p);
  }
  return p;
}

/**
 * The encoder delay in samples of this browser's WebCodecs AAC encoder for this rate and layout,
 * measured by encoding a noise burst and finding it in the decoded output by cross-correlation (a
 * smooth pulse, used before, came out 4 samples off in WebKit; the noise gives 2112 in both). 0 when
 * it cannot be measured (no encoder, no decoder, burst not found): the output is then left as
 * mediabunny wrote it.
 */
export async function aacPrimingSamples(sampleRate: number, channels: number): Promise<number> {
  return (await aacEncoderStart(sampleRate, channels)).priming;
}

async function measure(sampleRate: number, channels: number): Promise<AacStart> {
  const none = { priming: 0, lost: 0 };
  if (typeof AudioEncoder === "undefined" || typeof AudioDecoder === "undefined") return none;
  const config: AudioEncoderConfig = {
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: channels,
    // Stereo at 64 kbps is rejected by the macOS encoder; the delay does not depend on the rate.
    bitrate: 64_000 * Math.max(1, channels),
  };
  if (!(await AudioEncoder.isConfigSupported(config)).supported) return none;

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
  const burst = probeSignal(sampleRate);
  const data = new Float32Array(PROBE_FRAMES * channels);
  for (let c = 0; c < channels; c++) data.set(burst, c * PROBE_FRAMES);
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
  if (failed || !decoderConfig || chunks.length === 0) return none;

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
  // WebKit's encoder hands out an MPEG-4 ES_Descriptor where an AudioSpecificConfig belongs, and its
  // own decoder then fails ("InternalAudioDecoderCocoa decoding failed"), which left the delay
  // unmeasured and WebKit AAC 2112 samples late. mediabunny rebuilds the config for the files it
  // writes; the probe does the same.
  decoder.configure({
    ...decoderConfig,
    description: aacConfig(decoderConfig.description, sampleRate, channels),
  });
  for (const chunk of chunks) decoder.decode(chunk);
  await decoder.flush();
  decoder.close();
  if (failed) return none;

  const decoded = new Float32Array(planes.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of planes) {
    decoded.set(p, pos);
    pos += p.length;
  }
  // Cross-correlate with the burst: the lag of the peak is the delay.
  let best = 0;
  let at = -1;
  for (let lag = 0; lag <= MAX_PRIMING; lag++) {
    let acc = 0;
    for (let i = BURST_FROM; i < BURST_TO; i++) acc += (burst[i] ?? 0) * (decoded[i + lag] ?? 0);
    if (acc > best) {
      best = acc;
      at = lag;
    }
  }
  let energy = 0;
  for (let i = BURST_FROM; i < BURST_TO; i++) energy += (burst[i] ?? 0) ** 2;
  // A lossy codec keeps most of the burst; well under half means the burst was not found.
  if (at < 0 || best < energy * 0.5) return none;
  // Where sound first comes out against where it went in: the encoder's silenced start, if any.
  let first = -1;
  for (let i = 0; i < decoded.length; i++)
    if (Math.abs(decoded[i] ?? 0) > 0.05) {
      first = i;
      break;
    }
  const gap = first < 0 ? 0 : first - at;
  const lost = gap > 256 ? Math.ceil(gap / 1024) * 1024 : 0;
  return { priming: at, lost };
}

const AAC_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

/**
 * A usable AudioSpecificConfig: the encoder's own when it is one, else the DecoderSpecificInfo inside
 * an ES_Descriptor (WebKit), else one built for AAC-LC at this rate and layout.
 */
export function aacConfig(
  description: AllowSharedBufferSource | undefined,
  sampleRate: number,
  channels: number,
): Uint8Array {
  const d = description ? bytesOf(description) : new Uint8Array(0);
  const objectType = (d[0] ?? 0) >> 3;
  if (d.length >= 2 && objectType > 0 && objectType < 31 && d[0] !== 0x03) return d;
  // ES_Descriptor (tag 3) → DecoderConfigDescriptor (tag 4) → DecoderSpecificInfo (tag 5).
  for (let i = 0; i + 2 < d.length; i++) {
    if (d[i] !== 0x05) continue;
    let len = 0;
    let at = i + 1;
    for (let k = 0; k < 4 && at < d.length; k++) {
      const b = d[at++] ?? 0;
      len = (len << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    const asc = d.subarray(at, at + len);
    const type = (asc[0] ?? 0) >> 3;
    if (len >= 2 && len <= 8 && at + len <= d.length && type > 0 && type < 31) return asc;
  }
  const index = Math.max(0, AAC_RATES.indexOf(sampleRate));
  const asc = (2 << 11) | (index << 7) | (Math.min(7, channels) << 3);
  return Uint8Array.of(asc >> 8, asc & 0xff);
}

/**
 * After a mediabunny Output is finalized, for the audio tracks encoded here (copied sound is never
 * touched), writes where the encoder's delay ends and where the sound fed in ends:
 *
 * - AAC in MP4/MOV/M4A: an edit list skipping the measured priming, ending at `endSec`.
 * - Opus in MP4: the same edit list with the measured pre-skip, also written into `dOps`.
 * - Opus in Ogg: the measured pre-skip in OpusHead and the end granule (./ogg-opus).
 * - Opus in WebM/MKV: CodecDelay, OpusHead and DiscardPadding (./matroska-timing).
 *
 * `endSec` is the length of the sound that was fed in, from the output's zero. `data` is the
 * finished file in memory, or a Blob when it was streamed to disk (./output-store; an MP4 then has
 * its index last, which is edited alone). Returns the file as parts, or null when there is nothing
 * to fix; the caller then keeps its file as it is.
 */
export async function withEncoderDelaySignalled(
  output: Output,
  data: ArrayBuffer | Blob,
  to: OutputId,
  endSec?: number,
  /**
   * Movie time the encoded sound was fed from (0 for every engine that feeds it from the output's
   * zero). Given, it replaces the start taken from the first packet's timestamp, which WebKit's AAC
   * encoder gets wrong (./edit-list `startSec`).
   */
  startSec?: number,
  /**
   * True when the AAC encoder was fed its silenced start as silence first (`opusEndGate` lead,
   * `addAacLead`): the edit list then skips that too.
   */
  aacLeadPadded = false,
): Promise<BlobPart[] | null> {
  const audio = output.tracks.filter((t) => t.type === "audio");
  const encoded = audio.map((t) => t.source instanceof AudioSampleSource);
  if (!encoded.includes(true)) return null;
  const end = endSec !== undefined && Number.isFinite(endSec) && endSec > 0 ? endSec : undefined;
  const iso = to === "mp4" || to === "mov" || to === "m4a";
  // Ogg and Matroska are rewritten whole: read back unless too large to hold (then left as muxed).
  const bytes = data instanceof Blob ? (iso ? null : await wholeBytes(data)) : new Uint8Array(data);
  if (!iso && !bytes) return null;

  if (to === "ogg" && bytes) {
    const head = readOggOpusHead(bytes);
    if (!head) return null;
    const delay = await opusEncoderDelay(head.inputRate, head.channels);
    const fixed = fixOggOpus(bytes, {
      preSkip: delay?.preSkip,
      endSec: end ?? Number.POSITIVE_INFINITY,
    });
    return fixed ? [fixed] : null;
  }

  if ((to === "webm" || to === "mkv") && bytes) {
    // Matroska track numbers are mediabunny's output track ids: the order tracks were added in.
    const encodedNumbers = new Set(
      audio.filter((_, i) => encoded[i]).map((t) => output.tracks.indexOf(t) + 1),
    );
    const preSkip = new Map<number, number>();
    const heads = matroskaOpusTracks(bytes).filter((h) => encodedNumbers.has(h.trackNumber));
    for (const h of heads) {
      const delay = await opusEncoderDelay(h.inputRate, h.channels);
      if (delay) preSkip.set(h.trackNumber, delay.preSkip);
    }
    // AAC encoded into MKV: its priming as CodecDelay and its end as DiscardPadding (before, MKV
    // outputs played the encoder's 2112 samples of priming).
    const more = new Map<number, MatroskaTrackPlan>();
    for (const t of matroskaSoundTracks(bytes)) {
      if (!encodedNumbers.has(t.trackNumber) || !t.codecId.startsWith("A_AAC")) continue;
      const start = await aacEncoderStart(Math.round(t.rate), t.channels);
      const priming = start.priming + (aacLeadPadded ? start.lost : 0);
      if (start.priming > 0)
        more.set(
          t.trackNumber,
          aacPlan(priming, Math.round(t.rate), end ?? Number.POSITIVE_INFINITY),
        );
    }
    if (heads.length === 0 && more.size === 0) return null;
    const opusNumbers = new Set(heads.map((h) => h.trackNumber));
    return fixMatroskaOpus(bytes, {
      endSec: end ?? Number.POSITIVE_INFINITY,
      preSkip,
      tracks: opusNumbers,
      more,
    });
  }

  if (!iso) return null;
  const input = new Input({
    source: data instanceof Blob ? new BlobSource(data) : new BufferSource(data),
    formats: [MP4, QTFF],
  });
  const edits: PrimingEdit[] = [];
  try {
    // mediabunny writes tracks in the order they were added, so the nth audio track read back is the
    // nth audio track of the output.
    const tracks = await input.getAudioTracks();
    for (const [i, track] of tracks.entries()) {
      if (!encoded[i]) continue;
      if (track.codec === "aac") {
        const start = await aacEncoderStart(track.sampleRate, track.numberOfChannels);
        const priming = start.priming + (aacLeadPadded ? start.lost : 0);
        if (start.priming > 0)
          edits.push({
            trackId: track.id,
            primingSec: priming / track.sampleRate,
            endSec: end,
            // AAC-LC: 1024 samples a packet, whatever the encoder stamped.
            frameSec: 1024 / track.sampleRate,
            startSec,
          });
      } else if (track.codec === "opus") {
        const config = await track.getDecoderConfig();
        const d = config?.description;
        const head = d ? readOpusHead(bytesOf(d)) : null;
        if (!head) continue;
        const delay = await opusEncoderDelay(head.inputRate, head.channels);
        const preSkip = delay?.preSkip ?? head.preSkip;
        edits.push({
          trackId: track.id,
          primingSec: preSkip / OPUS_RATE,
          endSec: end,
          opusPreSkip: preSkip,
        });
      }
    }
  } finally {
    input.dispose();
  }
  if (edits.length === 0) return null;
  if (bytes) return applyPrimingEdits(bytes, edits);
  // Streamed: the index is the last box; edit it alone, the media before it does not move.
  if (data instanceof Blob) {
    const parts = await editTrailingMoov(data, (moov) => applyPrimingEdits(moov, edits, false));
    if (parts) return parts;
    const all = await wholeBytes(data);
    return all ? applyPrimingEdits(all, edits) : null;
  }
  return null;
}

/** The OpusHead of an Ogg file's first page, when it is Ogg Opus. */
function readOggOpusHead(bytes: Uint8Array) {
  if (bytes.length < 28 || String.fromCharCode(...bytes.subarray(0, 4)) !== "OggS") return null;
  const start = 27 + (bytes[26] ?? 0);
  return readOpusHead(bytes.subarray(start, start + 64));
}

/**
 * For AAC encodes fed by hand: before the first sample, the silence this browser's encoder would
 * swallow (`AacStart.lost`, 1024 frames in WebKit, none in Chromium). Returns the seconds added:
 * stamp every later sample that much later (WebKit lets input with the same timestamp overwrite the
 * lead), and pass `aacLeadPadded` to `withEncoderDelaySignalled` afterwards. 0 for other codecs.
 */
export async function addAacLead(
  source: AudioSampleSource,
  codec: string,
  sampleRate: number,
  channels: number,
  /** Where the sound starts in the output (the lead goes there; the sound follows it). */
  timestamp = 0,
): Promise<number> {
  if (codec !== "aac") return 0;
  const { lost } = await aacEncoderStart(sampleRate, channels);
  if (lost <= 0) return 0;
  const pad = silence(lost, sampleRate, channels, timestamp);
  try {
    await source.add(pad);
  } finally {
    pad.close();
  }
  return lost / sampleRate;
}
