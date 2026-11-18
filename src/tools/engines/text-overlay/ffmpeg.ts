/**
 * Text overlay for containers only ffmpeg.wasm reads (AVI, WMV, FLV, MPEG-TS, ...), on the page: the
 * page-drawn PNG goes in as a looped second input, and ffmpeg's fade and overlay filters place it
 * and fade it, as the watermark's ffmpeg path does. Written as MP4 with H.264; the sound is copied
 * when MP4 can hold it (AAC, MP3), otherwise encoded to AAC.
 */
import { baseName } from "@/lib/format";
import { encodedSize, withEvenCropOut } from "../crop/math";
import { geometryBitrate } from "../crop/plan";
import { totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { fadeOverlayFilter } from "../overlay/fade";
import { runFfmpeg } from "../overlay/ffmpeg";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { sizeWords } from "../video-filter/plan";
import { placeName } from "../watermark/options";
import { needText, type TextOverlayOptions, textCommand, textRange, textRect } from "./options";

export async function textWithFfmpeg(
  file: File,
  info: MediaInfo,
  o: TextOverlayOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  const v = info.video;
  if (!v)
    throw new EngineError(
      "unsupported-input",
      "This file has no video track to put text on.",
      "Choose a video file.",
    );
  const mark = needText(o);
  const block = { width: o.markWidth ?? 2, height: o.markHeight ?? 2 };
  const rect = textRect(o, block, v);
  const range = textRange(o, info.durationSec);
  // H.264 takes only even edges: an odd source loses its last column or row after the overlay.
  const filter = withEvenCropOut(
    v,
    fadeOverlayFilter(range, o.fade, rect.x, rect.y, info.durationSec),
  );
  const kbps = Math.round(geometryBitrate(encodedSize(v), v.fps, v) / 1000);
  const a = info.audio?.[0]?.codec;
  const copyAudio = !a || a === "aac" || a === "mp3";
  const inPath = `input.${file.name.split(".").pop()?.toLowerCase() ?? "bin"}`;
  const outputName = `${baseName(file.name)}-text.mp4`;
  const data = await runFfmpeg({
    files: [
      { path: inPath, data: file },
      { path: "text.png", data: new Uint8Array(await mark.arrayBuffer()) },
    ],
    inputArgs: ["-i", inPath, "-loop", "1", "-i", "text.png"],
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
    failureHint: "Convert the video to MP4 first, then add the text.",
    ctx,
  });
  const sound = !info.audio?.length ? "no sound" : copyAudio ? "sound copied" : "sound in AAC";
  return {
    blob: new Blob([data as BlobPart], { type: "video/mp4" }),
    filename: outputName,
    ffmpegCommand: textCommand(
      file.name,
      outputName,
      rect,
      o,
      info.durationSec,
      kbps,
      copyAudio,
      v,
    ),
    meta: `${sizeWords(v, encodedSize(v))} · text ${placeName(o)} · H.264, re-encoded · ${sound}`,
  };
}
