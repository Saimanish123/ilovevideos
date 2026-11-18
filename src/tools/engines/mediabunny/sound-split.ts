/**
 * Sound re-encoded next to a picture. One mediabunny Conversion has one start for every track, and
 * starts decoding sound on the packet holding it, without the packet before: the first AAC frame came
 * out attenuated on every re-encode that kept a picture (compress, aspect ratio, precise trim: a
 * click at 0 s vanished, a tone's onset measured 10.8 ms late; ADR-0018).
 *
 * So the runner splits the job into two composable Conversions on one Output: the picture (and any
 * sound Conversion would copy) from the job's start, and each re-encoded sound track from up to
 * `PRE_ROLL_SEC` earlier, its pre-roll dropped again by `fixSample` so it starts at the same zero as
 * the picture. Opus encodes also get `opusEndGate` (exact end, flush silence). Whether a track is
 * re-encoded is asked of mediabunny itself, on a probe Output that is never started.
 *
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import {
  AudioSampleSource,
  Conversion,
  type ConversionAudioOptions,
  type ConversionOptions,
  getFirstEncodableAudioCodec,
  type Input,
  type InputAudioTrack,
  NullTarget,
  Output,
  type OutputFormat,
} from "mediabunny";
import { sourceDelay } from "./matroska-timing";
import { opusEndGate } from "./opus-delay";
import { fixSample, PRE_ROLL_SEC, soundTrackEnd } from "./pre-roll";
import { aacEncoderStart } from "./priming";

type AudioProcess = NonNullable<ConversionAudioOptions["process"]>;

export interface SoundSplit {
  /** Source time of the output's zero (the job's start). */
  origin: number;
  /** Source time sound decoding starts at: up to `PRE_ROLL_SEC` before `origin`. */
  decodeFrom: number;
  /** Source time the sound Conversion stops at (the job's end, plus the source's start delay). */
  soundTrimEnd?: number;
  /** Ids of the sound tracks this split re-encodes. */
  reencoded: Set<number>;
  /** Seconds of sound the first re-encoded track holds, from the output's zero. */
  soundEnd: number;
  /** Output time the first re-encoded track's sound starts at (0 unless it starts after the picture). */
  soundStart: number;
  /** Set once an AAC track was given the encoder's silenced start as a lead (./priming `aacLeadPadded`). */
  aacLeadPadded: boolean;
  /** `audio` options for the picture Conversion: re-encoded tracks are left to the other one. */
  pictureAudio: (track: InputAudioTrack) => ConversionAudioOptions;
  /** `audio` options for the sound Conversion. */
  soundAudio: (track: InputAudioTrack) => Promise<ConversionAudioOptions>;
}

interface Job {
  /** The source file, for where an Opus source's sound really ends (./opus-source). */
  file?: File;
  video?: ConversionOptions["video"];
  audio?: ConversionAudioOptions;
  trim?: { start?: number; end?: number };
}

/** Whether mediabunny's Conversion would re-encode (not copy) `track` for this job, asked of it. */
export async function reencodes(
  input: Input,
  format: () => OutputFormat,
  job: Job,
  track: InputAudioTrack,
  origin: number,
): Promise<boolean> {
  const probe = new Output({ format: format(), target: new NullTarget() });
  await Conversion.init({
    input,
    output: probe,
    video: { discard: true },
    audio: (t) => (t.id === track.id ? job.audio : { discard: true }),
    trim: { start: origin, end: job.trim?.end },
    composable: true,
    showWarnings: false,
  });
  return probe.tracks.some((t) => t.type === "audio" && t.source instanceof AudioSampleSource);
}

/**
 * The split for a job that keeps a picture and re-encodes at least one sound track; null when there
 * is no picture, no sound, or all sound is copied (the single Conversion is then exact already).
 */
export async function planSoundSplit(
  input: Input,
  format: () => OutputFormat,
  job: Job,
): Promise<SoundSplit | null> {
  const video = job.video as { discard?: boolean } | undefined;
  if (video?.discard || job.audio?.discard) return null;
  const videoTracks = await input.getVideoTracks();
  const audioTracks = await input.getAudioTracks();
  if (videoTracks.length === 0 || audioTracks.length === 0) return null;
  // The start Conversion would pick by itself: the first timestamp of the kept tracks, not before 0.
  const origin =
    job.trim?.start ?? Math.max(await input.getFirstTimestamp([...videoTracks, ...audioTracks]), 0);

  const again: InputAudioTrack[] = [];
  for (const t of audioTracks) if (await reencodes(input, format, job, t, origin)) again.push(t);
  const primary = again[0];
  if (!primary) return null;
  // A Matroska source's CodecDelay (AAC priming, as ffmpeg writes it), which mediabunny does not
  // apply: in its packet and decoded times the sound's zero sits that much later. Opus is decoded
  // with its pre-skip applied and stamped from 0 already (measured: clicks within 16 µs).
  const delays = new Map<number, number>();
  for (const t of again) delays.set(t.id, t.codec === "opus" ? 0 : await sourceDelay(t));
  const delayOf = (t: InputAudioTrack) => delays.get(t.id) ?? 0;
  let decodeFrom = Number.POSITIVE_INFINITY;
  for (const t of again) {
    const zero = origin + delayOf(t);
    decodeFrom = Math.min(
      decodeFrom,
      zero,
      Math.max(await t.getFirstTimestamp(), zero - PRE_ROLL_SEC),
    );
  }
  const reencoded = new Set(again.map((t) => t.id));
  // Where a track's sound ends, from the output's zero.
  const endOf = async (t: InputAudioTrack) =>
    Math.min(
      job.trim?.end ?? Number.POSITIVE_INFINITY,
      (await soundTrackEnd(t, job.file)) - delayOf(t),
    ) - origin;
  // mediabunny picks the first encodable codec of the container when none is asked for; asking for
  // it here says whether the sound will be Opus, which needs its end gated.
  const supported = format().getSupportedAudioCodecs();
  // AAC: the silence this browser's encoder swallows at its start is fed first (WebKit: 1024).
  const leadFor = async (codec: string | undefined, t: InputAudioTrack) => {
    if (codec !== "aac") return 0;
    const audio = job.audio ?? {};
    const { lost } = await aacEncoderStart(
      audio.sampleRate ?? t.sampleRate,
      audio.numberOfChannels ?? t.numberOfChannels,
    );
    split.aacLeadPadded = true;
    return lost;
  };

  const split: SoundSplit = {
    origin,
    decodeFrom,
    soundTrimEnd: job.trim?.end !== undefined ? job.trim.end + delayOf(primary) : undefined,
    reencoded,
    soundEnd: await endOf(primary),
    soundStart: Math.max(0, (await primary.getFirstTimestamp()) - delayOf(primary) - origin),
    aacLeadPadded: false,
    pictureAudio: (t) => (reencoded.has(t.id) ? { discard: true } : (job.audio ?? {})),
    soundAudio: async (t) => {
      if (!reencoded.has(t.id)) return { discard: true };
      const audio = job.audio ?? {};
      const codec =
        audio.codec ??
        (await getFirstEncodableAudioCodec(supported, {
          numberOfChannels: audio.numberOfChannels ?? t.numberOfChannels,
          sampleRate: audio.sampleRate ?? t.sampleRate,
        })) ??
        undefined;
      const user = audio.process;
      const lead = origin + delayOf(t) - decodeFrom;
      const fixed: AudioProcess = async (sample) => {
        const f = fixSample(sample, lead, 1);
        if (!f || !user) return f;
        const out = await user(f);
        const list = Array.isArray(out) ? out : [out];
        if (!list.includes(f)) f.close();
        return out;
      };
      return {
        ...audio,
        codec,
        // Opus and AAC end exactly where the sound does, with the encoder's flush silence after it.
        process:
          codec === "opus" || codec === "aac"
            ? opusEndGate(await endOf(t), fixed, codec, await leadFor(codec, t))
            : fixed,
      };
    },
  };
  return split;
}

/**
 * True when a job keeps a picture and Conversion would copy a sound track whose source states a
 * start delay mediabunny does not read (Matroska CodecDelay or Opus pre-skip): Conversion would
 * copy it from the wrong zero (Opus from an MKV into WebM played 7 ms late, 648 samples long). The
 * runner then encodes the picture alone and copies the sound beside it (./packet-copy).
 */
export async function copiesDelayedSound(
  input: Input,
  format: () => OutputFormat,
  job: Job,
): Promise<boolean> {
  const video = job.video as { discard?: boolean } | undefined;
  if (video?.discard || job.audio?.discard || job.trim) return false;
  if ((await input.getVideoTracks()).length === 0) return false;
  const audio = await input.getAudioTracks();
  if (audio.length === 0) return false;
  let delayed = false;
  for (const t of audio) {
    if (await reencodes(input, format, job, t, 0)) return false;
    if ((await sourceDelay(t)) > 0) delayed = true;
  }
  return delayed;
}
