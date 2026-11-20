/**
 * Compress on ffmpeg.wasm, for browsers that cannot encode H.264 or AAC themselves (no WebCodecs,
 * as in Firefox for Android, or no encoder for the codec): the same plan as the native engine
 * (./run: presets, size targets and the second pass), written by libx264 and AAC on the page
 * (ADR-0147). Slower than the native path; the measured speed is in ADR-0147.
 */
import { baseName } from "@/lib/format";
import { execFfmpeg } from "../ffmpeg";
import type { EngineContext, EngineResult, MediaInfo, MediaInput } from "../types";
import type { CompressOptions } from "./index";
import { AUDIO_BITRATE, outputDimensions } from "./math";
import { type Pass, runCompress } from "./run";

/** The output arguments for one pass, also the command shown. Pure. */
export function compressArgs(info: MediaInfo | undefined, pass: Pass): string[] {
  const v = info?.video;
  const src = { width: v?.width ?? 1920, height: v?.height ?? 1080 };
  const dims = outputDimensions(src.width, src.height, pass.height);
  // libx264 takes even edges only; outputDimensions rounds to even, so scale when they differ.
  const scale =
    dims.width !== src.width || dims.height !== src.height
      ? ["-vf", `scale=${dims.width}:${dims.height}`]
      : [];
  const sound = (info?.audio?.length ?? 0) > 0;
  return [
    ...scale,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    `${Math.round(pass.videoBitrate / 1000)}k`,
    "-pix_fmt",
    "yuv420p",
    ...(sound
      ? ["-c:a", "aac", "-b:a", `${Math.round((pass.audioBitrate || AUDIO_BITRATE) / 1000)}k`]
      : ["-an"]),
    "-movflags",
    "+faststart",
  ];
}

async function encodePass(
  input: MediaInput,
  pass: Pass,
  ctx: EngineContext,
  detailPrefix = "",
): Promise<EngineResult> {
  const onProgress: EngineContext["onProgress"] = detailPrefix
    ? (p) => ctx.onProgress({ ...p, detail: p.detail ? `${detailPrefix}${p.detail}` : p.detail })
    : ctx.onProgress;
  return execFfmpeg({
    file: input.file,
    ctx: { ...ctx, onProgress },
    extension: "mp4",
    mime: "video/mp4",
    filename: `${baseName(input.file.name)}-compressed.mp4`,
    outputArgs: compressArgs(input.info, pass),
    progressLabel: "compressed",
    container: "MP4",
    failureHint: "Try a smaller size or a shorter video.",
  });
}

export function compressWithFfmpeg(
  file: File,
  info: MediaInfo,
  options: CompressOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  return runCompress({ file, info }, options, ctx, encodePass);
}
