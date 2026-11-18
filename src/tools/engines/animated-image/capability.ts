/**
 * What this browser can make, asked of the browser itself (ADR-0054): the page asks before a run so
 * it can say so in the ready state, and the engine asks again before it starts. No decoder code.
 */
import { av1CodecString } from "./av1";
import type { AnimatedFormat } from "./math";

export type AnimatedPath = "canvas" | "vp8" | "bitrate" | "deflate";

/** Whether the canvas here writes WebP (Chromium and Firefox do; Safari falls back to PNG). */
let canvasWebp: Promise<boolean> | undefined;
function canvasEncodesWebp(): Promise<boolean> {
  canvasWebp ??= (async () => {
    try {
      const c = new OffscreenCanvas(2, 2);
      c.getContext("2d");
      return (await c.convertToBlob({ type: "image/webp" })).type === "image/webp";
    } catch {
      return false;
    }
  })();
  return canvasWebp;
}

async function encoderSupported(config: VideoEncoderConfig): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

/** How this browser makes this format, or undefined when it cannot. */
export async function animatedPath(
  format: AnimatedFormat,
  width: number,
  height: number,
  fps: number,
): Promise<AnimatedPath | undefined> {
  if (format === "apng") return typeof CompressionStream === "undefined" ? undefined : "deflate";
  if (format === "webp") {
    if (await canvasEncodesWebp()) return "canvas";
    const ok = await encoderSupported({
      codec: "vp8",
      width,
      height,
      bitrate: 1_000_000,
      framerate: fps,
    });
    return ok ? "vp8" : undefined;
  }
  // Variable bitrate, not "quantizer": Chromium 151's AV1 encoder moved only from 48.7 to 47.1 dB
  // luma PSNR across quantizers 26 to 63 (ADR-0093), so the bitrate is the real quality control.
  const codec = av1CodecString(width, height, fps);
  if (await encoderSupported({ codec, width, height, bitrate: 1_000_000, framerate: fps }))
    return "bitrate";
  return undefined;
}
