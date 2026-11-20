/**
 * Stabilize video (feature D7), two passes on WebCodecs: the motion between neighbouring frames
 * measured on a small grey copy (./analyze), the camera's path smoothed and held inside the picture
 * (./path), then every frame redrawn through its correction in WebGL (./warp) and encoded once to
 * H.264 near the source's bitrate; the sound is copied where the container holds it. Rolling
 * shutter (the lean and wobble of phone sensors) is not corrected. Runs in the engine worker; no
 * network access.
 */
import { Quality, VideoSample } from "mediabunny";
import { baseName, formatDimensions } from "@/lib/format";
import { evenCropFilter } from "../crop/math";
import { frameProgress, totalFrames } from "../crop/progress";
import { classifyError, EngineError } from "../errors";
import { canEncodeAvc, openInput, pictureDecodes } from "../mediabunny/shared";
import { hasWebgl2 } from "../overlay/gl";
import type { Engine } from "../types";
import { encodePicture } from "../video-filter/picture";
import { pictureBitrate, pictureContainer, pictureSize, sizeWords } from "../video-filter/plan";
import { analyzeMotion, nearestFrame } from "./analyze";
import { IDENTITY, rescale } from "./motion";
import {
  analysisSize,
  StabilizeOptions,
  sigmaFrames,
  stabilizeCommand,
  stabilizeWords,
  strengthPlans,
} from "./options";
import { planPath } from "./path";
import { createWarpRenderer, type WarpRenderer } from "./warp";

export { StabilizeOptions };

const noGl = () =>
  new EngineError(
    "unsupported-output",
    "This browser cannot draw this effect on the video.",
    "Try desktop Chrome or Edge.",
  );

export const stabilizeEngine: Engine<StabilizeOptions> = {
  id: "stabilize",
  backends: ["webcodecs"],
  optionsSchema: StabilizeOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs" || !input.info?.video) return false;
    if (!pictureDecodes(input.info) || !hasWebgl2()) return false;
    const size = pictureSize(input.info);
    return canEncodeAvc(size.width, size.height);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to steady.",
        "Choose a video file.",
      );
    if (!hasWebgl2()) throw noGl();
    const size = pictureSize(info);
    if (!(await canEncodeAvc(size.width, size.height)))
      throw new EngineError(
        "unsupported-output",
        `This browser cannot write a ${formatDimensions(size.width, size.height)} H.264 video.`,
        "Make the video smaller with compress video first, or try desktop Chrome or Edge.",
      );

    // Pass 1: motion.
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Measuring motion" });
    const media = openInput(input.file);
    let analysis: Awaited<ReturnType<typeof analyzeMotion>>;
    try {
      const track = await media.getPrimaryVideoTrack();
      if (!track) throw new EngineError("unsupported-input", "This file has no video track.");
      const display = {
        width: await track.getDisplayWidth(),
        height: await track.getDisplayHeight(),
      };
      analysis = await analyzeMotion(
        track,
        analysisSize(display.width, display.height),
        totalFrames(info.durationSec, v.fps),
        ctx,
      );
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    } finally {
      media.dispose();
    }
    if (analysis.times.length < 2)
      throw new EngineError(
        "unsupported-input",
        "This video has too few frames to steady.",
        "Choose a longer clip.",
      );

    // The path, in the frame's own pixels (the analysis copy is a scaled-down version of it).
    const k = size.width / analysis.size.width;
    const plan = strengthPlans[o.strength];
    const fps =
      analysis.times.length > 1
        ? (analysis.times.length - 1) /
          Math.max(1e-3, (analysis.times.at(-1) as number) - (analysis.times[0] as number))
        : v.fps;
    const path = planPath(
      analysis.motions.map((m) => rescale(m, k)),
      {
        sigma: sigmaFrames(o, fps),
        maxZoom: plan.maxZoom,
        fill: o.edges === "zoom",
        hw: size.width / 2,
        hh: size.height / 2,
      },
    );

    // Pass 2: every frame redrawn through its correction.
    const to = pictureContainer(input.file.name);
    const bitrate = pictureBitrate(info);
    const outputName = `${baseName(input.file.name)}-stabilized.${to}`;
    let renderer: WarpRenderer | null = null;
    let canvas: OffscreenCanvas | undefined;
    try {
      const r = await encodePicture({
        file: input.file,
        info,
        to,
        outputName,
        video: {
          codec: "avc",
          quality: new Quality({ bitrate, bitrateMode: "variable" }),
          processedWidth: size.width,
          processedHeight: size.height,
          process: (sample) => {
            if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
            if (!renderer) {
              canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
              renderer = createWarpRenderer(canvas, {
                width: sample.displayWidth,
                height: sample.displayHeight,
              });
              if (!renderer) throw noGl();
            }
            const i = nearestFrame(analysis.times, sample.timestamp);
            renderer.render(sample.toCanvasImageSource(), path.warps[i] ?? IDENTITY, path.zoom);
            return new VideoSample(renderer.canvas as OffscreenCanvas, {
              timestamp: sample.timestamp,
              duration: sample.duration,
            });
          },
        },
        sound: "keep",
        ffmpegCommand: "",
        ctx: { ...ctx, onProgress: frameProgress(ctx, totalFrames(info.durationSec, v.fps)) },
      });
      const audio = r.sound === "copy" ? "copy" : r.sound === "encode" ? "aac" : "none";
      const sound =
        r.sound === "copy" ? "sound copied" : r.sound === "encode" ? "sound in AAC" : "no sound";
      return {
        blob: r.blob,
        filename: r.filename,
        ffmpegCommand: stabilizeCommand(
          input.file.name,
          outputName,
          o,
          fps,
          Math.round(bitrate / 1000),
          audio,
          evenCropFilter(v),
        ),
        meta: `${stabilizeWords(o, path.zoom)} · ${sizeWords(v, size)} · H.264 · ${sound}`,
      };
    } finally {
      (renderer as WarpRenderer | null)?.dispose();
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  },
};
