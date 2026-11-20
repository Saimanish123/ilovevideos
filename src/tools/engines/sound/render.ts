/**
 * The sound render shared by volume, normalise and fades: the picture (if any) is copied packet for
 * packet, the primary sound track is decoded (./reader), run through a processor chain
 * (./processor) and encoded once. A video keeps its container and gets AAC (Opus in WebM, PCM in a
 * MOV when there is no AAC encoder); an audio file keeps its format when this browser encodes it,
 * and is otherwise written as 32-bit float WAV for the ffmpeg stage on the page (./ffmpeg).
 * AAC written to MP4, MOV or M4A gets an edit list for the encoder's priming (ADR-0018).
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import {
  AudioSample,
  AudioSampleSource,
  canEncodeAudio,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Output,
  Quality,
} from "mediabunny";
import { formatDuration } from "@/lib/format";
import { codecName } from "../convert-video/plan";
import { classifyError, EngineError } from "../errors";
import { addOpusTail } from "../mediabunny/opus-delay";
import { type OutputStore, openOutputStore } from "../mediabunny/output-store";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import { containers, type OutputId, openInput } from "../mediabunny/shared";
import { LinearResampler } from "../merge/resample";
import type { EngineContext } from "../types";
import { downmix } from "./dsp/downmix";
import { paced } from "./pace";
import type { Chain, ChainFacts } from "./processor";
import { openSound, readSound, readSpans } from "./reader";
import type { NativeSoundCodec, SoundTarget } from "./target";

/** Frames per encoded block. */
const BLOCK = 4096;

export interface RenderJob {
  file: File;
  /** Video or audio target with a native codec; `wav` writes 32-bit float WAV for the ffmpeg stage. */
  target: SoundTarget | "wav";
  chain: (facts: ChainFacts) => Chain;
  outputName: string;
  ctx: EngineContext;
  /** Share of the job's progress this pass covers, e.g. [0.4, 0.95]. */
  span?: [number, number];
  /** Progress wording, e.g. "Adjusting the volume". */
  label: string;
  /**
   * Audio files only: the parts to keep, in seconds from the sound's start (jump cuts). They are
   * joined in order with a 5 ms ramp at each join. Omit for the whole sound.
   */
  spans?: { start: number; end: number }[];
}

export interface RenderResult {
  blob: Blob;
  /** Codec written, e.g. "aac". */
  codec: string;
  sampleRate: number;
  channels: number;
  /** Lossy encodes only. */
  bitrateKbps?: number;
  /** Seconds of sound written. */
  seconds: number;
  /** Other sound tracks of the source that were left out. */
  otherTracks: number;
  /** The limiter's deepest gain reduction, dB. */
  limitedDb: number;
  videoCodec?: string;
}

export interface Encoding {
  codec: NativeSoundCodec;
  sampleRate: number;
  channels: number;
  bitrateKbps?: number;
}

const lossy = (c: NativeSoundCodec) => c === "aac" || c === "opus";

/** The first codec in `codecs` this browser encodes, at the source rate and layout when it can. */
export async function pickEncoding(
  codecs: NativeSoundCodec[],
  rate: number,
  channels: number,
  bitrateKbps: number | undefined,
): Promise<Encoding | undefined> {
  for (const codec of codecs) {
    if (codec.startsWith("pcm")) return { codec, sampleRate: rate, channels };
    const bitrate = lossy(codec) && bitrateKbps ? bitrateKbps * 1000 : undefined;
    const tryOne = async (r: number, ch: number) =>
      (await canEncodeAudio(codec, {
        numberOfChannels: ch,
        sampleRate: r,
        ...(bitrate ? { bitrate } : {}),
      }))
        ? { codec, sampleRate: r, channels: ch, bitrateKbps: bitrate ? bitrateKbps : undefined }
        : undefined;
    const found =
      (await tryOne(rate, channels)) ??
      (channels > 2 ? await tryOne(rate, 2) : undefined) ??
      (rate !== 48_000 ? await tryOne(48_000, Math.min(channels, 2)) : undefined);
    if (found) return found;
  }
  return undefined;
}

/**
 * The output as a Blob, and the muxer's buffer given back at once: the Blob holds its own copy, and
 * detaching the buffer (`transfer(0)`) frees it now instead of at the next collection. Measured on
 * a 3-hour WAV normalise: 6.4 GB peak while the result was measured, with buffer and Blob both alive.
 */
export function blobReleasing(parts: BlobPart[], buffer: ArrayBuffer, type: string): Blob {
  const blob = new Blob(parts, { type });
  (buffer as ArrayBuffer & { transfer?: (length: number) => ArrayBuffer }).transfer?.(0);
  return blob;
}

export async function renderSound(job: RenderJob): Promise<RenderResult> {
  const { ctx } = job;
  const [lo, hi] = job.span ?? [0, 1];
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  };
  check();
  const input = openInput(job.file);
  // Large outputs stream to OPFS instead of memory (../mediabunny/output-store); removed on failure.
  let store: OutputStore | undefined;
  let delivered = false;
  try {
    const src = await openSound(input, job.file);
    if (!src)
      throw new EngineError(
        "unsupported-input",
        "This file has no sound track, so there is nothing to change.",
        "Choose a file with sound.",
      );
    if (!(await src.track.canDecode()))
      throw new EngineError(
        "unsupported-input",
        "This browser cannot decode the sound in this file.",
        "Convert it to WAV or M4A with the audio converter first.",
      );
    const target = job.target;
    const isVideo = target !== "wav" && target.kind === "video";
    const vTrack = isVideo ? await input.getPrimaryVideoTrack() : null;
    if (isVideo && !vTrack) throw new EngineError("unsupported-input", "The video has no picture.");
    const allAudio = await input.getAudioTracks();

    // What to write, and with which encoder.
    let to: OutputId;
    let enc: Encoding | undefined;
    if (target === "wav") {
      to = "wav";
      enc = { codec: "pcm-f32", sampleRate: src.sampleRate, channels: src.channels };
    } else if (target.kind === "video") {
      to = target.container;
      enc = await pickEncoding(target.codecs, src.sampleRate, src.channels, target.bitrateKbps);
    } else if (target.kind === "audio" && target.native) {
      to =
        target.format.id === "m4a"
          ? "m4a"
          : target.format.id === "flac"
            ? "flac"
            : target.format.id === "opus"
              ? "ogg"
              : "wav";
      enc = await pickEncoding([target.native], src.sampleRate, src.channels, target.bitrateKbps);
    } else {
      throw new EngineError("internal", "This format could not be written.", "Try again.");
    }
    if (!enc)
      throw new EngineError(
        "unsupported-output",
        "Your browser cannot encode sound in the format this file needs.",
        "Try desktop Chrome, Edge or Safari 17.4 or newer.",
      );
    const encoding = enc;

    const { mime } = containers[to];
    // About what the file will hold: the copied picture and the sound, PCM at its sample size.
    const bytesPerSample: Record<NativeSoundCodec, number> = {
      "pcm-f32": 4,
      "pcm-s24": 3,
      "pcm-s16": 2,
      flac: 2,
      aac: 0,
      opus: 0,
    };
    const soundSec = Math.max(0, src.end - src.origin);
    const soundBytes =
      (bytesPerSample[encoding.codec] || 0) * encoding.sampleRate * encoding.channels * soundSec ||
      ((encoding.bitrateKbps ?? 192) * 1000 * soundSec) / 8;
    store = await openOutputStore((vTrack ? job.file.size : 0) + soundBytes);
    const streamed = store.streamed;
    const format = () => containers[to].format({ streamed });
    const output = new Output({ format: format(), target: store.target });
    try {
      output.setMetadataTags(await input.getMetadataTags());
    } catch {
      // Tags are a convenience; a file whose tags cannot be read is still processed.
    }
    const videoSource = vTrack?.codec ? new EncodedVideoPacketSource(vTrack.codec) : null;
    if (vTrack && videoSource) {
      const supported = format().getSupportedCodecs() as string[];
      if (!supported.includes(vTrack.codec ?? ""))
        throw new EngineError(
          "unsupported-output",
          `The ${codecName(vTrack.codec ?? undefined) ?? "picture"} cannot be copied into ${to.toUpperCase()}.`,
          "Convert the video to MP4 first.",
        );
      output.addVideoTrack(videoSource, {
        rotation: vTrack.rotation,
        languageCode:
          vTrack.languageCode && vTrack.languageCode !== "und" ? vTrack.languageCode : undefined,
      });
    }
    const audioSource = new AudioSampleSource({
      codec: encoding.codec,
      ...(encoding.bitrateKbps
        ? { quality: new Quality({ bitrate: encoding.bitrateKbps * 1000 }) }
        : {}),
    });
    output.addAudioTrack(audioSource, {
      languageCode:
        src.track.languageCode && src.track.languageCode !== "und"
          ? src.track.languageCode
          : undefined,
    });

    // The output's zero: the movie's start for a video (sound keeps its place beside the picture),
    // the sound's first real sample for an audio file.
    const firstVideo = vTrack
      ? ((await new EncodedPacketSink(vTrack).getFirstPacket({ metadataOnly: true }))?.timestamp ??
        0)
      : undefined;
    const zero =
      firstVideo !== undefined ? Math.min(firstVideo, Math.max(0, src.firstPacket)) : src.origin;
    // Beside a picture, a Matroska CodecDelay puts the sound that much earlier than its packet times
    // (an audio file's own zero, `src.origin`, already includes it).
    const lag = vTrack ? src.delay : 0;
    const soundFrom = vTrack ? Math.max(zero, 0) + lag : src.origin;
    // Kept spans in source time (audio files only; a video's cuts re-encode the picture elsewhere).
    const spans =
      job.spans && !vTrack
        ? job.spans
            .map((p) => ({
              start: Math.max(src.origin, src.origin + p.start),
              end: Math.min(src.end, src.origin + p.end),
            }))
            .filter((p) => p.end > p.start)
        : undefined;
    const soundSeconds = spans
      ? spans.reduce((sum, p) => sum + (p.end - p.start), 0)
      : Math.max(0, src.end - soundFrom);
    const chain = job.chain({
      sampleRate: encoding.sampleRate,
      channels: encoding.channels,
      duration: soundSeconds,
    });
    const resampler =
      encoding.sampleRate !== src.sampleRate
        ? new LinearResampler(src.sampleRate, encoding.sampleRate, encoding.channels)
        : null;

    let soundDone = 0;
    let pictureDone = 0;
    const total = Math.max(1e-6, soundSeconds);
    // One report per 100 ms at most: a block-by-block flood kept the page busy on long files.
    const progress = paced(ctx.onProgress);
    const report = () => {
      const done = vTrack ? Math.min(soundDone, pictureDone) : soundDone;
      progress({
        phase: "processing",
        ratio: lo + (hi - lo) * Math.min(1, done / total),
        detail: `${job.label} · ${formatDuration(Math.min(done, total))} of ${formatDuration(total)}`,
      });
    };

    const videoPump = async () => {
      if (!vTrack || !videoSource) return;
      const config = await vTrack.getDecoderConfig();
      let first = true;
      for await (const packet of new EncodedPacketSink(vTrack).packets()) {
        check();
        const ts = Math.max(0, packet.timestamp - zero);
        await videoSource.add(
          packet.clone({ timestamp: ts }),
          first && config ? { decoderConfig: config } : undefined,
        );
        first = false;
        pictureDone = ts;
        report();
      }
      pictureDone = total;
    };

    let written = 0;
    let startAt: number | undefined;
    // Silence in front of the sound for an AAC encoder that swallows its first frame (WebKit's);
    // every later sample is that much later and the delay signalling skips it (../mediabunny/priming).
    let leadSec: number | undefined;
    const emit = async (planes: Float32Array[]) => {
      const n = planes[0]?.length ?? 0;
      if (n === 0 || startAt === undefined) return;
      leadSec ??= await addAacLead(
        audioSource,
        encoding.codec,
        encoding.sampleRate,
        encoding.channels,
        startAt,
      );
      const data = new Float32Array(n * encoding.channels);
      for (let c = 0; c < encoding.channels; c++)
        data.set((planes[c] ?? planes[0] ?? new Float32Array(n)).subarray(0, n), c * n);
      const sample = new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: encoding.channels,
        sampleRate: encoding.sampleRate,
        timestamp: startAt + leadSec + written / encoding.sampleRate,
      });
      await audioSource.add(sample);
      sample.close();
      written += n;
    };

    const soundPump = async () => {
      let processed = 0;
      let pending: Float32Array[] = [];
      let pendingFrames = 0;
      const drain = async (force: boolean) => {
        while (pendingFrames >= BLOCK || (force && pendingFrames > 0)) {
          const n = Math.min(BLOCK, pendingFrames);
          const planes = pending.map((p) => p.subarray(0, n));
          pending = pending.map((p) => p.subarray(n));
          pendingFrames -= n;
          await emit(chain.process(planes, n, processed / encoding.sampleRate));
          processed += n;
        }
      };
      let read = 0;
      const blocks = spans
        ? readSpans(src, spans, ctx.signal)
        : readSound(src, soundFrom, src.end, ctx.signal);
      for await (const block of blocks) {
        check();
        startAt ??= spans ? 0 : Math.max(0, block.time - lag - zero);
        let planes = downmix(block.planes, encoding.channels);
        if (resampler) planes = resampler.process(planes);
        const n = planes[0]?.length ?? 0;
        pending =
          pendingFrames === 0
            ? planes
            : pending.map((p, c) => {
                const joined = new Float32Array(pendingFrames + n);
                joined.set(p.subarray(0, pendingFrames));
                joined.set(planes[c] ?? planes[0] ?? new Float32Array(n), pendingFrames);
                return joined;
              });
        pendingFrames += n;
        await drain(false);
        read += block.frames / src.sampleRate;
        soundDone = spans ? read : block.time + block.frames / src.sampleRate - soundFrom;
        report();
      }
      check();
      await drain(true);
      await emit(chain.flush());
      if (startAt !== undefined)
        await addOpusTail(
          audioSource,
          encoding.codec,
          encoding.sampleRate,
          encoding.channels,
          startAt + (leadSec ?? 0) + written / encoding.sampleRate,
        );
      soundDone = total;
    };

    try {
      await output.start();
      await Promise.all([videoPump(), soundPump()]);
      if (written === 0)
        throw new EngineError(
          "unsupported-input",
          "The sound track decoded to nothing.",
          "Check that the file plays in a media player.",
        );
      ctx.onProgress({ phase: "finishing", ratio: hi, detail: "Writing the file" });
      await output.finalize();
    } catch (e) {
      await output.cancel().catch(() => undefined);
      throw e;
    }
    const data = await store.finish();
    const seconds = written / encoding.sampleRate;
    const parts = await withEncoderDelaySignalled(
      output,
      data,
      to,
      (startAt ?? 0) + seconds,
      startAt ?? 0,
      true,
    );
    const type = target === "wav" ? "audio/wav" : mime;
    delivered = true;
    return {
      blob:
        data instanceof ArrayBuffer
          ? blobReleasing(parts ?? [data], data, type)
          : new Blob(parts ?? [data], { type }),
      codec: encoding.codec,
      sampleRate: encoding.sampleRate,
      channels: encoding.channels,
      bitrateKbps: encoding.bitrateKbps,
      seconds,
      otherTracks: Math.max(0, allAudio.length - 1),
      limitedDb: chain.limitedDb(),
      videoCodec: vTrack?.codec ?? undefined,
    };
  } catch (e) {
    if (!delivered) await store?.discard();
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    input.dispose();
  }
}
