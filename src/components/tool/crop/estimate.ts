import type { Size } from "@/tools/engines/crop/math";
import {
  audioCopied,
  changesContainer,
  geometryBitrate,
  geometryContainer,
  needsFfmpeg,
  sourceName,
} from "@/tools/engines/crop/plan";
import {
  encodedSoundBps,
  type SoundEncoders,
  soundCodecName,
  writtenSoundCodec,
} from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";

/**
 * Ready-state estimate for a crop or reshape: the planned video bitrate plus the sound, over the whole
 * clip. `can` is this browser's sound encoders (engines/sound-codec); `trimmed` is a length cap that
 * cuts the clip, which re-encodes the sound where there is no AAC encoder (../crop/native).
 */
export function geometryEstimate(info: MediaInfo, size: Size, can: SoundEncoders, trimmed = false) {
  const fileName = sourceName(info);
  const to = geometryContainer(fileName);
  const ffmpeg = needsFfmpeg(info, fileName);
  const copied = audioCopied(info, to) && !ffmpeg && (can.aac || !trimmed);
  // ffmpeg.wasm writes AAC; the native path follows this browser's encoders.
  const codec = ffmpeg ? "aac" : writtenSoundCodec(to, can);
  const track = info.audio?.[0];
  const audio = track
    ? copied
      ? (track.bitrate ?? 128_000)
      : encodedSoundBps(codec, 128_000, track)
    : 0;
  const video = geometryBitrate(size, info.video?.fps, info.video);
  return {
    bytes: Math.round(((video + audio) * info.durationSec) / 8),
    audio: !track
      ? "There is no sound track."
      : copied
        ? "The sound is copied as it is."
        : `The sound is ${codec === "pcm-s16" ? "written as" : "encoded to"} ${soundCodecName(codec)}.`,
    container: changesContainer(fileName, info) ? " Saved as MP4." : "",
  };
}
