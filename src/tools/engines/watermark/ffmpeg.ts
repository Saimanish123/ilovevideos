/**
 * Watermark for containers only ffmpeg.wasm reads (AVI, WMV, FLV, MPEG-TS, ...), on the page: the
 * page-drawn PNG goes in as a second input and ffmpeg's overlay filter places it. Written as MP4
 * with H.264; the sound is copied when MP4 can hold it (AAC, MP3), otherwise encoded to AAC.
 */
import { baseName } from "@/lib/format";
import { encodedSize, withEvenCropOut } from "../crop/math";
import { geometryBitrate } from "../crop/plan";
import { totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { runFfmpeg } from "../overlay/ffmpeg";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { sizeWords } from "../video-filter/plan";
import {
  effectiveRange,
  markRect,
  needMark,
  overlayFilter,
  placeName,
  type WatermarkOptions,
  watermarkCommand,
} from "./options";

export async function watermarkWithFfmpeg(
  file: File,
  info: MediaInfo,
  o: WatermarkOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  const v = info.video;
  if (!v)
    throw new EngineError(
      "unsupported-input",
      "This file has no video track to put a watermark on.",
      "Choose a video file.",
    );
  const mark = needMark(o);
  const rect = markRect(o, v);
  const range = effectiveRange(o, info.durationSec);
  // H.264 takes only even edges: an odd source loses its last column or row after the overlay.
  const filter = withEvenCropOut(v, overlayFilter(rect, o.opacity, range));
  const kbps = Math.round(geometryBitrate(encodedSize(v), v.fps, v) / 1000);
  const a = info.audio?.[0]?.codec;
  const copyAudio = !a || a === "aac" || a === "mp3";
  const inPath = `input.${file.name.split(".").pop()?.toLowerCase() ?? "bin"}`;
  const outputName = `${baseName(file.name)}-watermarked.mp4`;
  const data = await runFfmpeg({
    files: [
      { path: inPath, data: file },
      { path: "mark.png", data: new Uint8Array(await mark.arrayBuffer()) },
    ],
    inputArgs: ["-i", inPath, "-i", "mark.png"],
    outputArgs: [
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      `${kbps}k`,
      "-pix_fmt",
      "yuv420p",
      ...(info.audio?.length
        ? copyAudio
          ? ["-c:a", "copy"]
          : ["-c:a", "aac", "-b:a", "160k"]
        : []),
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
    ],
    outPath: "output.mp4",
    frames: totalFrames(info.durationSec, v.fps),
    readingLabel: "Reading the video",
    container: "MP4",
    failureHint: "Convert the video to MP4 first, then add the watermark.",
    ctx,
  });
  const sound = !info.audio?.length ? "no sound" : copyAudio ? "sound copied" : "sound in AAC";
  return {
    blob: new Blob([data as BlobPart], { type: "video/mp4" }),
    filename: outputName,
    ffmpegCommand: watermarkCommand(
      file.name,
      o.kind === "text" ? "watermark.png" : (o.image?.name ?? "logo.png"),
      outputName,
      filter,
      kbps,
      copyAudio,
    ),
    meta: `${sizeWords(v, encodedSize(v))} · ${o.kind === "text" ? "text" : "logo"} ${placeName(o)} · H.264, re-encoded · ${sound}`,
  };
}
