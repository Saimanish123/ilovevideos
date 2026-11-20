/**
 * Audio capability table, same shape of facts as ./containers.ts: what we can read and write, with
 * which engine, and which source codecs each output format holds without re-encoding. Drives the
 * target select, the copy-vs-re-encode planner (`engines/video-to-audio/plan.ts`, shared by the
 * video → audio and audio → audio engines), the ffmpeg arguments and the estimated size.
 * Capability only; format prose lives in ./audio-profiles.ts and the registry pages.
 *
 * Encoder facts: WebCodecs cannot encode MP3 or Vorbis anywhere, and Chromium's AudioEncoder does
 * not offer FLAC or AAC on every platform, so those re-encodes go through ffmpeg.wasm (libmp3lame,
 * libvorbis, flac, aac). PCM is written by mediabunny itself and Opus by WebCodecs, so WAV and Opus
 * stay on the native path. mediabunny has no AIFF muxer or demuxer, so AIFF is ffmpeg both ways.
 */

import { audioFormatNames, audioSourceNames } from "./audio-names";
import type { Engine } from "./containers";

/** mediabunny muxer used for stream copies and native encodes (see `engines/mediabunny/shared.ts`). */
export type NativeAudioMuxer = "m4a" | "wav" | "ogg" | "flac" | "mp3";

export interface AudioFormatSpec {
  id: "mp3" | "m4a" | "wav" | "flac" | "ogg" | "opus" | "aiff";
  /** As the world writes it. */
  name: string;
  extension: string;
  mime: string;
  /** Engine that re-encodes into it. */
  write: Engine;
  /** mediabunny muxer for copies and native encodes; absent when only ffmpeg can write the format. */
  muxer?: NativeAudioMuxer;
  /** mediabunny codec ids this format can carry without re-encoding. */
  codecs: string[];
  /** Codec used when re-encoding: mediabunny id for the native path, ffmpeg encoder for ffmpeg. */
  encode: { native?: string; ffmpeg: string; args?: string[] };
  /** ffmpeg muxer name. */
  ffmpegFormat: string;
  /** Lossless formats ignore the bitrate preset. */
  lossless: boolean;
  /** One line for the select hint and the page copy. */
  note: string;
  popularity: number;
}

export const audioFormats: AudioFormatSpec[] = [
  {
    id: "mp3",
    name: audioFormatNames.mp3,
    extension: "mp3",
    mime: "audio/mpeg",
    write: "ffmpeg",
    muxer: "mp3",
    codecs: ["mp3"],
    encode: { ffmpeg: "libmp3lame" },
    ffmpegFormat: "mp3",
    lossless: false,
    note: "Plays on everything. Always a re-encode unless the source already carries MP3.",
    popularity: 100,
  },
  {
    id: "m4a",
    name: audioFormatNames.m4a,
    extension: "m4a",
    mime: "audio/mp4",
    write: "native",
    muxer: "m4a",
    codecs: ["aac"],
    encode: { ffmpeg: "aac" },
    ffmpegFormat: "ipod",
    lossless: false,
    note: "AAC in an MP4 file. An AAC source is copied as is, with no quality loss.",
    popularity: 90,
  },
  {
    id: "wav",
    name: audioFormatNames.wav,
    extension: "wav",
    mime: "audio/wav",
    write: "native",
    muxer: "wav",
    codecs: ["pcm-s16", "pcm-s24", "pcm-f32"],
    encode: { native: "pcm-s16", ffmpeg: "pcm_s16le" },
    ffmpegFormat: "wav",
    lossless: true,
    note: "Uncompressed 16-bit PCM for editing. About 10 MB per minute of 44.1 kHz stereo.",
    popularity: 80,
  },
  {
    id: "flac",
    name: audioFormatNames.flac,
    extension: "flac",
    mime: "audio/flac",
    write: "ffmpeg",
    muxer: "flac",
    codecs: ["flac"],
    encode: { ffmpeg: "flac" },
    ffmpegFormat: "flac",
    lossless: true,
    note: "Lossless and about half the size of WAV. It keeps what the source has; it cannot add detail.",
    popularity: 60,
  },
  {
    id: "ogg",
    name: audioFormatNames.ogg,
    extension: "ogg",
    mime: "audio/ogg",
    write: "ffmpeg",
    muxer: "ogg",
    codecs: ["vorbis"],
    encode: { ffmpeg: "libvorbis" },
    ffmpegFormat: "ogg",
    lossless: false,
    note: "Vorbis in an Ogg file, the kind game engines and older Ogg players expect.",
    popularity: 50,
  },
  {
    id: "opus",
    name: audioFormatNames.opus,
    extension: "opus",
    mime: "audio/ogg",
    write: "native",
    muxer: "ogg",
    codecs: ["opus"],
    encode: { native: "opus", ffmpeg: "libopus" },
    ffmpegFormat: "opus",
    lossless: false,
    note: "The most efficient lossy codec: small files for voice and music, in browsers and on Android.",
    popularity: 45,
  },
  {
    id: "aiff",
    name: audioFormatNames.aiff,
    extension: "aiff",
    mime: "audio/aiff",
    write: "ffmpeg",
    codecs: ["pcm-s16be", "pcm-s24be"],
    encode: { ffmpeg: "pcm_s16be" },
    ffmpegFormat: "aiff",
    lossless: true,
    note: "Apple's uncompressed PCM, for Logic, GarageBand and older Mac software. Same size as WAV.",
    popularity: 30,
  },
];

export type AudioFormatId = AudioFormatSpec["id"];
export const audioFormatIds = audioFormats.map((f) => f.id) as [AudioFormatId, ...AudioFormatId[]];
export const audioFormatById = new Map(audioFormats.map((f) => [f.id, f]));

/** Bitrate presets for lossy targets, in kbps. 192 is the default: transparent for most listeners. */
export const audioBitratePresets = [128, 192, 320] as const;
export type AudioBitrate = (typeof audioBitratePresets)[number];

/**
 * Audio files we accept as input, by extension, and which engine reads them. Native = mediabunny
 * (MP3, WAVE, Ogg, FLAC, ADTS and MP4 demuxers); ffmpeg = ffmpeg.wasm, probed and converted on the
 * page. Video containers are in ./containers.ts.
 */
export interface AudioSourceSpec {
  id: "mp3" | "m4a" | "aac" | "wav" | "flac" | "ogg" | "opus" | "wma" | "aiff";
  name: string;
  extensions: string[];
  read: Engine;
}

export const audioSources: AudioSourceSpec[] = [
  { id: "mp3", name: audioSourceNames.mp3, extensions: ["mp3"], read: "native" },
  { id: "m4a", name: audioSourceNames.m4a, extensions: ["m4a", "m4b", "m4r"], read: "native" },
  { id: "aac", name: audioSourceNames.aac, extensions: ["aac", "adts"], read: "native" },
  { id: "wav", name: audioSourceNames.wav, extensions: ["wav", "wave"], read: "native" },
  { id: "flac", name: audioSourceNames.flac, extensions: ["flac"], read: "native" },
  { id: "ogg", name: audioSourceNames.ogg, extensions: ["ogg", "oga"], read: "native" },
  { id: "opus", name: audioSourceNames.opus, extensions: ["opus"], read: "native" },
  { id: "wma", name: audioSourceNames.wma, extensions: ["wma"], read: "ffmpeg" },
  { id: "aiff", name: audioSourceNames.aiff, extensions: ["aiff", "aif", "aifc"], read: "ffmpeg" },
];

/** Audio extensions only ffmpeg.wasm can open; the stage probes these with ffmpeg when mediabunny refuses them. */
export const ffmpegOnlyAudioExtensions = audioSources
  .filter((s) => s.read === "ffmpeg")
  .flatMap((s) => s.extensions);

export function audioSourceForFile(name: string): AudioSourceSpec | undefined {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return audioSources.find((s) => s.extensions.includes(ext));
}

/**
 * mediabunny's audio-only demuxer names, matched exactly: "MP3", "WAVE", "Ogg", "FLAC", "ADTS".
 * ffmpeg's probe reports lowercase names ("mp3", "ogg"), which mean mediabunny could not open the
 * file, so they must not match. MP4/M4A is in ./containers.ts.
 */
export function isNativeAudioContainer(formatName: string): boolean {
  return ["MP3", "WAVE", "Ogg", "FLAC", "ADTS"].includes(formatName);
}

/**
 * Normalises a source audio codec name to a mediabunny id so the copy check works for files
 * inspected by ffmpeg ("mp3", "pcm_s16le", "wmav2") as well as by mediabunny ("aac", "pcm-s16").
 */
export function normalizeAudioCodec(codec: string | undefined): string | undefined {
  if (!codec || codec === "unknown") return undefined;
  const c = codec.toLowerCase();
  if (c === "pcm_s16le") return "pcm-s16";
  if (c.startsWith("pcm_")) return c.replace("pcm_", "pcm-").replace(/le$/, "");
  if (c === "mp3float" || c === "mp3") return "mp3";
  return c;
}
