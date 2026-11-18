/**
 * Measures how well this video compresses as a GIF: one frame, at the output size, encoded exactly
 * as the fast path encodes every frame (gifenc, 256-colour palette, no dither). The result feeds
 * `estimateGifBytes`, so the size shown before a run follows the content (a flat screen recording
 * and a noisy sky differ tenfold) instead of one average. Pure apart from the encoder; no DOM.
 */
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { MAX_COLORS } from "./math";

/** Bytes per pixel of one RGBA frame as a GIF frame, palette and headers excluded. */
export function sampleGifBytesPerPixel(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const pixels = width * height;
  if (!(pixels > 0) || rgba.length < pixels * 4) return 0;
  const data = new Uint8Array(rgba.buffer, rgba.byteOffset, pixels * 4).slice();
  const palette = quantize(data, MAX_COLORS, { format: "rgb565" });
  const index = applyPalette(data, palette, "rgb565");
  const gif = GIFEncoder({ initialCapacity: pixels });
  gif.writeFrame(index, width, height, { palette });
  gif.finish();
  // Header, logical screen, colour table (padded to a power of two), frame control, image descriptor
  // and trailer: what `estimateGifBytes` counts separately per frame.
  const table = 3 * 2 ** Math.max(1, Math.ceil(Math.log2(palette.length)));
  const overhead = 6 + 7 + table + 8 + 10 + 1;
  return Math.max(0, gif.bytes().length - overhead) / pixels;
}
