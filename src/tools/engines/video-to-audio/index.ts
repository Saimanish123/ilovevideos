/**
 * Video → audio (native path). Drops the picture and writes the sound track alone: copied bit for bit
 * when the target format holds the source codec (AAC → M4A, Opus → Opus, MP3 → MP3), otherwise
 * re-encoded by mediabunny (PCM for WAV, Opus for Opus). MP3, FLAC, AAC, Vorbis and AIFF re-encodes
 * run on the page through ffmpeg.wasm (see ../ffmpeg `extractAudioWithFfmpeg`), routed by the stage
 * via `plan.ts`. The audio → audio engine (../convert-audio) reuses the planner and both runners.
 */
import { AudioSample, canEncodeAudio, Quality } from "mediabunny";
import { z } from "zod";
import { audioBitratePresets, audioFormatIds } from "@/content/formats/audio";
import { shellQuote } from "@/lib/format";
import { EngineError } from "../errors";
import { reencodeWindow } from "../mediabunny/audio-window";
import { type AudioContainerId, convert } from "../mediabunny/shared";
import { downmix } from "../sound/dsp/downmix";
import type { Engine, EngineContext, EngineResult, MediaInfo, MediaInput } from "../types";
import { copyAudioTrack } from "./copy";
import { audioOutputName, effectiveRange } from "./math";
import { type ExtractionPlan, ffmpegAudioArgs, outputMeta, planExtraction } from "./plan";

export const VideoToAudioOptions = z
  .object({
    to: z.enum(audioFormatIds).default("mp3"),
    /** kbps preset for lossy targets; ignored for WAV and FLAC and for stream copies. */
    bitrate: z
      .union([z.literal(128), z.literal(192), z.literal(320)])
      .default(audioBitratePresets[1]),
    /** When true, only `start`–`end` seconds are extracted. */
    range: z.boolean().default(false),
    start: z.number().min(0).default(0),
    end: z.number().min(0).default(0),
    /** The page is trim audio: the part is the job and the format is kept. UI only. */
    trimOnly: z.boolean().optional(),
  })
  .refine((o) => !o.range || o.end > o.start, { message: "End must be after start" });
export type VideoToAudioOptions = z.infer<typeof VideoToAudioOptions>;

export function noAudioError(): EngineError {
  return new EngineError(
    "unsupported-input",
    "This video has no audio track, so there is nothing to extract.",
    "Choose a video with sound.",
  );
}

/** The command a user would type for the same result, for the result card. */
export function extractionCommand(
  inputName: string,
  outputName: string,
  plan: ExtractionPlan,
  range?: { start: number; end: number },
): string {
  // A `pan` filter holds `|`, so arguments that need it are quoted (as ../ffmpeg `shellArg` does).
  const arg = (a: string) => (/^[\w.:+=,/-]+$/.test(a) ? a : shellQuote(a));
  return `ffmpeg -i ${shellQuote(inputName)} ${ffmpegAudioArgs(plan, range).map(arg).join(" ")} ${shellQuote(outputName)}`;
}

/** Whether the native path can run this plan in this browser (copies always can; encodes are probed). */
export async function canRunNatively(plan: ExtractionPlan, info: MediaInfo): Promise<boolean> {
  if (plan.backend !== "webcodecs" || !plan.hasAudio || !plan.target.muxer) return false;
  if (plan.copy) return true;
  const track = info.audio?.[0];
  return canEncodeAudio(plan.codec as "opus" | "pcm-s16", {
    numberOfChannels: plan.channels ?? track?.channels,
    sampleRate: plan.codec === "opus" ? 48_000 : (plan.sampleRate ?? track?.sampleRate),
  });
}

/**
 * Runs a native plan with mediabunny: the first audio track is copied or re-encoded into the target
 * muxer and any picture is dropped. Shared by video → audio and audio → audio.
 */
export async function runNativeAudio(
  input: MediaInput & { info: MediaInfo },
  plan: ExtractionPlan,
  range: { start: number; end: number } | undefined,
  ctx: EngineContext,
): Promise<EngineResult> {
  if (!plan.hasAudio) throw noAudioError();
  const muxer = plan.target.muxer;
  if (!muxer) throw new EngineError("internal", `Cannot write ${plan.target.name} natively.`);
  const outputName = audioOutputName(input.file.name, plan.target.extension, range);
  // Ranges are page times, from the file's start; the source's own times may start later (MPEG-TS
  // near 1.4 s, an MP4 written with an offset). An audio file's start is 0.
  const t0 = input.info.startSec ?? 0;
  const at = range && t0 ? { start: range.start + t0, end: range.end + t0 } : range;
  const track = input.info.audio?.[0];
  const ffmpegCommand = extractionCommand(input.file.name, outputName, plan, range);
  // Re-encodes decode from a little before the start and fix each sample up (pre-roll, MP3 gapless,
  // exact integer PCM): see ../mediabunny/audio-window.
  const pcmBits = /^pcm-s(16|24)/.exec(plan.codec)?.[1];
  const window = plan.copy
    ? undefined
    : await reencodeWindow(input.file, {
        range: at,
        pcmBits: pcmBits ? Number(pcmBits) : undefined,
        integerSource: plan.sourceCodec === "flac" || /^pcm-(s|u)\d/.test(plan.sourceCodec ?? ""),
      });
  // A channel change is our own mix (../sound/dsp/downmix, ITU-R BS.775 scaled so it cannot clip),
  // never mediabunny's remix: that one sums 5.1 to mono unscaled and clipped, and wrote stereo to
  // mono WAV one sample long.
  const outChannels =
    plan.channels !== undefined && track && plan.channels !== track.channels
      ? plan.channels
      : undefined;
  const fix = window?.process;
  const process = outChannels
    ? (sample: AudioSample) => {
        const fixed = fix ? fix(sample) : sample;
        if (!fixed) return null;
        const mixed = remixSample(fixed, outChannels);
        if (fixed !== sample) fixed.close();
        return mixed;
      }
    : fix;
  // Copies go packet for packet: Conversion would re-encode AAC that starts with a priming packet.
  const result = plan.copy
    ? await copyAudioTrack({
        file: input.file,
        muxer,
        mime: plan.target.mime,
        outputName,
        range: at,
        ffmpegCommand,
        ctx,
      })
    : await convert({
        file: input.file,
        to: muxer as AudioContainerId,
        outputName,
        video: { discard: true },
        audio: {
          codec: plan.codec as "opus" | "pcm-s16",
          forceTranscode: true,
          quality: plan.bitrateKbps ? new Quality({ bitrate: plan.bitrateKbps * 1000 }) : undefined,
          // A new rate is resampled by mediabunny before `process` runs; channels are mixed in it.
          sampleRate: plan.sampleRate,
          process,
          processedNumberOfChannels: outChannels,
        },
        trim: window?.trim ?? at,
        soundEnd: window?.soundSec,
        ffmpegCommand,
        ctx,
      });
  // `.opus` is Ogg; mediabunny labels the buffer by muxer, so keep the target's own MIME type.
  const blob =
    result.blob.type === plan.target.mime
      ? result.blob
      : new Blob([result.blob], { type: plan.target.mime });
  return track ? { ...result, blob, meta: outputMeta(plan, track) } : { ...result, blob };
}

/** One decoded sample with its channels mixed to `channels` (../sound/dsp/downmix). */
export function remixSample(sample: AudioSample, channels: number): AudioSample {
  const frames = sample.numberOfFrames;
  const planes: Float32Array[] = [];
  for (let c = 0; c < sample.numberOfChannels; c++) {
    const plane = new Float32Array(frames);
    sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
    planes.push(plane);
  }
  const mixed = downmix(planes, channels);
  const data = new Float32Array(frames * channels);
  for (let c = 0; c < channels; c++) data.set(mixed[c] ?? new Float32Array(frames), c * frames);
  return new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp,
  });
}

export const videoToAudioEngine: Engine<VideoToAudioOptions> = {
  id: "video-to-audio",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: VideoToAudioOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs" || !input.info) return false;
    return canRunNatively(
      planExtraction(input.info, input.file.name, options.to, options.bitrate),
      input.info,
    );
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input?.info) throw new Error("No input file");
    const plan = planExtraction(input.info, input.file.name, options.to, options.bitrate);
    const range = effectiveRange(input.info.durationSec, options);
    return runNativeAudio({ ...input, info: input.info }, plan, range, ctx);
  },
};
