/**
 * File-first suggestions (ADR-0125): from what the inspector read on this device, the few facts that
 * point at a tool, each with the tools that act on it. Pure, so every rule is unit-tested; the page
 * (components/layout/file-suggest.tsx) reads the file and renders the rows.
 *
 * A row exists only when its fact is true of this file ("HEVC from an iPhone", "1.2 GB", "18 min");
 * there is no row without a reason and no padding to fill a quota. At most six actions in all.
 *
 * Conversions go to the general converters, whose defaults are the promised target (MP4, MP3, H.264),
 * not to format-pair pages: those are for search only (ADR-0154). `pairs` only says which formats
 * have a story worth a row.
 */
import { fileFacts as copy } from "@/content/site/file-facts";
import type { MediaInfo } from "@/tools/engines/types";
import { formatBytes, NBSP } from "./format";

export interface SuggestedAction {
  slug: string;
  label: string;
  /** Hand every chosen file on (merge), not just the first. */
  all?: true;
}

export interface SuggestionRow {
  reason: string;
  actions: SuggestedAction[];
}

/** Which format pages exist: sources with a `<x>-to-mp4` page and with a `<x>-to-mp3` page. */
export interface PairSources {
  video: readonly string[];
  audio: readonly string[];
}

export const MAX_ACTIONS = 6;
/** From this size a file gets "Make it smaller": below it, compressing is rarely the job. */
export const LARGE_BYTES = 25_000_000;
/** From this length, "Trim it"; from the second, also "Cut it into clips for Shorts". */
export const LONG_SEC = 60;
export const SHORTS_SEC = 180;

const SUBTITLE_EXT = ["srt", "vtt", "ass", "ssa", "sbv"];
const REPAIRABLE_EXT = ["mp4", "mov", "m4v", "mkv", "3gp"];

export const extOf = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
};

export type FileKind = "media" | "gif" | "image" | "subtitle";

/** What a file is before anything reads it: its type, else its extension. */
export function kindOf(file: { name: string; type: string }): FileKind {
  const ext = extOf(file.name);
  if (file.type === "image/gif" || ext === "gif") return "gif";
  if (SUBTITLE_EXT.includes(ext)) return "subtitle";
  if (file.type.startsWith("image/")) return "image";
  return "media";
}

/** "18 min", "1 h 12 min", "45 s": a length people say out loud. */
export function spokenLength(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}${NBSP}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}${NBSP}min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}${NBSP}h ${m % 60}${NBSP}min` : `${h}${NBSP}h`;
}

const upper = (ext: string) => ext.toUpperCase();

/**
 * Rows for one file. `info` is the inspector's reading, or undefined when it could not read the file
 * (an AVI or WMV the browser cannot open, or a damaged file).
 */
export function suggestForFile(
  file: { name: string; type: string; size: number },
  info: MediaInfo | undefined,
  pairs: PairSources,
  count = 1,
): SuggestionRow[] {
  const ext = extOf(file.name);
  const kind = kindOf(file);
  const rows: SuggestionRow[] = [];

  if (kind === "subtitle") {
    rows.push({
      reason: copy.subtitles(upper(ext)),
      actions: [
        { slug: "subtitle-converter", label: copy.convertSubtitles },
        { slug: "add-subtitles-to-video", label: copy.addSubtitles },
      ],
    });
    return cap(rows);
  }
  if (kind === "gif") {
    rows.push({
      reason: `${copy.gif}, ${formatBytes(file.size)}`,
      actions: [{ slug: "gif-to-mp4", label: copy.gifToMp4 }],
    });
    return cap(rows);
  }
  if (kind === "image") {
    rows.push({
      reason: copy.pictures(count),
      actions: [{ slug: "images-to-video", label: copy.slideshow(count), all: true }],
    });
    return cap(rows);
  }

  const video = info?.video;
  const audioOnly = info !== undefined && !video && (info.audio?.length ?? 0) > 0;

  if (count > 1)
    rows.push(
      audioOnly
        ? {
            reason: copy.audioFiles(count),
            actions: [{ slug: "merge-audio", label: copy.mergeAudio, all: true }],
          }
        : {
            reason: copy.videos(count),
            actions: [{ slug: "merge-videos", label: copy.merge, all: true }],
          },
    );

  if (!info) {
    // MP4, MOV and MKV open in every browser this site supports: one that does not is damaged.
    if (REPAIRABLE_EXT.includes(ext))
      rows.push({
        reason: copy.unreadable,
        actions: [{ slug: "repair-video", label: copy.repair }],
      });
    // AVI, WMV, FLV and the like: the format page converts them with FFmpeg.
    else if (pairs.video.includes(ext))
      rows.push({
        reason: copy.container(upper(ext)),
        actions: [{ slug: "video-converter", label: copy.toMp4 }],
      });
    else if (pairs.audio.includes(ext))
      rows.push({
        reason: copy.container(upper(ext)),
        actions: [{ slug: "audio-converter", label: copy.toMp3 }],
      });
    return cap(rows);
  }

  if (video) {
    const hevc = /^(hevc|hvc1|hev1|h265)$/i.test(video.codec);
    if (hevc) {
      const iphone = /iphone/i.test(info.tags?.model ?? "");
      rows.push({
        reason: iphone ? copy.hevcIphone : copy.hevc,
        actions: [{ slug: "change-video-codec", label: copy.toH264 }],
      });
    }
    // HEVC already has its conversion row: a second "Convert to MP4" beside it would only compete
    // (the MOV to MP4 copy keeps HEVC, so it does not fix playback where HEVC is the problem).
    if (!hevc && ext !== "mp4" && pairs.video.includes(ext))
      rows.push({
        reason: copy.container(upper(ext)),
        actions: [{ slug: "video-converter", label: copy.toMp4 }],
      });
    if (file.size >= LARGE_BYTES)
      rows.push({
        reason: formatBytes(file.size),
        actions: [{ slug: "compress-video", label: copy.smaller }],
      });
    if (info.durationSec >= LONG_SEC)
      rows.push({
        reason: spokenLength(info.durationSec),
        actions: [
          { slug: "trim-video", label: copy.trim },
          ...(info.durationSec >= SHORTS_SEC
            ? [{ slug: "cut-video-into-shorts", label: copy.shorts }]
            : []),
        ],
      });
    if (info.tags?.location)
      rows.push({
        reason: copy.location,
        actions: [{ slug: "remove-metadata-from-video", label: copy.removeLocation }],
      });
    if (video.fps > 61)
      rows.push({
        reason: copy.fps(Math.round(video.fps)),
        actions: [{ slug: "change-video-frame-rate", label: copy.lowerFps }],
      });
    if ((info.audio?.length ?? 0) > 1)
      rows.push({
        reason: copy.tracks(info.audio?.length ?? 0),
        actions: [{ slug: "select-audio-tracks", label: copy.pickTracks }],
      });
    if ((info.subtitles?.length ?? 0) > 0)
      rows.push({
        reason: copy.subtitleTracks(info.subtitles?.length ?? 0),
        actions: [{ slug: "extract-subtitles-from-video", label: copy.saveSubtitles }],
      });
    return cap(rows);
  }

  if (audioOnly) {
    if (ext !== "mp3")
      rows.push({
        reason: copy.container(upper(ext || "audio")),
        actions: [{ slug: "audio-converter", label: copy.toMp3 }],
      });
    if (info.durationSec >= LONG_SEC)
      rows.push({
        reason: spokenLength(info.durationSec),
        actions: [{ slug: "trim-audio", label: copy.trim }],
      });
  }
  return cap(rows);
}

/** At most `MAX_ACTIONS` actions, earlier rows first; a row cut to nothing is dropped. */
function cap(rows: SuggestionRow[]): SuggestionRow[] {
  let left = MAX_ACTIONS;
  const out: SuggestionRow[] = [];
  for (const r of rows) {
    if (left <= 0) break;
    const actions = r.actions.slice(0, left);
    left -= actions.length;
    out.push({ ...r, actions });
  }
  return out;
}
