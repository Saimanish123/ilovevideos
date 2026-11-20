import type { AudioFormatId, AudioSourceSpec } from "./audio";

/**
 * Audio format names as the world writes them: the one definition, which the tables in ./audio.ts
 * take their `name` from. Apart from the tables so the audio drop prompts can name a format without
 * carrying the capability table into a page's first load (ADR-0140).
 */
export const audioFormatNames: Record<AudioFormatId, string> = {
  mp3: "MP3",
  m4a: "M4A",
  wav: "WAV",
  flac: "FLAC",
  ogg: "OGG (Vorbis)",
  opus: "Opus",
  aiff: "AIFF",
};

/** Names of the audio files we read, as a source (an OGG file may hold Vorbis or Opus). */
export const audioSourceNames: Record<AudioSourceSpec["id"], string> = {
  mp3: "MP3",
  m4a: "M4A",
  aac: "AAC",
  wav: "WAV",
  flac: "FLAC",
  ogg: "OGG",
  opus: "Opus",
  wma: "WMA",
  aiff: "AIFF",
};

/** A target format's name for a page preset's `to`, or undefined. */
export const audioFormatName = (id: unknown): string | undefined =>
  typeof id === "string" && id in audioFormatNames
    ? audioFormatNames[id as AudioFormatId]
    : undefined;
