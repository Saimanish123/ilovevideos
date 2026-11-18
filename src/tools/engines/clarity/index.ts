/**
 * Sharpen and denoise a video (feature G6). Each frame goes through the WebGL renderer the page's
 * preview uses (./render) and is encoded once to H.264 near the source's bitrate; the sound is
 * copied packet for packet where the container holds it (../video-filter/picture). Frames are
 * decoded in order, so denoise can lean on the previous cleaned frame. Files only ffmpeg reads are
 * refused on the page with a way to convert them first. Runs in the engine worker; no network access.
 */
import { Quality, VideoSample } from "mediabunny";
import { baseName, formatDimensions } from "@/lib/format";
import { withEvenCrop } from "../crop/math";
import { frameProgress, totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import { hasWebgl2 } from "../overlay/gl";
import type { Engine } from "../types";
import { encodePicture } from "../video-filter/picture";
import { pictureBitrate, pictureContainer, pictureSize, sizeWords } from "../video-filter/plan";
import { measureNoise } from "./measure";
import { ClarityOptions, clarityCommand, clarityFilter, noiseWords, strengthWord } from "./options";
import { type ClarityRenderer, createClarityRenderer } from "./render";

export { ClarityOptions };

const noGl = () =>
  new EngineError(
    "unsupported-output",
    "This browser cannot draw video frames with WebGL 2 in the background.",
    "Try desktop Chrome or Edge.",
  );

export const clarityEngine: Engine<ClarityOptions> = {
  id: "clarity",
  backends: ["webcodecs"],
  optionsSchema: ClarityOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs" || !input.info?.video) return false;
    if (!pictureDecodes(input.info) || !hasWebgl2()) return false;
    const size = pictureSize(input.info);
    return canEncodeAvc(size.width, size.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to change.",
        "Choose a video file.",
      );
    if (!hasWebgl2()) throw noGl();
    const size = pictureSize(info);
    if (!(await canEncodeAvc(size.width, size.height)))
      throw new EngineError(
        "unsupported-output",
        `This browser's H.264 encoder cannot write a ${formatDimensions(size.width, size.height)} video.`,
        "Make the video smaller with compress video first, or try desktop Chrome or Edge.",
      );
    let o = options;
    if (o.job === "denoise" && o.noise === undefined) {
      ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Measuring the grain" });
      const noise = await measureNoise(input.file, info.durationSec, info.startSec, ctx.signal);
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      o = { ...o, noise: noise ?? 0 };
    }
    const to = pictureContainer(input.file.name);
    const bitrate = pictureBitrate(info);
    const suffix = o.job === "sharpen" ? "sharpened" : "denoised";
    const outputName = `${baseName(input.file.name)}-${suffix}.${to}`;
    let renderer: ClarityRenderer | null = null;
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
              renderer = createClarityRenderer(canvas, {
                width: sample.displayWidth,
                height: sample.displayHeight,
              });
              if (!renderer) throw noGl();
            }
            renderer.render(sample.toCanvasImageSource(), o);
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
        r.sound === "copy"
          ? "sound copied"
          : r.sound === "encode"
            ? "sound in AAC"
            : r.sound === "dropped"
              ? "sound removed"
              : "no sound";
      const grain = o.job === "denoise" ? ` · ${noiseWords(o.noise ?? 0)}` : "";
      return {
        blob: r.blob,
        filename: r.filename,
        ffmpegCommand: clarityCommand(
          input.file.name,
          outputName,
          withEvenCrop(v, `${clarityFilter(o)},format=yuv420p`),
          Math.round(bitrate / 1000),
          audio,
        ),
        meta: `${strengthWord(o.job, o.strength)}${grain} · ${sizeWords(v, size)} · H.264 · ${sound}`,
      };
    } finally {
      (renderer as ClarityRenderer | null)?.dispose();
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  },
};
