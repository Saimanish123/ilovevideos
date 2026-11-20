/**
 * The ready-state line of the sound tools: what is copied, what is re-encoded and by which engine,
 * from the same target the job uses (./target). Pure: no DOM, no mediabunny.
 */
import { withUnit } from "@/lib/format";
import { ffmpegDownloadSize } from "../ffmpeg/size";
import type { MediaInfo } from "../types";
import { needsFfmpeg, soundTarget } from "./target";

const pcmWords = (codec: string | undefined) =>
  codec === "pcm-f32" ? "32\u2011bit float" : codec === "pcm-s24" ? "24\u2011bit" : "16\u2011bit";

/** "The picture is copied as it is; the sound is encoded once to AAC at 192 kbps." */
export function soundSummary(info: MediaInfo, fileName: string): string | undefined {
  const t = soundTarget(info, fileName);
  if (t.kind === "none") return undefined;
  const others = Math.max(0, (info.audio?.length ?? 0) - 1);
  const left =
    others > 0
      ? ` Only the first sound track is kept; ${others === 1 ? "the other one is" : `the other ${others} are`} left out.`
      : "";
  if (t.kind === "video")
    return `The picture is copied as it is; the sound is encoded once to ${t.container === "webm" ? "Opus" : "AAC"} at ${withUnit(t.bitrateKbps, "kbps")}.${left}`;
  const f = t.format;
  const how =
    f.id === "wav"
      ? `as ${pcmWords(t.native)} WAV`
      : f.id === "flac"
        ? "as FLAC, which is lossless"
        : f.id === "aiff"
          ? "as AIFF"
          : `as ${f.name} at ${withUnit(t.bitrateKbps ?? 192, "kbps")}, a second lossy encode`;
  const engine = needsFfmpeg(t)
    ? ` This format needs a one-time download of ${ffmpegDownloadSize()}.`
    : "";
  const renamed =
    t.ffmpegDecode && f.id === "mp3" ? " WMA is written as MP3, which plays everywhere." : "";
  return `Saved ${how}.${engine}${renamed}${left}`;
}

/**
 * What the file is written as, as dot-separated facts for a one-line status ("picture copied · AAC
 * 192 kbps", "MP3 128 kbps, re-encoded · ffmpeg engine", "WAV 16-bit"). The same target as the job.
 */
export function soundOutputFacts(info: MediaInfo, fileName: string): string[] {
  const t = soundTarget(info, fileName);
  if (t.kind === "none") return [];
  if (t.kind === "video")
    return [
      "picture copied",
      `${t.container === "webm" ? "Opus" : "AAC"} ${withUnit(t.bitrateKbps, "kbps")}`,
    ];
  const f = t.format;
  const what =
    f.id === "wav"
      ? `WAV ${pcmWords(t.native)}`
      : f.lossless
        ? f.name
        : // A lossy file is encoded again; say so beside the bitrate.
          `${f.name} ${withUnit(t.bitrateKbps ?? 192, "kbps")}, re-encoded`;
  return needsFfmpeg(t) ? [what, `${ffmpegDownloadSize()} download, once`] : [what];
}
