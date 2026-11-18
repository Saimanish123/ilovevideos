/**
 * Change frame rate (lower only): the picture is re-encoded at a constant rate by dropping frames
 * (mediabunny's frame-rate transform keeps the last frame of each 1/fps slot); no blending, no
 * motion interpolation. The sound is copied when the container holds it (../video-filter/picture).
 * Files only ffmpeg reads go through ffmpeg's `fps` filter on the page (engines/page-runners).
 */
import { Quality } from "mediabunny";
import { z } from "zod";
import { baseName, shellQuote } from "@/lib/format";
import { type Size, withEvenCrop } from "../crop/math";
import { frameProgress } from "../crop/progress";
import { EngineError } from "../errors";
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { encodePicture } from "../video-filter/picture";
import { pictureBitrate, pictureContainer, pictureSize, sizeWords } from "../video-filter/plan";
import { noVideoError } from "../video-filter/run";
import { formatFps, lowersRate, MIN_FPS, outputFrames } from "./math";

export const FramerateOptions = z.object({
  /** Target frames per second; must be below the source's. */
  fps: z.number().min(MIN_FPS).max(240).default(30),
});
export type FramerateOptions = z.infer<typeof FramerateOptions>;

const rateLabel = (fps: number) => String(Number(fps.toFixed(3))).replace(".", "_");

export function framerateCommand(
  input: string,
  output: string,
  fps: number,
  kbps: number,
  audio: string,
  /** The source size; an odd edge is cut for H.264 (../crop/math `withEvenCrop`). */
  src?: Size,
) {
  const vf = `fps=${Number(fps.toFixed(3))}`;
  return `ffmpeg -i ${shellQuote(input)} -vf ${src ? withEvenCrop(src, vf) : vf} -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p ${audio} -movflags +faststart ${shellQuote(output)}`;
}

export const framerateEngine: Engine<FramerateOptions> = {
  id: "framerate",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: FramerateOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const info = input.info;
    if (!info?.video) return false;
    const size = pictureSize(info);
    return canEncodeAvc(size.width, size.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) throw noVideoError();
    if (!lowersRate(v.fps, options.fps)) {
      throw new EngineError(
        "internal",
        `This video is already ${formatFps(v.fps)}; the target has to be lower.`,
        "Choose a lower frame rate.",
      );
    }
    const to = pictureContainer(input.file.name);
    const bitrate = pictureBitrate(info, options.fps);
    const size = pictureSize(info);
    const outputName = `${baseName(input.file.name)}-${rateLabel(options.fps)}fps.${to}`;
    const frames = outputFrames(info.durationSec, options.fps);
    const r = await encodePicture({
      file: input.file,
      info,
      to,
      outputName,
      video: {
        codec: "avc",
        frameRate: options.fps,
        quality: new Quality({ bitrate, bitrateMode: "variable" }),
      },
      sound: "keep",
      ffmpegCommand: "",
      ctx: { ...ctx, onProgress: frameProgress(ctx, frames) },
    });
    const audio =
      r.sound === "copy" ? "-c:a copy" : r.sound === "encode" ? "-c:a aac -b:a 128k" : "-an";
    return {
      ...r,
      ffmpegCommand: framerateCommand(
        input.file.name,
        outputName,
        options.fps,
        Math.round(bitrate / 1000),
        audio,
        v,
      ),
      meta: `${formatFps(v.fps)} → ${formatFps(options.fps)} · ${sizeWords(v, size)} · re-encoded · ${r.sound === "copy" ? "sound copied" : r.sound === "encode" ? "sound encoded to AAC" : "no sound"}`,
    };
  },
};
