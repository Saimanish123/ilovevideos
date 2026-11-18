/**
 * Reading a source picture for the time and layout engines: the primary video track, opened so its
 * frames decode with the colour space the source means (../video-filter/frame-prep), with the facts
 * a frame producer needs, and a canvas that turns any frame into an output frame of the even size
 * H.264 takes. Runs in the engine worker. No network access.
 */
import {
  EncodedPacketSink,
  type Input,
  type InputVideoTrack,
  type Rotation,
  VideoSample,
} from "mediabunny";
import { encodedSize } from "../crop/math";
import { EngineError } from "../errors";
import { framePlanForTrack } from "../video-filter/frame-prep";

export interface Picture {
  track: InputVideoTrack;
  /** The picture as shown (rotation applied, square pixels). */
  display: { width: number; height: number };
  /** `display` less an odd edge (../crop/math `encodedSize`). */
  even: { width: number; height: number };
  rotation: Rotation;
  /**
   * Frames can go to the encoder as decoded (even, square pixels; the rotation is written into the
   * track): no extra colour conversion and no draw.
   */
  passThrough: boolean;
}

/** The input's picture, ready to decode; refuses a file without one or one this browser cannot decode. */
export async function openPicture(input: Input, what = "This file"): Promise<Picture> {
  const track = await input.getPrimaryVideoTrack();
  if (!track)
    throw new EngineError("unsupported-input", `${what} has no picture.`, "Choose a video file.");
  if (!(await track.canDecode()))
    throw new EngineError(
      "unsupported-input",
      `This browser cannot decode the picture of ${what === "This file" ? "this file" : what.toLowerCase()} (${track.codec ?? "unknown codec"}).`,
      "Convert it to MP4 with the video converter first, or try desktop Chrome.",
    );
  // Sets the decoder's colour space for an untagged source (ADR-0060) before any sink is made.
  const plan = await framePlanForTrack(track, "avc");
  const rotation = await track.getRotation();
  const sw = await track.getSquarePixelWidth();
  const sh = await track.getSquarePixelHeight();
  const pa = await track.getPixelAspectRatio().catch(() => ({ num: 1, den: 1 }));
  const display = plan.source;
  const even = encodedSize(display);
  return {
    track,
    display,
    even,
    rotation,
    passThrough:
      sw % 2 === 0 &&
      sh % 2 === 0 &&
      pa.num === pa.den &&
      !plan.retag &&
      !plan.misread &&
      display.width === even.width &&
      display.height === even.height,
  };
}

/** Presentation times of every frame (packet metadata only, no decoding), from the file's start. */
export async function frameTimes(track: InputVideoTrack, t0: number): Promise<number[]> {
  const times: number[] = [];
  for await (const p of new EncodedPacketSink(track).packets(undefined, undefined, {
    metadataOnly: true,
  }))
    times.push(p.timestamp - t0);
  times.sort((a, b) => a - b);
  return times;
}

/** Frames per second from frame times (median step, robust to a variable rate's outliers). */
export function rateOf(times: readonly number[], fallback = 30): number {
  if (times.length < 2) return fallback;
  const steps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = (times[i] ?? 0) - (times[i - 1] ?? 0);
    if (d > 1e-6) steps.push(d);
  }
  if (steps.length === 0) return fallback;
  steps.sort((a, b) => a - b);
  const median = steps[Math.floor(steps.length / 2)] ?? 1 / fallback;
  const fps = 1 / median;
  return Number.isFinite(fps) && fps > 0 ? Math.min(240, fps) : fallback;
}

/** An output-sized canvas: draws a decoded frame (rotation applied) and stamps the result. */
export class FrameCanvas {
  readonly canvas: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = new OffscreenCanvas(width, height);
    const c = this.canvas.getContext("2d", { alpha: false });
    if (!c) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    this.ctx = c;
  }
  /**
   * The frame at the picture's square-pixel display size (`Picture.display`) from the top left; an
   * odd last row or column falls off the even canvas.
   */
  drawWhole(sample: VideoSample, display: { width: number; height: number }) {
    sample.draw(this.ctx, 0, 0, display.width, display.height);
  }
  sample(timestamp: number, duration: number): VideoSample {
    return new VideoSample(this.canvas, { timestamp, duration });
  }
}
