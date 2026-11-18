/**
 * Subtitle tracks as the extract-subtitles tool sees them, from either container reader. Pure.
 */
import { findLanguage } from "../subtitles/languages";

/**
 * What a track holds. Text kinds can be written as SRT or WebVTT; `picture` tracks (PGS, VobSub, DVB)
 * are images of text and would need character recognition; `other` is a text form this tool does
 * not read (CEA-608 captions, TTML).
 */
export type SubtitleKind = "srt" | "ass" | "vtt" | "tx3g" | "picture" | "other";

export const isText = (k: SubtitleKind) => k !== "picture" && k !== "other";

export interface SubtitleTrack {
  /** Matroska TrackNumber or MP4 track_ID: the key the options select by. */
  id: number;
  /** 0-based position among the file's subtitle tracks (ffmpeg's `0:s:N`). */
  index: number;
  kind: SubtitleKind;
  /** The container's own codec name ("S_TEXT/UTF8", "tx3g"), for the inspector and messages. */
  codec: string;
  /** ISO 639-2 as stored; undefined when the file says "und" or nothing. */
  language?: string;
  name?: string;
  default?: boolean;
  forced?: boolean;
}

/** One cue as stored: milliseconds and the stored payload. */
export interface RawCue {
  start: number;
  end: number;
  /** Text (SRT body, WebVTT payload, tx3g text), or for ASS the block's fields after ReadOrder. */
  text: string;
  /** WebVTT cue settings ("line:0 align:start"), when the container stores them. */
  settings?: string;
  /** ASS: the ReadOrder field, the order lines go back into the script. */
  order?: number;
}

export interface ExtractedTrack {
  track: SubtitleTrack;
  cues: RawCue[];
  /** ASS: the script header (CodecPrivate / the sample description), up to and including [Events]. */
  header?: string;
}

/** Friendly name of the stored form, for the track list. */
export function kindLabel(t: Pick<SubtitleTrack, "kind" | "codec">): string {
  switch (t.kind) {
    case "srt":
      return "SRT";
    case "ass":
      return t.codec === "S_TEXT/SSA" ? "SSA" : "ASS";
    case "vtt":
      return "WebVTT";
    case "tx3g":
      return "MP4 timed text";
    case "picture":
      return /PGS/i.test(t.codec)
        ? "PGS pictures"
        : /VOBSUB|mp4s/i.test(t.codec)
          ? "VobSub pictures"
          : "Pictures";
    default:
      return t.codec;
  }
}

/** "English", "French (forced)", "Track 3". */
export function trackTitle(t: SubtitleTrack): string {
  const lang = findLanguage(t.language)?.name ?? t.language?.toUpperCase();
  const base =
    t.name && t.name !== lang
      ? lang
        ? `${lang}, ${t.name}`
        : t.name
      : (lang ?? `Track ${t.index + 1}`);
  return t.forced ? `${base} (forced)` : base;
}
