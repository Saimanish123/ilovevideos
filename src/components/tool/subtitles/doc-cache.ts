/**
 * Subtitle files are read once on the page (`OptionsSpec.inspect`) and the parsed document is kept
 * against the MediaInfo object the stage holds, so the hero, the panel, the summary and the result
 * verdict all read the same cues without parsing again. Nothing leaves the page.
 */
import { docSummary, formatNames, type SubtitleDoc } from "@/tools/engines/subtitles";
import { languageFromFile } from "@/tools/engines/subtitles/languages";
import { type FixReport, fixTiming } from "@/tools/engines/subtitles/timing";
import { readSubtitleFile } from "@/tools/engines/subtitles-convert";
import type { MediaInfo } from "@/tools/engines/types";

export type ReadDoc = SubtitleDoc & { renamed?: string };

const byInfo = new WeakMap<MediaInfo, ReadDoc>();

/** Reads a subtitle file into the stage's MediaInfo shape; parse failures carry the line number. */
export async function inspectSubtitles(file: File): Promise<MediaInfo> {
  const doc = (await readSubtitleFile(file)) as ReadDoc;
  const s = docSummary(doc);
  const info: MediaInfo = {
    container: formatNames[doc.format],
    durationSec: s.last / 1000,
    sizeBytes: file.size,
    subtitles: [
      {
        codec: doc.format,
        language: languageFromFile(file.name, doc.header)?.code,
        cues: s.cues,
      },
    ],
  };
  byInfo.set(info, doc);
  return info;
}

export const docFor = (info: MediaInfo | undefined): ReadDoc | undefined =>
  info ? byInfo.get(info) : undefined;

const noFix: FixReport = {
  emptyRemoved: 0,
  duplicatesRemoved: 0,
  lengthsFixed: 0,
  reordered: 0,
  overlapsFixed: 0,
  merged: 0,
};
const plans = new WeakMap<object, FixReport>();

/** What the timing fix would do to this file: the one count the panel, the list and the result share. */
export function plannedFix(info: MediaInfo | undefined): FixReport {
  const doc = docFor(info);
  if (!doc) return noFix;
  let r = plans.get(doc);
  if (!r) {
    r = fixTiming(doc).report;
    plans.set(doc, r);
  }
  return r;
}
