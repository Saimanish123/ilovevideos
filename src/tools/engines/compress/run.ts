/**
 * Compress's plan for one file, shared by the native engine and its ffmpeg.wasm runner (ADR-0147):
 * a preset's bitrate, or a size target planned from the duration and corrected by a second pass
 * when the first comes out over. `encode` writes one pass with the browser's encoder or ffmpeg.
 */
import { formatBytes, formatDimensions, formatDuration } from "@/lib/format";
import { EngineError } from "../errors";
import type { EngineContext, EngineResult, MediaInput } from "../types";
import type { CompressOptions } from "./index";
import {
  AUDIO_BITRATE,
  type HeightCap,
  MB,
  outputDimensions,
  planTarget,
  retryVideoBitrate,
  videoBitrateForPreset,
} from "./math";

export interface Pass {
  videoBitrate: number;
  audioBitrate: number;
  height: HeightCap;
}

/** Writes one pass; `detailPrefix` goes before each progress detail ("Second pass: "). */
export type EncodePass = (
  input: MediaInput,
  pass: Pass,
  ctx: EngineContext,
  detailPrefix?: string,
) => Promise<EngineResult>;

export async function runCompress(
  input: MediaInput,
  options: CompressOptions,
  ctx: EngineContext,
  encode: EncodePass,
): Promise<EngineResult> {
  const info = input.info;
  const v = info?.video;
  const src = { width: v?.width ?? 1920, height: v?.height ?? 1080, fps: v?.fps ?? 30 };
  const duration = info?.durationSec ?? 0;
  const hasAudio = (info?.audio?.length ?? 1) > 0;

  if (options.preset !== "target") {
    const height = options.maxHeight === "auto" ? "original" : options.maxHeight;
    const dims = outputDimensions(src.width, src.height, height);
    const videoBitrate = videoBitrateForPreset(options.preset, dims.width, dims.height, src.fps);
    return encode(input, { videoBitrate, audioBitrate: AUDIO_BITRATE, height }, ctx);
  }

  const targetBytes = options.targetMb * MB;
  const plan = planTarget(
    targetBytes,
    { ...src, durationSec: duration, hasAudio },
    options.maxHeight,
  );
  if (!plan.ok) {
    throw plan.reason === "no-duration"
      ? new EngineError(
          "unsupported-input",
          "This file does not say how long it is, so a size target cannot be planned.",
          "Use a quality preset on the compress page instead.",
        )
      : new EngineError(
          "unsupported-input",
          `At ${formatDuration(duration)} this video cannot fit in ${options.targetMb} MB without falling apart; the smallest usable result is about ${formatBytes(plan.minBytes)}.`,
          `Trim it to under ${formatDuration(plan.maxDurationSec)} first, or choose a larger size.`,
        );
  }

  const first: Pass = {
    videoBitrate: plan.videoBitrate,
    audioBitrate: plan.audioBitrate,
    height: plan.height,
  };
  let result = await encode(input, first, ctx);
  let pass = first;
  // Encoders do not hit a bitrate exactly, least of all on short or very static clips. Measure the
  // real file and, if it is over, encode once more with the bitrate corrected by the overshoot.
  if (result.blob.size > targetBytes) {
    const over = result.blob.size;
    pass = {
      ...first,
      videoBitrate: retryVideoBitrate(
        first.videoBitrate,
        first.audioBitrate,
        duration,
        targetBytes,
        over,
      ),
    };
    ctx.onProgress({
      phase: "processing",
      ratio: 0,
      detail: `First pass came to ${formatBytes(over)}, over ${options.targetMb} MB. Encoding again at a lower bitrate`,
    });
    result = await encode(input, pass, ctx, "Second pass: ");
  }
  const dims = outputDimensions(src.width, src.height, pass.height);
  // The verdict (fits, or by how much it missed) is written by the stage from the real size.
  const passes = pass === first ? "" : " · second pass";
  return { ...result, meta: `${formatDimensions(dims.width, dims.height)}${passes}` };
}
