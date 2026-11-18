/**
 * Audio → audio (B3). An audio file in, an audio file out, in MP3, M4A, WAV, FLAC, OGG (Vorbis),
 * Opus or AIFF. The same planner as video → audio decides copy versus re-encode and native versus
 * ffmpeg (`../video-to-audio/plan.ts`): the track is copied when the target holds the source codec
 * (MP3 → MP3, AAC → M4A, FLAC → FLAC), written natively for WAV and Opus, and encoded by ffmpeg.wasm
 * on the page for MP3, AAC, FLAC, Vorbis and AIFF, and for sources only ffmpeg reads (WMA, AIFF).
 * This module is the worker (native) half; the page runner is in `../page-runners.ts`.
 */
import { z } from "zod";
import { audioBitratePresets, audioFormatIds, normalizeAudioCodec } from "@/content/formats/audio";
import type { Engine, MediaInfo } from "../types";
import { canRunNatively, runNativeAudio } from "../video-to-audio";
import { flacBitDepth, planExtraction } from "../video-to-audio/plan";

export const ConvertAudioOptions = z.object({
  to: z.enum(audioFormatIds).default("mp3"),
  /** kbps preset for lossy targets; ignored for lossless targets and for stream copies. */
  bitrate: z
    .union([z.literal(128), z.literal(192), z.literal(320)])
    .default(audioBitratePresets[1]),
  /** The page locks the target (pair pages). UI only; the engine ignores it. */
  locked: z.boolean().optional(),
  /** Channels to write (1 = mono); omit to keep the source's. */
  channels: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Sample rate to write, Hz; omit to keep the source's. */
  sampleRate: z.number().int().min(8000).max(192_000).optional(),
});
export type ConvertAudioOptions = z.infer<typeof ConvertAudioOptions>;

/**
 * Bits per sample of a FLAC source, read from its header, so FLAC → WAV or AIFF keeps 24-bit
 * masters at 24 bits. Undefined for every other source (their codec id already says it).
 */
export async function sourceBitDepth(file: File, info: MediaInfo): Promise<number | undefined> {
  if (normalizeAudioCodec(info.audio?.[0]?.codec) !== "flac") return undefined;
  return flacBitDepth(new Uint8Array(await file.slice(0, 42).arrayBuffer()));
}

export const convertAudioEngine: Engine<ConvertAudioOptions> = {
  id: "convert-audio",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: ConvertAudioOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs" || !input.info) return false;
    return canRunNatively(
      planExtraction(input.info, input.file.name, options.to, options.bitrate, {
        channels: options.channels,
        sampleRate: options.sampleRate,
      }),
      input.info,
    );
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input?.info) throw new Error("No input file");
    const bitDepth = await sourceBitDepth(input.file, input.info);
    const plan = planExtraction(input.info, input.file.name, options.to, options.bitrate, {
      bitDepth,
      channels: options.channels,
      sampleRate: options.sampleRate,
    });
    return runNativeAudio({ ...input, info: input.info }, plan, undefined, ctx);
  },
};
