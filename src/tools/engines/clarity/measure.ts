/**
 * The grain of a video: `estimateNoise` (./options) on five frames spread through it, at full size
 * (grain shrinks when a picture is scaled down), the median taken. Runs on the page, so the preview
 * and the summary use the figure the worker will, and in the worker when a batch file arrives
 * without one. Decodes with mediabunny; no network access.
 */
import { CanvasSink } from "mediabunny";
import { openInput } from "../mediabunny/shared";
import { estimateNoise, medianNoise } from "./options";

/** Times (s, page time) of the frames measured: 10, 30, 50, 70 and 90% through. */
export const noiseTimes = (duration: number) =>
  [0.1, 0.3, 0.5, 0.7, 0.9].map((k) => Math.max(0, duration * k));

export async function measureNoise(
  file: File,
  duration: number,
  startSec = 0,
  signal?: AbortSignal,
): Promise<number | undefined> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return undefined;
    const first = await track.getFirstTimestamp();
    const sink = new CanvasSink(track, { poolSize: 1 });
    const values: number[] = [];
    for await (const wrapped of sink.canvasesAtTimestamps(
      noiseTimes(duration).map((t) => Math.max(first, t + startSec)),
    )) {
      if (signal?.aborted) return undefined;
      if (!wrapped) continue;
      const canvas = wrapped.canvas as OffscreenCanvas | HTMLCanvasElement;
      const c2d = canvas.getContext("2d", { willReadFrequently: true }) as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;
      if (!c2d) continue;
      const w = Math.min(canvas.width, 512);
      const h = Math.min(canvas.height, 512);
      const x0 = Math.floor((canvas.width - w) / 2);
      const y0 = Math.floor((canvas.height - h) / 2);
      const { data } = c2d.getImageData(x0, y0, w, h);
      values.push(estimateNoise(data, w, h));
    }
    return values.length ? Math.round(medianNoise(values) * 10) / 10 : undefined;
  } catch {
    return undefined;
  } finally {
    input.dispose();
  }
}
