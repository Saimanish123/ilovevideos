/**
 * The media inspector (mediabunny) lists no subtitle tracks. Video info reads them from the
 * container header, as extract subtitles does (quick: no media is read), so the report shows every
 * track with its format, language, name and flags. MP4/MOV and Matroska/WebM; other containers have
 * none listed.
 */
import { listSubtitleTracks } from "../subtitles-extract/tracks";
import type { MediaInfo } from "../types";

export async function subtitleTracksOf(file: Blob): Promise<NonNullable<MediaInfo["subtitles"]>> {
  try {
    const list = await listSubtitleTracks(file);
    return list.tracks.map((t) => ({
      codec: t.codec,
      kind: t.kind,
      language: t.language,
      name: t.name,
      default: t.default,
      forced: t.forced,
      id: t.id,
      index: t.index,
    }));
  } catch {
    // Subtitles are an extra fact; a header the reader cannot follow must not fail the inspection.
    return [];
  }
}

/** `info` with the file's subtitle tracks added, for a page's own `inspect` (video info). */
export async function withSubtitleTracks(file: Blob, info: MediaInfo): Promise<MediaInfo> {
  const subtitles = await subtitleTracksOf(file);
  return subtitles.length > 0 ? { ...info, subtitles } : info;
}
