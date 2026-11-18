/**
 * Sound pieces for the time and layout engines, as planar float blocks: a stretch of a source read
 * to the exact number of frames its length asks for (padded with silence when the sound stops
 * early), ramped over 5 ms where it meets other sound so a join never clicks, and silence. Pure apart
 * from reading the source through ../sound/reader. Runs in the engine worker. No network access.
 */
import { JOIN_RAMP_SEC, readSound, type SoundSource } from "../sound/reader";

const BLOCK = 4096;

/** `frames` of silence in `channels` channels, in blocks. */
export function* silenceBlocks(frames: number, channels: number): Generator<Float32Array[]> {
  let left = Math.max(0, Math.round(frames));
  while (left > 0) {
    const n = Math.min(BLOCK, left);
    yield Array.from({ length: channels }, () => new Float32Array(n));
    left -= n;
  }
}

/** Frames at `rate` between two times, so consecutive pieces add up without drift. */
export const framesBetween = (start: number, end: number, rate: number) =>
  Math.max(0, Math.round(end * rate) - Math.round(start * rate));

/**
 * The source's sound from `start` to `end` (page seconds, from the file's start), exactly
 * `framesBetween(start, end, rate)` frames long: cut to that when the decoder gives more, padded
 * with silence when the sound ends before `end`. `rampIn` and `rampOut` fade the first and last 5 ms.
 */
export async function* exactSpan(
  src: SoundSource,
  start: number,
  end: number,
  /** Page time to source time: the file's start (`MediaInfo.startSec`) plus a Matroska delay. */
  shift: number,
  ramp: { in: boolean; out: boolean },
  signal: AbortSignal,
): AsyncGenerator<Float32Array[]> {
  const rate = src.sampleRate;
  const channels = src.channels;
  const want = framesBetween(start, end, rate);
  const rampFrames = Math.max(1, Math.round(JOIN_RAMP_SEC * rate));
  let done = 0;
  const shape = (planes: Float32Array[], offset: number) => {
    const n = planes[0]?.length ?? 0;
    for (let i = 0; i < n; i++) {
      const k = offset + i;
      let g = 1;
      if (ramp.in && k < rampFrames) g *= k / rampFrames;
      if (ramp.out && want - k <= rampFrames) g *= Math.max(0, want - k - 1) / rampFrames;
      if (g < 1) for (const p of planes) p[i] = (p[i] ?? 0) * g;
    }
  };
  if (want > 0 && end > start) {
    for await (const block of readSound(src, start + shift, end + shift, signal)) {
      if (signal.aborted) return;
      const n = Math.min(block.frames, want - done);
      if (n <= 0) break;
      const planes = block.planes.map((p) => (n < p.length ? p.subarray(0, n) : p));
      shape(planes, done);
      yield planes;
      done += n;
    }
  }
  for (const s of silenceBlocks(want - done, channels)) yield s;
}

/**
 * Sums `b` into `a` sample by sample with gains, in place on a fresh array (lengths may differ; the
 * longer wins, the shorter counts as silence). Both are planar with the same channel count.
 */
export function mixInto(
  a: Float32Array[],
  ga: number,
  b: Float32Array[],
  gb: number,
): Float32Array[] {
  const n = Math.max(a[0]?.length ?? 0, b[0]?.length ?? 0);
  const channels = Math.max(a.length, b.length);
  return Array.from({ length: channels }, (_, c) => {
    const out = new Float32Array(n);
    const pa = a[c] ?? a[0];
    const pb = b[c] ?? b[0];
    for (let i = 0; i < n; i++) out[i] = (pa?.[i] ?? 0) * ga + (pb?.[i] ?? 0) * gb;
    return out;
  });
}
