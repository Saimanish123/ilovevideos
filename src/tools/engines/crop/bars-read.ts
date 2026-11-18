/**
 * Reads the frames black-bar detection looks at (./bars): 24 frames spread from 5% to 95% of the
 * video, decoded at full display size (a bar's edge must be exact to the pixel) one at a time.
 * Runs on the page with mediabunny, so the crop frame can start on the answer; no network access.
 */
import { CanvasSink } from "mediabunny";
import { openInput } from "../mediabunny/shared";
import {
  type BarsResult,
  combineBars,
  type Edges,
  frameBars,
  sampleTimes,
  scaleBars,
} from "./bars";
import type { Size } from "./math";

export async function readBars(
  file: File,
  duration: number,
  source: Size,
  startSec = 0,
  onFrame?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<BarsResult | undefined> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return undefined;
    const first = await track.getFirstTimestamp();
    const times = sampleTimes(duration);
    const sink = new CanvasSink(track, { poolSize: 1 });
    const frames: { t: number; bars: Edges | null }[] = [];
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(
      times.map((t) => Math.max(first, t + startSec)),
    )) {
      if (signal?.aborted) return undefined;
      const t = times[i] ?? 0;
      i++;
      onFrame?.(i, times.length);
      if (!wrapped) continue;
      const canvas = wrapped.canvas as OffscreenCanvas | HTMLCanvasElement;
      const c2d = canvas.getContext("2d", { willReadFrequently: true }) as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;
      if (!c2d) continue;
      const { data } = c2d.getImageData(0, 0, canvas.width, canvas.height);
      const b = frameBars(data, canvas.width, canvas.height);
      frames.push({
        t,
        bars: b && scaleBars(b, { width: canvas.width, height: canvas.height }, source),
      });
    }
    return combineBars(frames, source);
  } catch {
    return undefined;
  } finally {
    input.dispose();
  }
}
