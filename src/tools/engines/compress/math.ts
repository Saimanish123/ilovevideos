/** Pure option math for the compress engine. Unit-tested; no browser APIs. */

export type CompressPreset = "smaller" | "balanced" | "best" | "target";
export type HeightCap = "original" | 2160 | 1440 | 1080 | 720 | 480 | 360;
/** "auto" lets target-size mode pick the resolution the bitrate can carry. */
export type HeightChoice = HeightCap | "auto";

export const AUDIO_BITRATE = 128_000;
const MIN_VIDEO_BITRATE = 250_000;
const MAX_VIDEO_BITRATE = 40_000_000;
/** Encoders overshoot a little; leave margin so a hard limit like 25 MB is not missed. */
const TARGET_MARGIN = 0.94;
/**
 * Target sizes are decimal megabytes (1 MB = 1,000,000 bytes). Platforms publish limits as "25 MB"
 * without saying which megabyte they mean; the decimal reading is the smaller one, so a file under it
 * is under the limit either way.
 */
export const MB = 1_000_000;
/** Lowest video bitrate target-size mode will plan; below this even 360p falls apart. */
export const MIN_TARGET_VIDEO_BITRATE = 200_000;
/** Lowest AAC bitrate target-size mode will plan when the budget is tight (fine for speech). */
export const MIN_TARGET_AUDIO_BITRATE = 64_000;
/** Bits per pixel per frame below which a resolution step looks worse than the next one down. */
const AUTO_BPP_FLOOR = 0.04;
const autoHeights = [2160, 1440, 1080, 720, 480, 360] as const;

/** Bits per pixel per frame for H.264 at each preset. Tuned for hardware encoders. */
const BPP: Record<Exclude<CompressPreset, "target">, number> = {
  smaller: 0.045,
  balanced: 0.075,
  best: 0.12,
};

export function outputDimensions(
  width: number,
  height: number,
  cap: HeightCap,
  { upscale = false }: { upscale?: boolean } = {},
): { width: number; height: number } {
  if (cap === "original" || (height <= cap && !upscale) || height === cap) {
    return { width: even(width), height: even(height) };
  }
  const scale = cap / height;
  return { width: even(width * scale), height: even(cap) };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function videoBitrateForPreset(
  preset: Exclude<CompressPreset, "target">,
  width: number,
  height: number,
  fps: number,
): number {
  return clamp(BPP[preset] * width * height * safeFps(fps));
}

export function videoBitrateForTarget(
  targetBytes: number,
  durationSec: number,
  audioBitrate = AUDIO_BITRATE,
): number {
  if (durationSec <= 0) return MIN_VIDEO_BITRATE;
  const totalBits = targetBytes * 8 * TARGET_MARGIN;
  return clamp(totalBits / durationSec - audioBitrate);
}

export function estimateBytes(
  videoBitrate: number,
  durationSec: number,
  audioBitrate = AUDIO_BITRATE,
): number {
  return Math.round(((videoBitrate + audioBitrate) * durationSec) / 8);
}

export interface TargetSource {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  hasAudio: boolean;
}

export type TargetPlan =
  | {
      ok: true;
      videoBitrate: number;
      audioBitrate: number;
      /** The cap to encode at; "original" keeps the source resolution. */
      height: HeightCap;
      width: number;
      outHeight: number;
      estimatedBytes: number;
    }
  | {
      ok: false;
      reason: "too-long" | "no-duration";
      /** Smallest file this engine will make for this duration (at the quality floor). */
      minBytes: number;
      /** Longest clip that fits the target at the quality floor, in seconds. */
      maxDurationSec: number;
    };

/**
 * Plans a target-size encode: splits the byte budget between audio and video (audio steps down from
 * 128 to 96 to 64 kbps as the budget shrinks), picks the resolution the video bitrate can carry when
 * `cap` is "auto", and refuses honestly when even the quality floor would not fit.
 */
export function planTarget(targetBytes: number, src: TargetSource, cap: HeightChoice): TargetPlan {
  const floorTotal = MIN_TARGET_VIDEO_BITRATE + (src.hasAudio ? MIN_TARGET_AUDIO_BITRATE : 0);
  const budgetBits = targetBytes * 8 * TARGET_MARGIN;
  const maxDurationSec = budgetBits / floorTotal;
  if (!(src.durationSec > 0)) {
    return { ok: false, reason: "no-duration", minBytes: 0, maxDurationSec };
  }
  const total = budgetBits / src.durationSec;
  const audioBitrate = !src.hasAudio
    ? 0
    : total >= 1_000_000
      ? AUDIO_BITRATE
      : total >= 500_000
        ? 96_000
        : MIN_TARGET_AUDIO_BITRATE;
  const videoBitrate = Math.round(Math.min(MAX_VIDEO_BITRATE, total - audioBitrate));
  if (videoBitrate < MIN_TARGET_VIDEO_BITRATE) {
    return {
      ok: false,
      reason: "too-long",
      minBytes: Math.ceil((floorTotal * src.durationSec) / 8 / TARGET_MARGIN),
      maxDurationSec,
    };
  }
  const height = cap === "auto" ? autoHeight(videoBitrate, src) : cap;
  const dims = outputDimensions(src.width, src.height, height);
  return {
    ok: true,
    videoBitrate,
    audioBitrate,
    height,
    width: dims.width,
    outHeight: dims.height,
    estimatedBytes: estimateBytes(videoBitrate, src.durationSec, audioBitrate),
  };
}

/** Largest standard height at or below the source that the bitrate can fill without smearing. */
export function autoHeight(
  videoBitrate: number,
  src: Pick<TargetSource, "width" | "height" | "fps">,
): HeightCap {
  const fps = Math.min(safeFps(src.fps), 30);
  const fits = (h: HeightCap) => {
    const d = outputDimensions(src.width, src.height, h);
    return videoBitrate / (d.width * d.height * fps) >= AUTO_BPP_FLOOR;
  };
  if (fits("original")) return "original";
  for (const h of autoHeights) {
    if (h >= src.height) continue;
    if (fits(h)) return h;
  }
  return src.height > 360 ? 360 : "original";
}

/**
 * Second pass: the first encode came out at `actualBytes`, over `targetBytes`. Scale the video bitrate
 * by how far the encoder overshot so the next attempt lands at 95% of the target. Audio is predictable
 * (constant bitrate), so only the video share is corrected.
 */
export function retryVideoBitrate(
  previousVideoBitrate: number,
  audioBitrate: number,
  durationSec: number,
  targetBytes: number,
  actualBytes: number,
): number {
  const audioBytes = (audioBitrate * durationSec) / 8;
  const want = targetBytes * 0.95 - audioBytes;
  const got = Math.max(1, actualBytes - audioBytes);
  return Math.max(MIN_TARGET_VIDEO_BITRATE, Math.round(previousVideoBitrate * (want / got)));
}

const safeFps = (fps: number) => (fps > 0 && Number.isFinite(fps) ? Math.min(fps, 120) : 30);

const clamp = (n: number) =>
  Math.round(Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, n)));
