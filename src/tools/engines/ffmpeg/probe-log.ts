/**
 * Reads container and stream facts from ffmpeg's `-i` log, for files the native reader cannot open
 * (AVI, WMV, FLV, ...). Every sound track is listed with its language, as the conversion keeps them
 * all (./convert-args). Pure; unit-tested on logs from ffmpeg.wasm 0.12.10 (FFmpeg 5.1).
 */
import { EngineError } from "../errors";
import type { MediaInfo } from "../types";
import { ffmpegFailure } from "./failures";

/** ffmpeg's channel layout names ("5.1(side)") as a channel count. */
export function layoutChannels(layout: string): number {
  const l = layout.trim().replace(/\(.*\)$/, "");
  const named: Record<string, number> = {
    mono: 1,
    stereo: 2,
    "2.1": 3,
    "3.0": 3,
    quad: 4,
    "4.0": 4,
    "4.1": 5,
    "5.0": 5,
    "5.1": 6,
    "6.0": 6,
    "6.1": 7,
    "7.0": 7,
    "7.1": 8,
  };
  if (named[l] !== undefined) return named[l];
  const n = /^(\d+) channels?$/.exec(l);
  return n ? Number(n[1]) : 2;
}

const language = (code: string | undefined) => (code && code !== "und" ? code : undefined);

export function parseProbeLog(lines: string[], file: { name: string; size: number }): MediaInfo {
  const log = lines.join("\n");
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  const durationSec = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
  const streams = lines.filter((l) => /^\s*Stream #\d+:\d+/.test(l));
  // Cover art is a picture stream too; the video is the first one that is not.
  const videoLine = streams.find((l) => /: Video: /.test(l) && !/\(attached pic\)/.test(l));
  const v = videoLine
    ? /: Video: (\w+).*?,\s*(\d{2,5})x(\d{2,5})(?:.*?,\s*([\d.]+) fps)?/.exec(videoLine)
    : null;
  const audio = streams.flatMap((l) => {
    const a =
      /Stream #\d+:\d+(?:\[0x[0-9a-f]+\])?(?:\((\w+)\))?: Audio: (\w+).*?,\s*(\d+) Hz,\s*([^,]+)/.exec(
        l,
      );
    if (!a) return [];
    return [
      {
        codec: a[2] ?? "unknown",
        sampleRate: Number(a[3]),
        channels: layoutChannels(a[4] ?? "stereo"),
        language: language(a[1]),
      },
    ];
  });
  const videoLang = videoLine
    ? language(/Stream #\d+:\d+(?:\[0x[0-9a-f]+\])?\((\w+)\)/.exec(videoLine)?.[1])
    : undefined;
  const container = /Input #0, ([^,]+),/.exec(log)?.[1] ?? file.name.split(".").pop() ?? "unknown";
  if (!v && audio.length === 0) {
    // A reason ffmpeg gave (no index, damaged data) says more than "no stream".
    const reason = ffmpegFailure(lines, 1, { hint: "" });
    if (reason.code !== "internal") throw reason;
    throw new EngineError(
      "unsupported-input",
      "This file has no video or audio stream this tool can read.",
      "Check that it is a media file and that it plays in a media player.",
    );
  }
  return {
    container,
    durationSec,
    sizeBytes: file.size,
    video: v
      ? {
          codec: v[1] ?? "unknown",
          width: Number(v[2]),
          height: Number(v[3]),
          fps: v[4] ? Number(v[4]) : 30,
          language: videoLang,
        }
      : undefined,
    audio,
  };
}
