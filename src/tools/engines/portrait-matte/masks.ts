/**
 * The person mask for each frame the encoder is about to draw, in the engine worker. A second,
 * small decode of the same track runs one frame ahead of the composite, so each frame's mask can be
 * steadied with the previous steadied mask and the next raw one (./smooth). Where that decode cannot
 * run, the composite's own frame is measured and the steadying looks back only. No network access.
 */
import { type InputVideoTrack, type VideoSample, VideoSampleSink } from "mediabunny";
import { EngineError } from "../errors";
import type { Segmenter } from "./segmenter";
import { steady } from "./smooth";

type Drawable = {
  draw(c: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
};

/** Draws a frame (a VideoSample, rotation applied) at the model's size; the same scaling everywhere. */
export function modelInput(
  c2d: OffscreenCanvasRenderingContext2D,
  frame: Drawable,
  size: { width: number; height: number },
) {
  c2d.imageSmoothingEnabled = true;
  c2d.imageSmoothingQuality = "high";
  frame.draw(c2d, 0, 0, size.width, size.height);
}

/** Frames sent to the finder ahead of the one being drawn, so it works while the encoder does. */
const IN_FLIGHT = 3;

export class MaskStream {
  private readonly c2d: OffscreenCanvasRenderingContext2D;
  private ahead: AsyncGenerator<VideoSample, void, unknown> | undefined;
  private queue: { t: number; mask: Promise<Float32Array> }[] = [];
  private ended = false;
  private previous: Float32Array | undefined;

  constructor(
    private readonly segmenter: Segmenter,
    track: InputVideoTrack | undefined,
    private readonly opts: { steady: boolean; lookahead: boolean },
  ) {
    const canvas = new OffscreenCanvas(segmenter.width, segmenter.height);
    const c2d = canvas.getContext("2d");
    if (!c2d)
      throw new EngineError(
        "unsupported-output",
        "This browser cannot find the person in a video.",
        "Try a current Chrome or Edge.",
      );
    this.c2d = c2d;
    if (track && opts.lookahead && opts.steady) this.ahead = new VideoSampleSink(track).samples();
  }

  /** Sends one frame to the finder; the picture is handed over at once, the mask comes later. */
  private request(frame: Drawable): Promise<Float32Array> {
    modelInput(this.c2d, frame, this.segmenter);
    const mask = this.segmenter.segment(this.c2d.canvas as OffscreenCanvas);
    mask.catch(() => undefined);
    return mask;
  }

  /** Reads ahead until `IN_FLIGHT` frames later than `t` are sent, or the track ends. */
  private async fill(t: number, frameSec: number) {
    while (this.ahead && !this.ended) {
      const last = this.queue[this.queue.length - 1];
      if (last && last.t > t + (IN_FLIGHT - 0.5) * frameSec) return;
      const next = await this.ahead.next();
      if (next.done) {
        this.ended = true;
        return;
      }
      const s = next.value;
      try {
        this.queue.push({ t: s.timestamp, mask: this.request(s) });
      } finally {
        s.close();
      }
    }
  }

  /**
   * The steadied mask for the composite's frame at source time `t`. `frame` is that frame, measured
   * directly when the read-ahead has nothing within half a frame of it.
   */
  async maskAt(t: number, frame: Drawable, frameSec: number): Promise<Float32Array> {
    let current: Float32Array | undefined;
    let next: Float32Array | undefined;
    if (this.ahead) {
      try {
        await this.fill(t, frameSec);
        while (this.queue.length > 1 && (this.queue[1]?.t ?? Infinity) <= t + frameSec / 2)
          this.queue.shift();
        const head = this.queue[0];
        if (head && Math.abs(head.t - t) <= frameSec / 2) {
          current = new Float32Array(await head.mask);
          const after = this.queue[1];
          next = after ? await after.mask : undefined;
        }
      } catch {
        // The second decode failed (a decoder limit): measure the composite's frames from here on.
        await this.ahead?.return(undefined).catch(() => undefined);
        this.ahead = undefined;
        this.queue = [];
        current = undefined;
        next = undefined;
      }
    }
    current ??= await this.request(frame);
    if (this.opts.steady) steady(current, this.previous, this.opts.lookahead ? next : undefined);
    this.previous = current;
    return current;
  }

  async dispose() {
    await this.ahead?.return(undefined).catch(() => undefined);
    this.ahead = undefined;
    this.queue = [];
  }
}
