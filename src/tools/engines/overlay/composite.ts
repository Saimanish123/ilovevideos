/**
 * Draws something over every frame of a video and encodes the result once to H.264: the WebCodecs
 * path shared by burned-in subtitles, watermarks, text, image layers, blurred regions and green
 * screen. Runs in the engine worker; no network access.
 *
 * Two ways to make the output frame, pick one per job:
 *
 * - `layer` (2D, paints over): each decoded frame is painted onto an OffscreenCanvas at the
 *   picture's display size (rotation already applied by mediabunny), the layer draws on top with a
 *   2D context, and the canvas becomes the output frame. For marks, text, stickers.
 * - `stage` (whole frame, reads the picture): the job gets the decoded frame itself and returns the
 *   finished picture (usually a WebGL OffscreenCanvas). For effects that read pixels: blur,
 *   pixelate, keying. `../overlay/gl` has the WebGL helpers; the same renderer can run on the page
 *   for the live preview, so preview and output share one set of numbers (ADR-0035, ADR-0063).
 *
 * Geometry convention for both: placed on the source's display frame (`v.width`×`v.height`), top
 * left at 0,0; an odd last column or row falls off the even output (ADR-0060).
 *
 * Times: `layer.draw` gets the frame's source timestamp (the original behaviour); with
 * `pageTime: true`, and always for `stage`, it gets page time instead (from 0 at the file's start,
 * `MediaInfo.startSec` taken off, ADR-0055), the time the page's timeline shows.
 *
 * The sound is copied when the container allows (the same rule as the geometry tools) and encoded
 * to AAC otherwise, or to Opus (16-bit PCM in MOV) where this browser has no AAC encoder
 * (../sound-codec); `sound: "none"` writes the picture alone.
 */
import { ALL_FORMATS, BlobSource, Input, Quality, VideoSample } from "mediabunny";
import { containerById } from "@/content/formats/containers";
import { baseName, formatDimensions } from "@/lib/format";
import { encodedSize } from "../crop/math";
import { audioCopied, geometryBitrate, geometryContainer } from "../crop/plan";
import { frameProgress, totalFrames } from "../crop/progress";
import { classifyError, EngineError } from "../errors";
import { copyTracks } from "../mediabunny/packet-copy";
import {
  type ContainerId,
  canEncodeAvc,
  containers,
  convert,
  openInput,
} from "../mediabunny/shared";
import {
  soundCodecName,
  soundEncoders,
  type VideoSoundCodec,
  writtenSoundCodec,
} from "../sound-codec";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { framePlan, withPreparedFrames } from "../video-filter/frame-prep";
import { sizeWords } from "../video-filter/plan";

export interface Layer {
  /** Paints over the frame already on the canvas. `timeSec` is the frame's presentation time. */
  draw(ctx: OffscreenCanvasRenderingContext2D, timeSec: number): void;
  /** Frees what the layer holds (decoded sticker frames); called once after the run. */
  dispose?(): void;
}

/** The sizes a stage works with. */
export interface StageSize {
  /** The source's display size: where everything is placed. */
  source: { width: number; height: number };
  /** The encoded size: `source` less an odd last column or row (ADR-0060). */
  output: { width: number; height: number };
}

/**
 * Makes each whole output frame from the decoded one (`CompositeJob.stage`). `render` may be async
 * (a second video's frame is read first); what it returns must stay valid until the encoder has
 * taken it, which is the case for a canvas drawn again only on the next call.
 */
export interface FrameStage {
  /**
   * `frame` is the decoded picture at `drawSize` (its display size, scaled for non-square pixels),
   * to be drawn with its top left at 0,0; `timeSec` is page time. Returns the output frame, at
   * `StageSize.output`.
   */
  render(
    frame: VideoSample,
    timeSec: number,
    drawSize: { width: number; height: number },
  ): CanvasImageSource | Promise<CanvasImageSource>;
  dispose?(): void;
}

export interface CompositeJob {
  file: File;
  info: MediaInfo;
  /** Called with the source's display size, which the layer is placed on. Give this or `stage`. */
  layer?: (size: { width: number; height: number }) => Layer | Promise<Layer>;
  /** Whole-frame renderer, in place of `layer`. */
  stage?: (size: StageSize) => FrameStage | Promise<FrameStage>;
  /** `layer.draw` gets page time (from 0 at the file's start) instead of the source timestamp. */
  pageTime?: boolean;
  /** "none" writes the picture alone. Default: the source's sound, copied where it can be. */
  sound?: "source" | "none";
  /** File name suffix, e.g. "subtitled", "watermarked". */
  suffix: string;
  /**
   * Meta line fragment after the size, e.g. "subtitles burned in". Leave it out when the page's
   * result title already says it ("2 images added"), so the meta does not repeat the title.
   */
  what?: string;
  /** `soundCodec`: what a sound that is not copied is encoded to (../sound-codec). */
  ffmpegCommand: (p: {
    outputName: string;
    kbps: number;
    copyAudio: boolean;
    soundCodec: VideoSoundCodec;
  }) => string;
  ctx: EngineContext;
  /**
   * Keep the sound by packet copy (ADR-0036): the picture is encoded alone and the source's sound
   * packets are joined to it, priming kept behind an edit list, so "sound copied" is true for AAC
   * that opens before zero. Opt-in (text overlay); without it the sound goes through Conversion.
   */
  copySound?: boolean;
}

/** The container a composite writes, the same as the geometry tools: WebM and others become MP4. */
export const compositeContainer = (fileName: string): ContainerId => geometryContainer(fileName);

export async function compositeSupported(info: MediaInfo | undefined): Promise<boolean> {
  const v = info?.video;
  if (!v) return false;
  const size = encodedSize(v);
  return canEncodeAvc(size.width, size.height);
}

export async function runComposite(job: CompositeJob): Promise<EngineResult> {
  const { file, info, ctx } = job;
  const v = info.video;
  if (!v) {
    throw new EngineError(
      "unsupported-input",
      "This file has no video track to draw on.",
      "Choose a video file.",
    );
  }
  // H.264 takes only even edges: the canvas is the picture less an odd last column or row, and the
  // frame is drawn at its own size, so that edge falls off the canvas (../crop/math `encodedSize`).
  const { width, height } = encodedSize(v);
  if (!(await canEncodeAvc(width, height))) {
    throw new EngineError(
      "unsupported-output",
      `This browser cannot write a ${formatDimensions(width, height)} H.264 video.`,
      "Make the video smaller with compress video first, or try desktop Chrome, Edge or Safari.",
    );
  }
  const to = compositeContainer(file.name);
  const bitrate = geometryBitrate({ width, height }, v.fps, v);
  const copyAudio = audioCopied(info, to);
  const outputName = `${baseName(file.name)}-${job.suffix}.${to}`;
  const noSound = job.sound === "none";
  const startSec = info.startSec ?? 0;
  // Placed on the source's frame, as the preview and the ffmpeg graph place it; the cut comes after.
  const source = { width: v.width, height: v.height };
  if (!job.layer && !job.stage)
    throw new EngineError("internal", "Nothing to draw on the picture.", "Try again.");
  const layer = job.stage ? undefined : await job.layer?.(source);
  const stage = job.stage ? await job.stage({ source, output: { width, height } }) : undefined;
  // Where this browser has no AAC encoder (../sound-codec), sound the container holds is always
  // joined by packet copy: Conversion re-encodes AAC whose priming sits before zero, and could not
  // here. Sound it does not hold is encoded to the fallback (Opus; 16-bit PCM in MOV).
  const can = await soundEncoders();
  const soundCodecOut = writtenSoundCodec(to, can);
  const joinSound =
    !noSound && (job.copySound === true || !can.aac) && copyAudio && (info.audio?.length ?? 0) > 0;
  let canvas: OffscreenCanvas | undefined;
  let c2d: OffscreenCanvasRenderingContext2D | null = null;
  // Frames arrive tagged with the source's colour space (an untagged SD picture is read as BT.601,
  // not the decoder's BT.709 guess) and, from an odd source, already cut to the even size
  // (../video-filter/frame-prep). Each is drawn at its own size, scaled only for a non-square source.
  const frames = await framePlan(file, "avc");
  const prepared = withPreparedFrames(
    {
      codec: "avc",
      quality: new Quality({ bitrate, bitrateMode: "variable" }),
      forceTranscode: true,
      allowRotationMetadata: false,
      processedWidth: width,
      processedHeight: height,
      process: async (sample) => {
        const k = frames ? v.width / frames.source.width : 1;
        if (stage) {
          if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
          const drawSize = { width: sample.displayWidth * k, height: sample.displayHeight * k };
          const out = await stage.render(sample, sample.timestamp - startSec, drawSize);
          return new VideoSample(out, { timestamp: sample.timestamp, duration: sample.duration });
        }
        // Cancel stops at the next frame: Conversion.cancel alone let a layer run carry on (measured
        // 2026-11-18 on the timer page: still encoding 5 s after Cancel).
        if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        if (!canvas) {
          canvas = new OffscreenCanvas(width, height);
          c2d = canvas.getContext("2d", { alpha: false });
        }
        if (!c2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
        sample.draw(c2d, 0, 0, sample.displayWidth * k, sample.displayHeight * k);
        layer?.draw(c2d, job.pageTime ? sample.timestamp - startSec : sample.timestamp);
        return new VideoSample(canvas, {
          timestamp: sample.timestamp,
          duration: sample.duration,
        });
      },
    },
    frames,
  );
  let result: Awaited<ReturnType<typeof convert>>;
  try {
    result = await convert({
      file,
      to,
      outputName,
      video: prepared.video,
      decodeColorSpace: prepared.decodeColorSpace,
      audio:
        joinSound || noSound
          ? { discard: true }
          : to === "mkv"
            ? undefined
            : { codec: soundCodecOut },
      ffmpegCommand: job.ffmpegCommand({
        outputName,
        kbps: Math.round(bitrate / 1000),
        copyAudio,
        soundCodec: soundCodecOut,
      }),
      ctx: { ...ctx, onProgress: frameProgress(ctx, totalFrames(info.durationSec, v.fps)) },
    });
  } finally {
    prepared.dispose();
    stage?.dispose?.();
    layer?.dispose?.();
  }
  const sound =
    !info.audio?.length || noSound
      ? "no sound"
      : copyAudio
        ? "sound copied"
        : `sound in ${soundCodecName(soundCodecOut)}`;
  const meta = [sizeWords(v, { width, height }), job.what, "H.264, re-encoded", sound]
    .filter(Boolean)
    .join(" · ");
  if (!joinSound) return { ...result, meta };
  return {
    ...(await withSourceSound(file, result.blob, to, ctx)),
    filename: outputName,
    ffmpegCommand: result.ffmpegCommand,
    meta,
  };
}

/** The encoded picture joined with the source's sound tracks, copied packet for packet. */
export async function withSourceSound(
  file: File,
  picture: Blob,
  to: ContainerId,
  ctx: EngineContext,
): Promise<{ blob: Blob }> {
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  ctx.onProgress({ phase: "finishing", ratio: 0.99, detail: "Copying the sound" });
  const source = openInput(file);
  const encoded = new Input({ source: new BlobSource(picture), formats: ALL_FORMATS });
  try {
    const v = await encoded.getPrimaryVideoTrack();
    if (!v) throw new EngineError("internal", "The video could not be written.", "Try again.");
    const row = containerById.get(to);
    const sounds = (await source.getAudioTracks()).filter(
      (a) => !!a.codec && (row?.audioCodecs ?? []).includes(a.codec),
    );
    const tags = await source.getMetadataTags().catch(() => undefined);
    const parts = await copyTracks({ input: source, tracks: [v, ...sounds], to, tags, ctx });
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    return { blob: new Blob(parts, { type: containers[to].mime }) };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    encoded.dispose();
    source.dispose();
  }
}
