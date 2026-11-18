/**
 * Decides how a conversion will run before it starts, so the UI can say so honestly:
 * which engine, and whether video/audio are copied or re-encoded. Pure; used by the panel and the runners.
 */
import {
  type ContainerSpec,
  containerById,
  containerFromFormatName,
} from "@/content/formats/containers";
import { encodedSize, evenSizeNote, type Size } from "../crop/math";
import type { MediaInfo } from "../types";

export type ConversionBackend = "webcodecs" | "ffmpeg-wasm";

export interface ConversionPlan {
  backend: ConversionBackend;
  source?: ContainerSpec;
  target: ContainerSpec;
  copyVideo: boolean;
  copyAudio: boolean;
  /** Encoder names for the ffmpeg path, or codec ids for the native path. */
  videoCodec: string;
  audioCodec: string;
  /**
   * The picture size the encoder writes, when the picture is re-encoded: an odd edge loses its last
   * column or row for H.264 and HEVC (../crop/math `encodedSize`, ADR-0060). Undefined when copied.
   */
  size?: Size;
  /** "641×361 becomes 640×360: H.264 needs even edges." when the re-encode cuts an edge, else "". */
  sizeNote: string;
}

const NATIVE_VIDEO: Record<string, string> = { mp4: "avc", mov: "avc", mkv: "avc", webm: "vp9" };
const NATIVE_AUDIO: Record<string, string> = { mp4: "aac", mov: "aac", mkv: "aac", webm: "opus" };

/**
 * ffmpeg's `-i` log names some codecs differently from mediabunny ("h264" for "avc"). Files probed by
 * ffmpeg (AVI, FLV, ...) are compared under mediabunny's names so an H.264 FLV is copied, not re-encoded.
 */
const FFMPEG_TO_MEDIABUNNY: Record<string, string> = { h264: "avc", pcm_s16le: "pcm-s16" };
export const normalizeCodec = (c: string | undefined) =>
  c === undefined ? undefined : (FFMPEG_TO_MEDIABUNNY[c] ?? c);

/**
 * Codecs the browser's own decoders handle (WebCodecs in current Chrome, Edge, Firefox and Safari). A
 * stream outside these that must be re-encoded goes to ffmpeg.wasm even from a container the native
 * reader opens: H.263 in 3GP, AC-3 in MPEG-TS or MKV.
 */
const NATIVE_DECODE = new Set([
  "avc",
  "hevc",
  "vp8",
  "vp9",
  "av1",
  "aac",
  "opus",
  "mp3",
  "vorbis",
  "flac",
  "pcm-s16",
  "pcm-s24",
  "pcm-f32",
]);

/**
 * Whether the picture can be kept as it is in `to` (the panel's "Keep VP9" choice): the container
 * must hold the codec, and a rotation flag when the picture is rotated. WebM's VP9 into MOV cannot.
 */
export function keepsVideoCodec(info: MediaInfo, to: string): boolean {
  const target = containerById.get(to);
  const codec = normalizeCodec(info.video?.codec);
  const rotated = (((info.video?.rotation ?? 0) % 360) + 360) % 360 !== 0;
  return (
    !!target &&
    !!codec &&
    target.videoCodecs.includes(codec) &&
    (!rotated || target.rotationFlag === true)
  );
}

/** Whether the browser's own decoders handle this codec (the native path can re-encode it). */
export const nativelyDecodes = (c: string | undefined) =>
  c !== undefined && NATIVE_DECODE.has(normalizeCodec(c) ?? c);

/** The ffmpeg encoders that take even edges only, under the codec ids `encodedSize` knows. */
const EVEN_EDGE_CODEC: Record<string, string> = { libx264: "avc", libx265: "hevc" };

/** The size and note for a re-encode to `codec` (a mediabunny id or an ffmpeg encoder name). */
function written(info: MediaInfo, copied: boolean, codec: string) {
  const v = info.video;
  if (copied || !v || !(v.width > 0 && v.height > 0)) return { size: undefined, sizeNote: "" };
  const id = EVEN_EDGE_CODEC[codec] ?? codec;
  return { size: encodedSize(v, id), sizeNote: evenSizeNote(v, id) };
}

export function planConversion(
  info: MediaInfo,
  fileName: string,
  to: string,
  forceVideoTranscode = false,
): ConversionPlan {
  const target = containerById.get(to) ?? containerById.get("mp4");
  if (!target) throw new Error("unknown target");
  const source = containerFromFormatName(info.container, fileName);
  const vCodec = normalizeCodec(info.video?.codec);
  const aCodec = normalizeCodec(info.audio?.[0]?.codec);
  // A rotated picture copies only into a container with a rotation flag (MP4, MOV, 3GP); elsewhere it
  // is turned upright by re-encoding, rather than copied to play sideways.
  const rotated = (((info.video?.rotation ?? 0) % 360) + 360) % 360 !== 0;
  const canCopyVideo =
    !forceVideoTranscode &&
    !!vCodec &&
    target.videoCodecs.includes(vCodec) &&
    (!rotated || target.rotationFlag === true);
  // "Plays everywhere" (H.264 forced) also means AAC sound: the container may hold Opus or FLAC,
  // but the players that need H.264 do not play them.
  const compatAudio = NATIVE_AUDIO[target.id] ?? "aac";
  const canCopyAudio =
    !aCodec ||
    (target.audioCodecs.includes(aCodec) && (!forceVideoTranscode || aCodec === compatAudio));
  // The browser's own answer for this file's tracks wins over the codec list: Chrome without platform
  // HEVC support says no to hvc1, and a native run would then drop the picture.
  const decodable = (c: string | undefined, copied: boolean, probed: boolean | undefined) =>
    copied || !c || (NATIVE_DECODE.has(c) && probed !== false);
  const nativeOk =
    (source?.read ?? "ffmpeg") === "native" &&
    target.write === "native" &&
    decodable(vCodec, canCopyVideo, info.video?.decodable) &&
    decodable(aCodec, canCopyAudio, info.audio?.[0]?.decodable);

  if (nativeOk) {
    const videoCodec = canCopyVideo ? (vCodec ?? "") : (NATIVE_VIDEO[target.id] ?? "avc");
    return {
      backend: "webcodecs",
      source,
      target,
      copyVideo: canCopyVideo,
      copyAudio: canCopyAudio,
      videoCodec,
      audioCodec: canCopyAudio ? (aCodec ?? "") : (NATIVE_AUDIO[target.id] ?? "aac"),
      ...written(info, canCopyVideo, videoCodec),
    };
  }
  const f = target.ffmpeg;
  const videoCodec = canCopyVideo ? "copy" : (f?.video ?? "libx264");
  return {
    backend: "ffmpeg-wasm",
    source,
    target,
    copyVideo: canCopyVideo,
    copyAudio: canCopyAudio,
    videoCodec,
    audioCodec: canCopyAudio ? "copy" : (f?.audio ?? "aac"),
    ...written(info, canCopyVideo, videoCodec),
  };
}

export const codecDisplayNames: Record<string, string> = {
  avc: "H.264",
  hevc: "HEVC",
  av1: "AV1",
  vp8: "VP8",
  vp9: "VP9",
  prores: "ProRes",
  aac: "AAC",
  mp3: "MP3",
  opus: "Opus",
  vorbis: "Vorbis",
  flac: "FLAC",
  ac3: "AC-3",
  libx264: "H.264",
  "libvpx-vp9": "VP9",
  libopus: "Opus",
  libmp3lame: "MP3",
  mpeg4: "MPEG-4 Part 2",
  mpeg2video: "MPEG-2",
  wmv2: "WMV 8",
  wmav2: "WMA",
  libtheora: "Theora",
  libvorbis: "Vorbis",
  mp2: "MP2",
  pcm_s16le: "PCM",
  mpeg1video: "MPEG-1",
  h264: "H.264",
  theora: "Theora",
  flv1: "Sorenson Spark",
  vp6f: "VP6",
  wmv1: "WMV 7",
  vc1: "VC-1",
  mjpeg: "Motion JPEG",
  amr_nb: "AMR",
  eac3: "E-AC-3",
  dts: "DTS",
  "pcm-s16": "PCM",
  "pcm-s24": "PCM",
  "pcm-f32": "PCM",
  msmpeg4v3: "DivX",
  h263: "H.263",
  ffv1: "FFV1",
  rawvideo: "uncompressed",
  svq3: "Sorenson Video 3",
  cinepak: "Cinepak",
  dvvideo: "DV",
  wmv3: "WMV 9",
  wmav1: "WMA",
};
export const codecName = (c: string | undefined) =>
  c && c !== "unknown" ? (codecDisplayNames[c] ?? c.toUpperCase()) : undefined;
