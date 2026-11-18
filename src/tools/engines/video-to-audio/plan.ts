/**
 * Decides how an audio extraction will run before it starts, so the panel can say so honestly:
 * which engine, and whether the track is copied bit for bit or re-encoded. Pure; shared by the
 * panel (summary, routing), the worker engine and the ffmpeg page runner.
 */
import {
  type AudioBitrate,
  type AudioFormatId,
  type AudioFormatSpec,
  audioFormatById,
  isNativeAudioContainer,
  normalizeAudioCodec,
} from "@/content/formats/audio";
import { containerFromFormatName } from "@/content/formats/containers";
import { withUnit } from "@/lib/format";
import { codecName } from "../convert-video/plan";
import { downmixWords, panFilter } from "../sound/dsp/downmix";
import type { MediaInfo } from "../types";

export type ExtractionBackend = "webcodecs" | "ffmpeg-wasm";

export interface ExtractionPlan {
  backend: ExtractionBackend;
  target: AudioFormatSpec;
  /** True when the source track is moved into the new file without decoding. */
  copy: boolean;
  /** Normalised source codec id, or undefined when the file has no audio. */
  sourceCodec?: string;
  /** Codec written: the source codec when copying, else the target's encoder for this backend. */
  codec: string;
  /** Effective bitrate in kbps for lossy re-encodes; undefined for copies and lossless targets. */
  bitrateKbps?: number;
  /** False when the input has no audio track at all. */
  hasAudio: boolean;
  /**
   * Channels written when they change: asked for (stereo to mono), or forced by the encoder (MP3 and
   * Opus hold two at most, see `encoderLimits`); undefined keeps the source's.
   */
  channels?: number;
  /**
   * Sample rate written when it changes: asked for, or forced by the encoder (MP3 stops at 48 kHz);
   * undefined keeps the source's (Opus is always 48 kHz).
   */
  sampleRate?: number;
  /** The source's channel count, so a downmix can be described and built (`../sound/dsp/downmix`). */
  sourceChannels?: number;
  /**
   * Bits an integer target keeps of a floating-point source (FLAC, or 24-bit WAV and AIFF): 32-bit
   * float samples are rounded to the nearest 24-bit step, so "every sample kept" is not true.
   */
  quantisedTo?: number;
}

/** MP3 sample rates (MPEG-1, -2 and -2.5 Layer III), Hz. */
export const MP3_RATES = [8000, 11_025, 12_000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000];

/**
 * What an encoder accepts, so the plan states what it writes rather than what was asked
 * (measured with ffmpeg 8 and LAME, 2026-10-08): MP3 holds two channels and its own rates (96 kHz
 * becomes 48 kHz), and its bitrate tops out at 64 kbps up to 12 kHz and 160 kbps up to 24 kHz, so
 * 192 kbps at 22.05 kHz is written at 160. OGG Vorbis stops at 48 kHz. Opus (WebCodecs in Chromium and WebKit, and the
 * converter's copy that says MP3 and Opus hold two channels) is written as stereo at most.
 */
export function encoderLimits(
  target: AudioFormatSpec,
  rate: number | undefined,
): { maxChannels?: number; rate?: number; maxKbps?: number } {
  if (target.id === "opus") return { maxChannels: 2 };
  // ffmpeg.wasm's libvorbis (FFmpeg 5.1) has no bitrate mode above 48 kHz; the ffmpeg runner
  // resamples, and the plan says so.
  if (target.id === "ogg") return rate && rate > 48_000 ? { rate: 48_000 } : {};
  if (target.id !== "mp3") return {};
  const r = rate ?? 44_100;
  const allowed = MP3_RATES.find((x) => x >= r) ?? 48_000;
  return {
    maxChannels: 2,
    rate: allowed,
    maxKbps: allowed <= 12_000 ? 64 : allowed <= 24_000 ? 160 : 320,
  };
}

/**
 * PCM targets (WAV, AIFF) are written at 16 bits unless the source has more: a 24-bit FLAC, AIFF or
 * WAV, or 32-bit float, is written as 24-bit PCM so a lossless conversion stays lossless.
 */
export function pcmTargetFor(
  target: AudioFormatSpec | undefined,
  sourceCodec: string | undefined,
  bitDepth: number | undefined,
): AudioFormatSpec | undefined {
  if (!target || (target.id !== "wav" && target.id !== "aiff")) return target;
  const deep =
    (bitDepth ?? 0) > 16 || (!!sourceCodec && /^pcm-(s24|s32|f32|f64)/.test(sourceCodec));
  if (!deep) return target;
  return target.id === "wav"
    ? { ...target, encode: { native: "pcm-s24", ffmpeg: "pcm_s24le" } }
    : { ...target, encode: { ffmpeg: "pcm_s24be" } };
}

/**
 * Bits per sample from a FLAC file's STREAMINFO block (the first 42 bytes), or undefined when the
 * bytes are not a FLAC header. mediabunny's inspector does not report bit depth.
 */
export function flacBitDepth(head: Uint8Array): number | undefined {
  const isFlac = head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43;
  if (!isFlac || head.length < 22 || ((head[4] ?? 0) & 0x7f) !== 0) return undefined;
  const si = 8;
  const b12 = head[si + 12] ?? 0;
  const b13 = head[si + 13] ?? 0;
  return (((b12 & 1) << 4) | (b13 >> 4)) + 1;
}

export function planExtraction(
  info: MediaInfo,
  fileName: string,
  to: AudioFormatId,
  bitrate: AudioBitrate,
  /**
   * Source bits per sample when known beyond the codec name (FLAC's STREAMINFO, see `flacBitDepth`),
   * and the channels and sample rate to write when they change (convert to mono, change sample rate).
   */
  opts: { bitDepth?: number; channels?: number; sampleRate?: number } = {},
): ExtractionPlan {
  const track = info.audio?.[0];
  const sourceCodec = normalizeAudioCodec(track?.codec);
  const target = pcmTargetFor(
    audioFormatById.get(to) ?? audioFormatById.get("mp3"),
    sourceCodec,
    opts.bitDepth,
  );
  if (!target) throw new Error("unknown target");
  const hasAudio = !!track;
  // A new layout or rate is a re-encode whatever the formats; Opus always runs at 48 kHz.
  let channels =
    opts.channels !== undefined && opts.channels !== track?.channels ? opts.channels : undefined;
  let sampleRate =
    opts.sampleRate !== undefined && target.id !== "opus" && opts.sampleRate !== track?.sampleRate
      ? opts.sampleRate
      : undefined;
  const remix = channels !== undefined || sampleRate !== undefined;
  const copy = !!sourceCodec && target.codecs.includes(sourceCodec) && !remix;
  // A re-encode writes what the encoder accepts: MP3 and Opus at most stereo, MP3 at its own rates
  // and bitrate ceiling. The plan says so, so the command, the result line and the file agree.
  const limits = copy ? {} : encoderLimits(target, sampleRate ?? track?.sampleRate);
  const outChannels = channels ?? track?.channels;
  if (limits.maxChannels && outChannels && outChannels > limits.maxChannels)
    channels = limits.maxChannels;
  if (limits.rate && limits.rate !== (sampleRate ?? track?.sampleRate)) sampleRate = limits.rate;
  const kbps = limits.maxKbps ? Math.min(bitrate, limits.maxKbps) : bitrate;
  // Integer targets keep 24 bits of a float source.
  const quantisedTo =
    !copy &&
    (target.id === "flac" || /^pcm_s24/.test(target.encode.ffmpeg)) &&
    sourceCodec &&
    /^pcm-f(32|64)/.test(sourceCodec)
      ? 24
      : undefined;
  const source = containerFromFormatName(info.container, fileName);
  // Audio-only files mediabunny opened (MP3, WAVE, Ogg, FLAC, ADTS) are read natively, whatever the
  // extension says (.ogg is also listed as OGV video); WMA and AIFF are not. A track whose codec
  // mediabunny could not name (ALAC, WMA inside MP4) cannot be decoded natively either.
  const nativeRead =
    (isNativeAudioContainer(info.container) || source?.read === "native") &&
    (!hasAudio || !!sourceCodec);

  // Native when mediabunny can read the file and has a muxer for the target, and either copies the
  // track or encodes it itself (PCM, Opus).
  // Lossless sources (FLAC, PCM) going to PCM stay bit-exact natively: the runner scales integer
  // sources so mediabunny's PCM writer inverts its reader (../mediabunny/audio-window).
  // A new sample rate goes through ffmpeg's filtered resampler: mediabunny interpolates linearly,
  // which aliases when the rate goes down.
  const nativeWrite =
    !!target.muxer && (copy || !!target.encode.native) && sampleRate === undefined;
  if (nativeRead && nativeWrite) {
    return {
      backend: "webcodecs",
      target,
      copy,
      sourceCodec,
      codec: copy ? (sourceCodec ?? "") : (target.encode.native ?? ""),
      bitrateKbps: copy || target.lossless ? undefined : kbps,
      hasAudio,
      channels,
      sampleRate,
      sourceChannels: track?.channels,
      quantisedTo,
    };
  }
  return {
    backend: "ffmpeg-wasm",
    target,
    copy,
    sourceCodec,
    codec: copy ? "copy" : target.encode.ffmpeg,
    bitrateKbps: copy || target.lossless ? undefined : kbps,
    hasAudio,
    channels,
    sampleRate,
    sourceChannels: track?.channels,
    quantisedTo,
  };
}

/**
 * The channel change as ffmpeg arguments: the same mix the native path makes (`pan`, from
 * ../sound/dsp/downmix), so ffmpeg's own rematrixing, which is unscaled for float sources and can
 * clip, never decides it. `-ac` only when the source's count is unknown.
 */
function channelArgs(plan: ExtractionPlan): string[] {
  if (!plan.channels) return [];
  const pan = plan.sourceChannels ? panFilter(plan.sourceChannels, plan.channels) : undefined;
  return pan ? ["-af", pan] : ["-ac", String(plan.channels)];
}

/** ffmpeg arguments after `-i <input>` for a plan and optional range, shared by the runner and the shown command. */
export function ffmpegAudioArgs(
  plan: ExtractionPlan,
  range?: { start: number; end: number },
): string[] {
  const enc = plan.copy ? "copy" : plan.target.encode.ffmpeg;
  return [
    ...(range ? ["-ss", range.start.toFixed(3), "-to", range.end.toFixed(3)] : []),
    "-vn",
    "-map",
    "0:a:0",
    "-c:a",
    enc,
    ...(plan.bitrateKbps && !plan.copy ? ["-b:a", `${plan.bitrateKbps}k`] : []),
    ...channelArgs(plan),
    ...(plan.sampleRate ? ["-ar", String(plan.sampleRate)] : []),
    ...(plan.target.encode.args ?? []),
    "-map_metadata",
    "0",
    "-f",
    plan.target.ffmpegFormat,
  ];
}

/** "PCM 16-bit", "PCM 24-bit", "PCM 32-bit float" from a mediabunny or ffmpeg PCM codec id. */
export function pcmName(codec: string): string {
  const bits = /(\d+)/.exec(codec)?.[1] ?? "16";
  return `PCM ${bits}-bit${/f\d/.test(codec) ? " float" : ""}`;
}

/**
 * "MP3 · 192 kbps · 44.1 kHz · stereo" for the result line, from what the output will actually
 * contain. Bitrate is the chosen one for lossy encodes and the measured one for copies.
 */
export function outputMeta(
  plan: ExtractionPlan,
  track: { sampleRate: number; channels: number; bitrate?: number },
): string {
  const codec = plan.copy
    ? plan.sourceCodec
    : (plan.target.encode.native ?? plan.target.encode.ffmpeg);
  const name = codec?.startsWith("pcm") ? pcmName(codec) : (codecName(codec) ?? plan.target.name);
  // Opus is always 48 kHz; every other path keeps the source sample rate.
  const rate =
    codec === "opus" || codec === "libopus" ? 48_000 : (plan.sampleRate ?? track.sampleRate);
  const count = plan.channels ?? track.channels;
  const channels = count === 1 ? "mono" : count === 2 ? "stereo" : withUnit(count, "channels");
  const kbps = plan.copy
    ? track.bitrate && track.bitrate > 0 && !plan.target.lossless
      ? Math.round(track.bitrate / 1000)
      : undefined
    : plan.bitrateKbps;
  const mix = plan.channels ? downmixWords(track.channels, plan.channels) : undefined;
  return [
    plan.quantisedTo ? `${name} ${plan.quantisedTo}-bit` : name,
    kbps && withUnit(kbps, "kbps"),
    withUnit(rate / 1000, "kHz"),
    mix ? `${channels}, ${mix}` : channels,
    plan.quantisedTo ? `float samples kept to ${plan.quantisedTo}-bit precision` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}
