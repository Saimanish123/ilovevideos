/**
 * Change video bitrate (feature A3): the picture re-encoded at an explicit bitrate (variable or
 * constant), in the source's codec when this browser can write it, else H.264; the sound copied,
 * re-encoded at its own bitrate, or dropped. The written file's real video bitrate is read back from
 * its packets for the result line. Runs in the engine worker; no network access.
 */
import { ALL_FORMATS, BlobSource, canEncodeVideo, Input, Quality } from "mediabunny";
import { baseName, formatDimensions } from "@/lib/format";
import { withEvenCrop } from "../crop/math";
import { frameProgress, totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { encodePicture } from "../video-filter/picture";
import { sizeWords } from "../video-filter/plan";
import { BitrateOptions, bitrateCommand, codecName, planBitrate, rateWords } from "./plan";

export { BitrateOptions };

async function canWrite(o: BitrateOptions, size: { width: number; height: number }) {
  if (o.codec === "avc") return canEncodeAvc(size.width, size.height);
  return canEncodeVideo(o.codec, {
    width: size.width,
    height: size.height,
    bitrate: o.videoKbps * 1000,
  });
}

/** The written picture's average bitrate (bits per second), from its packets. */
async function measuredVideoBps(blob: Blob): Promise<number | undefined> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    if (!v) return undefined;
    const stats = await v.computePacketStats();
    return stats.averageBitrate;
  } catch {
    return undefined;
  } finally {
    input.dispose();
  }
}

export const bitrateEngine: Engine<BitrateOptions> = {
  id: "bitrate",
  backends: ["webcodecs"],
  optionsSchema: BitrateOptions,
  async supports(backend, input, o) {
    if (backend !== "webcodecs" || !input.info?.video) return false;
    if (!pictureDecodes(input.info)) return false;
    const plan = planBitrate(input.info, input.file.name, o);
    return canWrite(o, plan.size);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to re-encode.",
        "Choose a video file.",
      );
    const plan = planBitrate(info, input.file.name, o);
    if (!(await canWrite(o, plan.size)))
      throw new EngineError(
        "unsupported-output",
        `This browser cannot encode ${codecName(o.codec)} at ${formatDimensions(plan.size.width, plan.size.height)}.`,
        "Try desktop Chrome or Edge, or make the video smaller first.",
      );
    const outputName = `${baseName(input.file.name)}-${o.videoKbps}k.${plan.to}`;
    const r = await encodePicture({
      file: input.file,
      info,
      to: plan.to,
      outputName,
      video: {
        codec: o.codec,
        quality: new Quality({ bitrate: plan.videoBps, bitrateMode: o.mode }),
      },
      sound: plan.sound === "copy" ? "keep" : plan.sound === "encode" ? "encode" : "drop",
      audioBitrate: plan.audioBps || undefined,
      ffmpegCommand: "",
      ctx: { ...ctx, onProgress: frameProgress(ctx, totalFrames(info.durationSec, v.fps)) },
    });
    const measured = await measuredVideoBps(r.blob);
    const sound =
      r.sound === "copy"
        ? "sound copied"
        : r.sound === "encode"
          ? `sound ${plan.audioCodec === "opus" ? "Opus" : "AAC"} ${Math.round(plan.audioBps / 1000)} kb/s`
          : r.sound === "dropped"
            ? "sound removed"
            : "no sound";
    const written = measured ? `${rateWords(measured / 1000)} written` : "";
    return {
      blob: r.blob,
      filename: r.filename,
      ffmpegCommand: bitrateCommand(
        input.file.name,
        outputName,
        plan,
        o.mode,
        withEvenCrop(v, "", o.codec),
      ),
      meta: [
        `${codecName(o.codec)} ${sizeWords(v, plan.size, o.codec)}`,
        written,
        o.mode === "constant" ? "constant rate" : "",
        sound,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  },
};
