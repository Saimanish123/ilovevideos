/**
 * What a sound tool writes for a given file, decided before it runs so the panel, the page runner
 * and the worker say and do the same thing (one source of truth). A video keeps its picture packet
 * for packet in its own container and gets its sound encoded once (AAC, Opus in WebM). An audio file
 * comes back in its own format: WAV, FLAC, M4A and Opus are written natively when this browser has
 * the encoder; MP3, OGG Vorbis and AIFF have no WebCodecs encoder, so the processed sound is handed
 * to ffmpeg.wasm as a 32-bit float WAV and encoded there. WMA and AIFF are also decoded by ffmpeg.
 * Pure: no DOM, no mediabunny.
 */
import {
  type AudioFormatSpec,
  audioFormatById,
  audioSourceForFile,
  isNativeAudioContainer,
  normalizeAudioCodec,
} from "@/content/formats/audio";
import { containerFromFormatName } from "@/content/formats/containers";
import { baseName } from "@/lib/format";
import type { ContainerId } from "../mediabunny/shared";
import type { MediaInfo } from "../types";

/** Codecs the worker can write itself (WebCodecs, or mediabunny's own PCM). */
export type NativeSoundCodec = "aac" | "opus" | "flac" | "pcm-s16" | "pcm-s24" | "pcm-f32";

export type SoundTarget =
  | {
      kind: "video";
      container: ContainerId;
      extension: string;
      /** Codecs to try, in order; the first this browser encodes is used. */
      codecs: NativeSoundCodec[];
      bitrateKbps: number;
    }
  | {
      kind: "audio";
      format: AudioFormatSpec;
      /** The native encoder for this format, when there is one; else ffmpeg encodes. */
      native?: NativeSoundCodec;
      /** The source can only be decoded by ffmpeg.wasm (WMA, AIFF). */
      ffmpegDecode: boolean;
      /** Lossy formats: the encode bitrate, at least the source's. Undefined for lossless. */
      bitrateKbps?: number;
    }
  /** Nothing this tool can write: the reason, for the panel. */
  | { kind: "none"; reason: string };

/** Video sound is encoded at this rate, like add and replace audio (ADR-0020). */
export const VIDEO_SOUND_KBPS = 192;

const LOSSY_STEPS = [32, 48, 64, 96, 128, 160, 192, 256, 320];

/** The smallest usual bitrate at or above the source's, so a re-encode does not starve the sound. */
export function bitrateFor(sourceBps: number | undefined, floor: number, fallback: number): number {
  if (!sourceBps || !(sourceBps > 0)) return fallback;
  const kbps = sourceBps / 1000;
  const step = LOSSY_STEPS.find((s) => s >= kbps * 0.98) ?? 320;
  return Math.max(floor, step);
}

/** The sound tools' output for this file. */
export function soundTarget(info: MediaInfo, fileName: string): SoundTarget {
  const track = info.audio?.[0];
  if (!track) return { kind: "none", reason: "This file has no sound track." };
  if (info.video) {
    const c = containerFromFormatName(info.container, fileName);
    if (c?.read !== "native")
      return {
        kind: "none",
        reason: `This browser cannot copy the picture of ${c?.name ?? "this"} files. Convert the video to MP4 first.`,
      };
    const id = c.id;
    const container: ContainerId =
      id === "mp4" || id === "mov" || id === "webm" || id === "mkv"
        ? id
        : info.video.codec === "vp8" || info.video.codec === "vp9"
          ? "mkv"
          : "mp4";
    const codecs: NativeSoundCodec[] =
      container === "webm" ? ["opus"] : container === "mov" ? ["aac", "pcm-s16"] : ["aac", "opus"];
    return {
      kind: "video",
      container,
      extension: container,
      codecs,
      bitrateKbps: VIDEO_SOUND_KBPS,
    };
  }
  const codec = normalizeAudioCodec(track.codec);
  const nativeRead = isNativeAudioContainer(info.container) || /mp4|isobmff/i.test(info.container);
  const source = audioSourceForFile(fileName);
  const fmt = (id: AudioFormatSpec["id"]) => audioFormatById.get(id) as AudioFormatSpec;
  const lossy = (format: AudioFormatSpec, native: NativeSoundCodec | undefined, floor: number) => ({
    kind: "audio" as const,
    format,
    native,
    ffmpegDecode: !nativeRead,
    bitrateKbps: bitrateFor(track.bitrate, floor, native === "opus" ? 128 : 192),
  });
  if (!nativeRead) {
    // WMA and AIFF: ffmpeg decodes. AIFF stays AIFF; WMA becomes MP3 (ffmpeg has no WMA we would pick).
    if (source?.id === "aiff" || /^pcm-.*be$/.test(codec ?? ""))
      return {
        kind: "audio",
        format: {
          ...fmt("aiff"),
          encode: /24/.test(codec ?? "") ? { ffmpeg: "pcm_s24be" } : fmt("aiff").encode,
        },
        ffmpegDecode: true,
      };
    return lossy(fmt("mp3"), undefined, 128);
  }
  if (codec === "mp3") return lossy(fmt("mp3"), undefined, 128);
  if (codec === "aac") return lossy(fmt("m4a"), "aac", 96);
  if (codec === "opus") return lossy(fmt("opus"), "opus", 64);
  if (codec === "vorbis") return lossy(fmt("ogg"), undefined, 96);
  if (codec === "flac")
    return { kind: "audio", format: fmt("flac"), native: "flac", ffmpegDecode: false };
  if (codec?.startsWith("pcm")) {
    const depth: NativeSoundCodec = /f32|f64/.test(codec)
      ? "pcm-f32"
      : /24|32/.test(codec)
        ? "pcm-s24"
        : "pcm-s16";
    const wav = fmt("wav");
    return {
      kind: "audio",
      format: {
        ...wav,
        encode: {
          native: depth,
          ffmpeg:
            depth === "pcm-f32" ? "pcm_f32le" : depth === "pcm-s24" ? "pcm_s24le" : "pcm_s16le",
        },
      },
      native: depth,
      ffmpegDecode: false,
    };
  }
  return {
    kind: "none",
    reason: "This browser cannot write this sound format. Convert it to WAV first.",
  };
}

/** "clip.mp4" → "clip-louder.mp4": the source name, the job, the target's extension. */
export function soundOutputName(fileName: string, suffix: string, t: SoundTarget): string {
  const ext = t.kind === "video" ? t.extension : t.kind === "audio" ? t.format.extension : "bin";
  return `${baseName(fileName) || "audio"}-${suffix}.${ext}`;
}

/** Whether the job needs ffmpeg.wasm on the page (decode or encode), before any encoder probe. */
export const needsFfmpeg = (t: SoundTarget) =>
  t.kind === "audio" && (t.ffmpegDecode || t.native === undefined);

/** The ffmpeg audio encoder arguments for the shown command and the ffmpeg stage. */
export function ffmpegSoundArgs(t: SoundTarget): string[] {
  if (t.kind === "video")
    return [
      "-c:v",
      "copy",
      "-c:a",
      t.container === "webm" ? "libopus" : "aac",
      "-b:a",
      `${t.bitrateKbps}k`,
    ];
  if (t.kind !== "audio") return [];
  return [
    "-c:a",
    t.format.encode.ffmpeg,
    ...(t.bitrateKbps ? ["-b:a", `${t.bitrateKbps}k`] : []),
    ...(t.format.encode.args ?? []),
  ];
}

/**
 * A file name for `soundTarget` when a hook has only the inspected facts (spec `summary`, `blocked`):
 * the extension the container would have, so both read the file the same way the job does.
 */
export function nameFor(info: MediaInfo): string {
  const c = info.container.toLowerCase();
  const ext = c.includes("quicktime")
    ? "mov"
    : c.includes("matroska")
      ? "mkv"
      : c.includes("webm")
        ? "webm"
        : c.includes("mp4") || c.includes("isobmff")
          ? info.video
            ? "mp4"
            : "m4a"
          : c === "wave"
            ? "wav"
            : c === "ogg"
              ? info.audio?.[0]?.codec === "opus"
                ? "opus"
                : "ogg"
              : c;
  return `file.${ext}`;
}
