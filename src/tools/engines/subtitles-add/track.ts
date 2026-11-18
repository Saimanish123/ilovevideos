/**
 * The subtitle text that goes into a video. Muxers want cues in time order with a positive length,
 * so the cues are sorted and any cue that ends at or before its start is left out (and counted, so
 * the page can say so). Pure; shared by the panel preview, the worker and the ffmpeg runner.
 */

import { EngineError } from "../errors";
import {
  parseSubtitles,
  type SubtitleDoc,
  type SubtitleFormat,
  writeSubtitles,
} from "../subtitles";
import { plain } from "../subtitles/markup";
import { subtitleError } from "../subtitles-convert";
import type { AddSubtitlesOptions } from "./options";

export interface TrackDoc {
  doc: SubtitleDoc;
  /** Cues left out because they end at or before their start. */
  dropped: number;
  /** Cues left out because they start after the video ends. */
  beyond: number;
}

/**
 * Sorted, with zero-length cues removed and, when the video's length is known, cues after its end
 * removed and the last ones cut at the end, so the output is no longer than the picture.
 */
export function trackDoc(source: SubtitleDoc, durationSec?: number): TrackDoc {
  const end = durationSec && durationSec > 0 ? Math.round(durationSec * 1000) : undefined;
  const timed = source.cues.filter((c) => c.end > c.start);
  // A cue that would be on screen for under a tenth of a second before the end is not worth a flash.
  const inside = end === undefined ? timed : timed.filter((c) => c.start < end - 100);
  const cues = inside
    .map((c, i) => ({ c: end !== undefined && c.end > end ? { ...c, end } : c, i }))
    .sort((a, b) => a.c.start - b.c.start || a.i - b.i)
    .map((x) => x.c);
  // ASS comment and drawing lines are timed too: keep them inside the video as well.
  const extras =
    end === undefined
      ? source.extras
      : source.extras.flatMap((x) =>
          !x.cue
            ? [x]
            : x.cue.start >= end
              ? []
              : [{ ...x, cue: { ...x.cue, end: Math.min(x.cue.end, end) } }],
        );
  return {
    doc: { ...source, cues, extras },
    dropped: source.cues.length - timed.length,
    beyond: timed.length - inside.length,
  };
}

export function readTrack(text: string, name: string, durationSec?: number): TrackDoc {
  return trackDoc(parseSubtitles(text, name), durationSec);
}

/**
 * The file handed to the muxer or to libass. ASS is written as it was (its styling is the point);
 * SRT and WebVTT are written clean, from the normal form, because the muxers' readers are strict.
 */
export function trackText(t: TrackDoc, as: SubtitleFormat): string {
  return writeSubtitles(t.doc, as, { clean: as !== "ass" });
}

/** All the words, for the font-coverage check. */
export const allText = (t: TrackDoc) => t.doc.cues.map((c) => plain(c.text)).join("\n");

/** The run's subtitle file, read again from the text the page stored in the options. */
export function needSubtitle(o: AddSubtitlesOptions, durationSec?: number) {
  if (!o.subtitle)
    throw new EngineError(
      "internal",
      "No subtitle file was added.",
      "Add an SRT, WebVTT, ASS or SBV file, then try again.",
    );
  try {
    return { sub: o.subtitle, track: readTrack(o.subtitle.text, o.subtitle.name, durationSec) };
  } catch (e) {
    throw subtitleError(e);
  }
}
