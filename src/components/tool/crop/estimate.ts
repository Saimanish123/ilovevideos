import type { Size } from "@/tools/engines/crop/math";
import {
  audioCopied,
  changesContainer,
  geometryBitrate,
  geometryContainer,
  needsFfmpeg,
  sourceName,
} from "@/tools/engines/crop/plan";
import type { MediaInfo } from "@/tools/engines/types";

/** Ready-state estimate for a crop or reshape: the planned video bitrate plus the sound, over the whole clip. */
export function geometryEstimate(info: MediaInfo, size: Size) {
  const fileName = sourceName(info);
  const to = geometryContainer(fileName);
  const copied = audioCopied(info, to) && !needsFfmpeg(info, fileName);
  const track = info.audio?.[0];
  const audio = track ? (copied ? (track.bitrate ?? 128_000) : 128_000) : 0;
  const video = geometryBitrate(size, info.video?.fps, info.video);
  return {
    bytes: Math.round(((video + audio) * info.durationSec) / 8),
    audio: !track
      ? "There is no sound track."
      : copied
        ? "The sound is copied as it is."
        : "The sound is encoded to AAC.",
    container: changesContainer(fileName, info) ? " Saved as MP4." : "",
  };
}
