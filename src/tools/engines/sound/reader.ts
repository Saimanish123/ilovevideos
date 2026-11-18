/**
 * Decoded sound, read the way every sound tool here needs it: planar float blocks in source time,
 * starting exactly at the sound's zero and ending at its real end, with the decoder warmed up first.
 * The same corrections as ../mediabunny/audio-window, done for a sample-level reader instead of a
 * Conversion:
 *
 * - Pre-roll: decoding starts up to 50 ms before the requested start (on AAC's priming packet when
 *   there is one), and those frames are dropped, so the first frame is not attenuated.
 * - MP3 gapless: an audio-only MP3's sound lies inside its LAME window (encoder delay and padding),
 *   which mediabunny does not apply; `openSound` reads it so the zero and the end are ffmpeg's.
 * - Matroska CodecDelay (AAC, AC-3 from MKV and WebM): mediabunny's packet times run that far behind
 *   the presentation; `openSound` reports it as `delay` and the sound's zero moves by it
 *   (../mediabunny/sound-span).
 *
 * Runs in a worker. No network access (README.md#privacy-and-processing §2).
 */
import { AudioSampleSink, EncodedPacketSink, type Input, type InputAudioTrack } from "mediabunny";
import { PRE_ROLL_SEC } from "../mediabunny/audio-window";
import { sourceDelay } from "../mediabunny/matroska-timing";
import { soundSpan } from "../mediabunny/sound-span";
import { breather } from "./pace";

export interface SoundSource {
  track: InputAudioTrack;
  sampleRate: number;
  channels: number;
  /**
   * Source time of the sound's first real sample: the gapless start of an MP3, a Matroska source's
   * CodecDelay, else 0.
   */
  origin: number;
  /**
   * Seconds the decoded times run behind the presentation (Matroska CodecDelay; 0 elsewhere): a
   * sound beside a picture is read from the picture's time plus this, and placed this much earlier.
   */
  delay: number;
  /** Source time the sound ends. */
  end: number;
  /** Source time of the first packet (negative for AAC priming). */
  firstPacket: number;
}

export interface SoundBlock {
  planes: Float32Array[];
  frames: number;
  /** Source time of the first frame. */
  time: number;
}

/**
 * The primary sound track of an opened input, or the `index`th sound track. `audioOnly` files that
 * are MP3 get their gapless window; in a video the sound's zero is the movie's zero.
 */
export async function openSound(
  input: Input,
  file: File,
  opts: { index?: number } = {},
): Promise<SoundSource | null> {
  const tracks = await input.getAudioTracks();
  const track = opts.index !== undefined ? tracks[opts.index] : await input.getPrimaryAudioTrack();
  if (!track) return null;
  const first = await new EncodedPacketSink(track).getFirstPacket({ metadataOnly: true });
  // Where the real sound lies: after the MP3 gapless delay or the Matroska CodecDelay, up to the
  // sound's own end (it can stop before the picture does; Opus where the container trims padding).
  const span = await soundSpan(file, input, track);
  const delay = track.codec !== "opus" ? await sourceDelay(track) : 0;
  return {
    track,
    sampleRate: track.sampleRate,
    channels: track.numberOfChannels,
    origin: span.start,
    delay,
    end: span.end,
    firstPacket: first?.timestamp ?? 0,
  };
}

/**
 * Decoded blocks from `from` to `to` (source seconds), exact to the frame. Checks `signal` between
 * blocks and releases every decoded sample as soon as it is copied.
 */
export async function* readSound(
  src: SoundSource,
  from: number,
  to: number,
  signal?: AbortSignal,
): AsyncGenerator<SoundBlock> {
  if (!(to > from)) return;
  const sink = new AudioSampleSink(src.track);
  const decodeFrom = Math.max(src.firstPacket, from - PRE_ROLL_SEC);
  // PCM decodes without leaving the microtask queue: give the worker's event loop a turn now and
  // then, so a cancel message is handled while the job runs (./pace).
  const breathe = breather();
  for await (const sample of sink.samples(decodeFrom, to)) {
    await breathe();
    if (signal?.aborted) {
      sample.close();
      return;
    }
    const rate = sample.sampleRate;
    const n = sample.numberOfFrames;
    const start = sample.timestamp;
    // Frames of this sample inside [from, to).
    const skip = Math.max(0, Math.round((from - start) * rate));
    const stop = Math.min(n, Math.round((to - start) * rate));
    if (stop <= skip) {
      sample.close();
      if (start >= to) return;
      continue;
    }
    const planes: Float32Array[] = [];
    const plane = new Float32Array(n);
    for (let c = 0; c < sample.numberOfChannels; c++) {
      sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
      planes.push(plane.slice(skip, stop));
    }
    sample.close();
    yield { planes, frames: stop - skip, time: start + skip / rate };
  }
}

/** Edge ramp at each join of kept spans, so a cut does not click. */
export const JOIN_RAMP_SEC = 0.005;

/**
 * The kept parts of a sound, one after another (jump cuts): each span is read exactly, and where
 * two spans meet, the end of one ramps out and the start of the next ramps in over 5 ms so the join
 * does not click. The file's own start and end are not ramped. `spans` are source seconds, ascending.
 */
export async function* readSpans(
  src: SoundSource,
  spans: readonly { start: number; end: number }[],
  signal?: AbortSignal,
): AsyncGenerator<SoundBlock> {
  for (const [k, span] of spans.entries()) {
    const rampIn = k > 0;
    const rampOut = k < spans.length - 1;
    for await (const block of readSound(src, span.start, span.end, signal)) {
      if (rampIn || rampOut) {
        const rate = src.sampleRate;
        for (let i = 0; i < block.frames; i++) {
          const t = block.time + i / rate;
          let g = 1;
          if (rampIn && t - span.start < JOIN_RAMP_SEC) g *= (t - span.start) / JOIN_RAMP_SEC;
          if (rampOut && span.end - t < JOIN_RAMP_SEC)
            g *= Math.max(0, span.end - t) / JOIN_RAMP_SEC;
          if (g < 1) for (const p of block.planes) p[i] = (p[i] ?? 0) * g;
        }
      }
      yield block;
    }
  }
}
