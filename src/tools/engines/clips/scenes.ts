/**
 * Scene changes for the clips proposal (./plan). Only key frames are decoded: an encoder stores one
 * whole at most scene changes, and decoding one needs no other frame, so an hour of video is read
 * in seconds. Each key frame is shrunk to 32×18 grey; a scene change is a key frame whose mean
 * difference to the previous one is at least 28 of 255 and three times the video's median change
 * (so a busy, handheld video does not count every key frame). Runs on the page or in a worker
 * (OffscreenCanvas and WebCodecs in both). No network access.
 */
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, VideoSampleSink } from "mediabunny";

export interface SceneAnalysis {
  /** Key frame times (page seconds) where the picture changes completely. */
  cuts: number[];
  /** Key frames compared. */
  keyframes: number;
  /** Median seconds between key frames: a scene change lies up to this far before its time. */
  gop: number;
}

const THUMB_W = 32;
const THUMB_H = 18;
/** More key frames than this are thinned evenly (about 2 hours at one every 2 s). */
const MAX_KEYS = 4000;
/** Smallest mean grey difference (0–255) that counts as a scene change. */
export const SCENE_MIN_DIFF = 28;

const none: SceneAnalysis = { cuts: [], keyframes: 0, gop: 0 };

/** The scene changes in mean differences between consecutive key frames (pure, unit-tested). */
export function sceneCutsFrom(diffs: readonly { t: number; d: number }[]): number[] {
  const sorted = diffs.map((x) => x.d).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const cut = Math.max(SCENE_MIN_DIFF, median * 3);
  return diffs.filter((x) => x.d >= cut).map((x) => x.t);
}

export async function findSceneCuts(
  file: Blob,
  /** Source time of the file's start (MediaInfo.startSec): results are page times. */
  t0: number,
  signal: AbortSignal,
  onProgress?: (ratio: number, detail: string) => void,
): Promise<SceneAnalysis> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const stop = () => {
    if (signal.aborted) throw new DOMException("Cancelled.", "AbortError");
  };
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return none;
    let keys: number[] = [];
    for await (const p of new EncodedPacketSink(track).packets(undefined, undefined, {
      metadataOnly: true,
    })) {
      stop();
      if (p.type === "key") keys.push(p.timestamp);
    }
    keys.sort((a, b) => a - b);
    if (keys.length > MAX_KEYS) {
      const step = keys.length / MAX_KEYS;
      keys = Array.from({ length: MAX_KEYS }, (_, i) => keys[Math.floor(i * step)] as number);
    }
    const canvas = new OffscreenCanvas(THUMB_W, THUMB_H);
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return none;
    const diffs: { t: number; d: number }[] = [];
    let prev: Float32Array | null = null;
    let i = 0;
    for await (const s of new VideoSampleSink(track).samplesAtTimestamps(keys)) {
      const t = (keys[i] ?? 0) - t0;
      i++;
      if (signal.aborted) {
        s?.close();
        stop();
      }
      if (!s) continue;
      s.draw(g, 0, 0, THUMB_W, THUMB_H);
      s.close();
      const px = g.getImageData(0, 0, THUMB_W, THUMB_H).data;
      const luma = new Float32Array(THUMB_W * THUMB_H);
      for (let k = 0; k < luma.length; k++)
        luma[k] =
          0.299 * (px[k * 4] ?? 0) + 0.587 * (px[k * 4 + 1] ?? 0) + 0.114 * (px[k * 4 + 2] ?? 0);
      if (prev) {
        let sum = 0;
        for (let k = 0; k < luma.length; k++) sum += Math.abs((luma[k] ?? 0) - (prev[k] ?? 0));
        diffs.push({ t, d: sum / luma.length });
      }
      prev = luma;
      if (i % 20 === 0)
        onProgress?.(
          i / keys.length,
          `Looking for scene changes · ${i} of ${keys.length} key frames`,
        );
    }
    const steps = keys
      .slice(1)
      .map((k, j) => k - (keys[j] ?? k))
      .sort((a, b) => a - b);
    return {
      cuts: sceneCutsFrom(diffs),
      keyframes: keys.length,
      gop: steps[Math.floor(steps.length / 2)] ?? 0,
    };
  } finally {
    input.dispose();
  }
}
