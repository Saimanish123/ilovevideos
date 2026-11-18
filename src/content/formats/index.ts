/**
 * Format-profile library (README.md#seo-strategy §1, ADR-0011). Each format is described once;
 * pair pages compose two profiles with a hand-written pair story. Profile paragraphs are shared
 * across pages by design and are exempt from the registry's duplicate-paragraph check; every pair
 * page must still carry its own story (>= 150 unique words), enforced by `pnpm lint:registry`.
 */
import { audioSharedParagraphs } from "./audio-profiles";
import { containerById } from "./containers";
import { type LegacyFormatId, legacyFormats } from "./video-profiles";

export type FormatId = "mp4" | "mov" | "webm" | "mkv" | LegacyFormatId;

export interface FormatProfile {
  id: FormatId;
  /** As the world writes it. */
  name: string;
  /** Row id in ./containers.ts (the capability table). */
  container: string;
  extensions: string[];
  /**
   * Codecs files of this format carry, most common first (mediabunny ids; ffmpeg names where mediabunny
   * has none). Copy vs re-encode is decided against the target's row in ./containers.ts.
   */
  videoCodecs: string[];
  audioCodecs: string[];
  /** Where files of this format come from, one sentence. */
  origin: string;
  /** One paragraph: what the format is and what it is good at. Shared across pages. */
  summary: string;
  /** One paragraph: where it plays and where it does not. Shared across pages. */
  playback: string;
}

export const formats: Record<FormatId, FormatProfile> = {
  mp4: {
    id: "mp4",
    name: "MP4",
    container: "mp4",
    extensions: ["mp4", "m4v"],
    videoCodecs: ["avc", "hevc", "av1", "vp9"],
    audioCodecs: ["aac", "mp3", "opus", "flac"],
    origin: "Cameras, phones, exports from every editor and most download sites.",
    summary:
      "MP4 is the standard container for video on the web and on devices. It is a box that holds a video stream (usually H.264, sometimes HEVC or AV1), an audio stream (usually AAC) and metadata such as duration and chapters. The container itself does not decide quality; the codecs inside do. That is why many conversions to MP4 can copy the streams as they are with no quality loss at all.",
    playback:
      "MP4 with H.264 video and AAC audio plays on practically everything: every browser, phone, TV, games console and messaging app. MP4 with HEVC plays on Apple devices and recent Android and Windows machines but not in Chrome on many desktops. MP4 with AV1 needs a recent device.",
  },
  mov: {
    id: "mov",
    name: "MOV",
    container: "mov",
    extensions: ["mov", "qt"],
    videoCodecs: ["avc", "hevc", "av1", "prores"],
    audioCodecs: ["aac", "pcm-s16", "pcm-s24", "pcm-f32"],
    origin: "iPhone and iPad recordings, macOS screen recordings, QuickTime and Final Cut exports.",
    summary:
      "MOV is Apple's QuickTime container and the direct ancestor of MP4; the two share the same internal structure. An iPhone MOV usually contains HEVC or H.264 video with AAC audio, exactly what an MP4 would contain. Professional MOV files from Final Cut or a camera may instead hold ProRes video and uncompressed PCM audio, which are large and meant for editing, not sharing.",
    playback:
      "MOV plays natively on Apple devices and in QuickTime Player. On Windows, Android and in many web players it depends on the codecs inside and on installed software, which is why people convert it. Chat apps and websites often refuse the .mov extension outright even when the content is ordinary H.264.",
  },
  webm: {
    id: "webm",
    name: "WebM",
    container: "webm",
    extensions: ["webm"],
    videoCodecs: ["vp8", "vp9", "av1"],
    audioCodecs: ["opus", "vorbis"],
    origin:
      "Browser screen recorders, Discord and Chrome extensions, YouTube downloads, Linux screen capture.",
    summary:
      "WebM is Google's open, royalty-free container built for the web. It holds VP8, VP9 or AV1 video with Opus or Vorbis audio, and it is what browsers produce when a web page records your screen or camera. At the same quality WebM files are often a little smaller than H.264 MP4 because VP9 compresses more efficiently.",
    playback:
      "WebM plays in Chrome, Firefox, Edge and on Android, and in recent Safari on a Mac. It does not play in QuickTime Player, most TVs, older iPhones, Windows Media Player without extra codecs, or in most video editors, and Instagram and TikTok reject it on upload.",
  },
  mkv: {
    id: "mkv",
    name: "MKV",
    container: "mkv",
    extensions: ["mkv"],
    videoCodecs: ["avc", "hevc", "av1", "vp8", "vp9"],
    audioCodecs: ["aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "dts"],
    origin:
      "OBS and game recordings, Blu-ray rips, downloads with several audio or subtitle tracks.",
    summary:
      "MKV (Matroska) is an open container that can hold almost any video or audio codec, plus multiple audio tracks, subtitle tracks, chapters and attachments in one file. OBS records to MKV by default because the file survives a crash, and archivists like it because nothing has to be re-encoded to fit. The flexibility is also its weakness: players have to support whatever happens to be inside.",
    playback:
      "MKV plays in VLC, mpv, Plex and most Android players, and Windows 10 and 11 open it natively. It does not play in Safari, QuickTime, on iPhone without a third-party app, or on most TVs and consoles, and no major social or chat app accepts it for upload.",
  },
  ...legacyFormats,
};

export const formatList = Object.values(formats);

/** Paragraphs that may legitimately appear on more than one page. */
export const sharedParagraphs: ReadonlySet<string> = new Set([
  ...formatList.flatMap((f) => [f.summary, f.playback]),
  // Audio profiles (./audio-profiles.ts), shared by the audio pair pages.
  ...audioSharedParagraphs,
]);

export function canCopy(
  from: FormatProfile,
  to: FormatProfile,
): { video: string[]; audio: string[] } {
  // The capability table decides what the engine really copies (an AVI target copies nothing).
  const target = containerById.get(to.container);
  const v = target?.videoCodecs ?? to.videoCodecs;
  const a = target?.audioCodecs ?? to.audioCodecs;
  return {
    video: from.videoCodecs.filter((c) => v.includes(c)),
    audio: from.audioCodecs.filter((c) => a.includes(c)),
  };
}
