/**
 * The per-frame filter runner: decode → draw each frame through a colour transform (./render) →
 * encode H.264, with the sound copied when it can be (./picture). One runner for every page that
 * changes the picture's colours or brightness over time (filter, video-fade). Runs in the engine
 * worker; files only ffmpeg reads go through ./ffmpeg on the page instead.
 */
import { Quality } from "mediabunny";
import { baseName, formatDimensions, shellQuote } from "@/lib/format";
import { withEvenCrop } from "../crop/math";
import { frameProgress, totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { canEncodeAvc } from "../mediabunny/shared";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import type { ColorTransform } from "./color";
import { encodePicture, type PictureJob } from "./picture";
import { pictureBitrate, pictureContainer, pictureSize, sizeWords } from "./plan";
import { createRenderer, type FrameRenderer } from "./render";

export interface FilterRun {
  file: File;
  info: MediaInfo;
  /** The transform for the frame whose middle is at `t` seconds of the output. */
  transformAt: (t: number) => ColorTransform;
  sound: PictureJob["sound"];
  /** File name suffix, e.g. "bw". */
  suffix: string;
  /** First words of the result line, e.g. "black and white". */
  what: string;
  /** ffmpeg video filter chain for the command shown on the result. */
  vf: string;
  /** ffmpeg audio filter, when the sound is changed. */
  af?: string;
  ctx: EngineContext;
}

export const noVideoError = () =>
  new EngineError(
    "unsupported-input",
    "This file has no video track to change.",
    "Choose a video file.",
  );

/** The command that reproduces a filter run. */
export function filterCommand(
  input: string,
  output: string,
  vf: string,
  kbps: number,
  audio: "copy" | "encode" | "none",
  af?: string,
): string {
  const a =
    audio === "none"
      ? "-an"
      : audio === "copy"
        ? "-c:a copy"
        : `${af ? `-af "${af}" ` : ""}-c:a aac -b:a 128k`;
  return `ffmpeg -i ${shellQuote(input)} -vf "${vf}" -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p ${a} -movflags +faststart ${shellQuote(output)}`;
}

export async function runFilter(run: FilterRun): Promise<EngineResult> {
  const { file, info, ctx } = run;
  const v = info.video;
  if (!v) throw noVideoError();
  // An odd source is written one pixel narrower or shorter (./picture `evenCropFor`); that size is
  // what the encoder must take.
  const size = pictureSize(info);
  if (!(await canEncodeAvc(size.width, size.height))) {
    throw new EngineError(
      "unsupported-output",
      `This browser's H.264 encoder cannot write a ${formatDimensions(size.width, size.height)} video.`,
      "Make the video smaller with compress video first, or try desktop Chrome, Edge or Safari.",
    );
  }
  const to = pictureContainer(file.name);
  const bitrate = pictureBitrate(info);
  const outputName = `${baseName(file.name)}-${run.suffix}.${to}`;
  let renderer: FrameRenderer | undefined;
  const job: PictureJob = {
    file,
    info,
    to,
    outputName,
    video: {
      codec: "avc",
      quality: new Quality({ bitrate, bitrateMode: "variable" }),
      processedWidth: size.width,
      processedHeight: size.height,
      process: (sample) => {
        renderer ??= createRenderer(sample.displayWidth, sample.displayHeight);
        renderer.draw(sample, run.transformAt(sample.timestamp + sample.duration / 2));
        return renderer.canvas;
      },
    },
    sound: run.sound,
    ffmpegCommand: "",
    ctx: { ...ctx, onProgress: frameProgress(ctx, totalFrames(info.durationSec, v.fps)) },
  };
  try {
    const r = await encodePicture(job);
    const audio = r.sound === "copy" ? "copy" : r.sound === "encode" ? "encode" : "none";
    const sound =
      r.sound === "copy"
        ? "sound copied"
        : r.sound === "encode"
          ? "sound encoded to AAC"
          : r.sound === "dropped"
            ? "sound removed"
            : "no sound";
    return {
      blob: r.blob,
      filename: r.filename,
      ffmpegCommand: filterCommand(
        file.name,
        outputName,
        withEvenCrop(v, run.vf),
        Math.round(bitrate / 1000),
        audio,
        run.af,
      ),
      meta: `${run.what} · ${sizeWords(v, size)} · re-encoded · ${sound}`,
    };
  } finally {
    renderer?.dispose();
  }
}
