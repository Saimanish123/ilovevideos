/**
 * Planning for reversed playback. Pure; unit-tested; safe on the page.
 *
 * A decoder only runs forwards from a key frame, so a reversed video is decoded one window at a time
 * from the end: each group of pictures (key frame to key frame) is decoded, its frames are held as
 * raw pixels, and they are encoded last first. A group longer than the memory budget is split into
 * windows that are each decoded from the group's key frame again, so memory stays bounded at the
 * cost of extra decoding. The sound is decoded whole and reversed sample by sample, so it has its
 * own, stricter limit.
 */

/** Raw frames held at once (bytes). 4:2:0 pixels take 1.5 bytes each. */
export const FRAME_BUDGET = 384_000_000;
/** Decoded sound held at once (bytes): 32-bit float samples, every channel. */
export const SOUND_BUDGET = 400_000_000;

export const frameBytes = (width: number, height: number) => Math.ceil(width * height * 1.5);

/**
 * Bytes a picture re-encode writes: the video bitrate it asks for (the encoder is told the real
 * frame rate, so it keeps to it: 41.2 Mbps written for 41.3 asked on 4K60) plus the sound.
 */
export const encodedBytes = (videoBitrate: number, durationSec: number, soundBitrate = 0) =>
  Math.round(((videoBitrate + soundBitrate) * Math.max(0, durationSec)) / 8);

/** Frames in one decode window: at least 8, at most 300. */
export const windowFrames = (width: number, height: number, budget = FRAME_BUDGET) =>
  Math.max(8, Math.min(300, Math.floor(budget / Math.max(1, frameBytes(width, height)))));

/** Longest sound this tool reverses (seconds), from its sample rate and channels. */
export const maxReversedSound = (sampleRate: number, channels: number) =>
  Math.floor(SOUND_BUDGET / Math.max(1, sampleRate * Math.max(1, channels) * 4));

export interface DecodeWindow {
  /** Presentation time of the window's first and last frame (inclusive). */
  first: number;
  last: number;
  count: number;
}

/**
 * Decode windows in output order (the video's end first). `frames` are presentation times, `keys`
 * the key frame times; both need not be sorted. Frames before the first key frame belong to the
 * first group.
 */
export function reverseWindows(
  frames: number[],
  keys: number[],
  perWindow: number,
): DecodeWindow[] {
  const f = [...frames].sort((a, b) => a - b);
  const k = [...keys].sort((a, b) => a - b);
  const groups: number[][] = [];
  let g = 0;
  let current: number[] = [];
  for (const t of f) {
    while (g + 1 < k.length && t >= (k[g + 1] ?? Number.POSITIVE_INFINITY) - 1e-6) {
      if (current.length) groups.push(current);
      current = [];
      g++;
    }
    current.push(t);
  }
  if (current.length) groups.push(current);
  const out: DecodeWindow[] = [];
  const n = Math.max(1, perWindow);
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i] ?? [];
    for (let end = group.length; end > 0; end -= n) {
      const start = Math.max(0, end - n);
      out.push({
        first: group[start] ?? 0,
        last: group[end - 1] ?? 0,
        count: end - start,
      });
    }
  }
  return out;
}

/**
 * How many times each frame is decoded on average: 1 when every group fits one window. A group of G
 * frames in windows of W decodes G, then G − W, then G − 2W... frames (each window from the key frame).
 */
export function decodeCost(frames: number[], keys: number[], perWindow: number): number {
  if (frames.length === 0) return 1;
  const f = [...frames].sort((a, b) => a - b);
  const k = [...keys].sort((a, b) => a - b);
  const n = Math.max(1, perWindow);
  let decoded = 0;
  let g = 0;
  let size = 0;
  const close = () => {
    for (let end = size; end > 0; end -= n) decoded += end;
    size = 0;
  };
  for (const t of f) {
    while (g + 1 < k.length && t >= (k[g + 1] ?? Number.POSITIVE_INFINITY) - 1e-6) {
      close();
      g++;
    }
    size++;
  }
  close();
  return decoded / f.length;
}
