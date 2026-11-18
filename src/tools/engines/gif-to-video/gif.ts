/**
 * Reads the facts of a GIF from its bytes without decoding a single pixel: canvas size, frame count,
 * each frame's delay and the loop count. Pure (no browser APIs), so the page can inspect a GIF the
 * moment it is dropped and the worker can time frames the same way. Unit-tested.
 *
 * Spec: GIF89a (W3C/CompuServe 1990). Blocks: header, logical screen descriptor, optional global
 * colour table, then extensions (0x21) and image descriptors (0x2C) until the trailer (0x3B).
 */

export interface GifFacts {
  width: number;
  height: number;
  /** Delay of each frame in seconds, after the browser clamp (see `playedDelay`). */
  delays: number[];
  /** Sum of `delays`: how long one pass of the animation plays in a browser. */
  durationSec: number;
  /** NETSCAPE2.0 loop count: 0 = forever, n = play n extra times, undefined = play once. */
  loopCount?: number;
  /** True when any frame declares a transparent colour. */
  transparent: boolean;
}

/**
 * Browsers play a declared delay of 0 or 1 hundredths as 10 hundredths (100 ms): Chrome, Firefox and
 * Safari all clamp, because 1990s encoders wrote 0 meaning "as fast as possible". The video keeps the
 * timing people saw in the browser, not the literal header value.
 */
export const playedDelay = (hundredths: number) => (hundredths <= 1 ? 0.1 : hundredths / 100);

export class GifParseError extends Error {}

export function parseGif(bytes: Uint8Array): GifFacts {
  const at = (i: number) => {
    const b = bytes[i];
    if (b === undefined) throw new GifParseError("The GIF ends early.");
    return b;
  };
  const u16 = (i: number) => at(i) | (at(i + 1) << 8);
  const sig = String.fromCharCode(at(0), at(1), at(2), at(3), at(4), at(5));
  if (sig !== "GIF87a" && sig !== "GIF89a") throw new GifParseError("This is not a GIF file.");

  const width = u16(6);
  const height = u16(8);
  const packed = at(10);
  let p = 13;
  if (packed & 0x80) p += 3 * (1 << ((packed & 0x07) + 1));

  const delays: number[] = [];
  let pendingDelay = 0;
  let loopCount: number | undefined;
  let transparent = false;

  const skipSubBlocks = () => {
    for (;;) {
      const n = at(p);
      p += 1;
      if (n === 0) return;
      p += n;
    }
  };

  for (;;) {
    if (p >= bytes.length) break; // a missing trailer is common and harmless
    const block = at(p);
    p += 1;
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = at(p);
      p += 1;
      if (label === 0xf9 && at(p) >= 4) {
        // Graphic control extension: packed, delay (1/100 s), transparent index.
        const gce = at(p + 1);
        pendingDelay = u16(p + 2);
        if (gce & 0x01) transparent = true;
        p += 1 + at(p);
        skipSubBlocks();
      } else if (label === 0xff && at(p) === 11) {
        const id = String.fromCharCode(...bytes.subarray(p + 1, p + 12));
        p += 12;
        if ((id === "NETSCAPE2.0" || id === "ANIMEXTS1.0") && at(p) >= 3 && at(p + 1) === 1) {
          loopCount = u16(p + 2);
        }
        skipSubBlocks();
      } else {
        skipSubBlocks();
      }
      continue;
    }
    if (block === 0x2c) {
      const ipacked = at(p + 8);
      p += 9;
      if (ipacked & 0x80) p += 3 * (1 << ((ipacked & 0x07) + 1));
      p += 1; // LZW minimum code size
      skipSubBlocks();
      delays.push(playedDelay(pendingDelay));
      pendingDelay = 0;
      continue;
    }
    throw new GifParseError("The GIF has a block this tool does not recognise.");
  }

  if (width === 0 || height === 0 || delays.length === 0)
    throw new GifParseError("The GIF has no frames.");
  // One frame: a still image. Give it a nominal second so it becomes a playable clip.
  if (delays.length === 1) delays[0] = Math.max(delays[0] ?? 0, 1);
  const durationSec = delays.reduce((s, d) => s + d, 0);
  return { width, height, delays, durationSec, loopCount, transparent };
}
