/**
 * Change video codec: re-encode the picture to H.264, HEVC, VP9 or AV1 with WebCodecs. Which of
 * them this browser can write depends on the browser and the device (HEVC and AV1 especially), so
 * `supports()` and the panel ask the encoder for the exact size (`canEncodeVideo`, which calls
 * `VideoEncoder.isConfigSupported`); nothing is promised that the encoder has not confirmed. The
 * sound is copied when the new container holds it, otherwise encoded once (AAC, or Opus in WebM).
 * No ffmpeg path: the bundled ffmpeg has no HEVC or AV1 encoder we can rely on.
 */

import { canEncodeVideo, Quality } from "mediabunny";
import { z } from "zod";
import { baseName, shellQuote } from "@/lib/format";
import { evenCropFilter } from "../crop/math";
import { frameProgress, totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import { ffmpegSoundEncoder, soundCodecName } from "../sound-codec";
import type { Engine } from "../types";
import { encodePicture } from "../video-filter/picture";
import { sizeWords } from "../video-filter/plan";
import { noVideoError } from "../video-filter/run";
import {
  codecLabel,
  codecTargets,
  containerLabel,
  ffmpegEncoder,
  planCodec,
  sameCodec,
} from "./plan";

export const CodecOptions = z.object({
  codec: z.enum(codecTargets).default("avc"),
});
export type CodecOptions = z.infer<typeof CodecOptions>;

export const codecEngine: Engine<CodecOptions> = {
  id: "codec",
  backends: ["webcodecs"],
  optionsSchema: CodecOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const info = input.info;
    const v = info?.video;
    if (!info || !v) return false;
    const plan = planCodec(info, input.file.name, options.codec);
    // The size the encoder will get: H.264 and HEVC lose an odd edge (./plan `codecSize`).
    return canEncodeVideo(options.codec, {
      width: plan.size.width,
      height: plan.size.height,
      bitrate: plan.bitrate,
    });
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) throw noVideoError();
    const name = codecLabel[options.codec] ?? options.codec;
    if (sameCodec(info, options.codec)) {
      throw new EngineError("internal", `This video is already ${name}.`, "Choose another codec.");
    }
    const plan = planCodec(info, input.file.name, options.codec);
    const outputName = `${baseName(input.file.name)}-${options.codec === "avc" ? "h264" : options.codec}.${plan.ext}`;
    const r = await encodePicture({
      file: input.file,
      info,
      to: plan.to,
      outputName,
      video: {
        codec: options.codec,
        quality: new Quality({ bitrate: plan.bitrate, bitrateMode: "variable" }),
      },
      sound: "keep",
      ffmpegCommand: "",
      ctx: { ...ctx, onProgress: frameProgress(ctx, totalFrames(info.durationSec, v.fps)) },
    });
    const audio =
      r.sound === "copy"
        ? "-c:a copy"
        : r.sound === "encode"
          ? `-c:a ${ffmpegSoundEncoder(r.soundCodec)}${r.soundCodec === "pcm-s16" ? "" : " -b:a 128k"}`
          : "-an";
    const kbps = Math.round(plan.bitrate / 1000);
    const cut = evenCropFilter(v, options.codec);
    const faststart = plan.to === "mp4" || plan.to === "mov" ? " -movflags +faststart" : "";
    const sound =
      r.sound === "copy"
        ? "sound copied"
        : r.sound === "encode"
          ? `sound encoded to ${soundCodecName(r.soundCodec)}`
          : "no sound";
    return {
      ...r,
      ffmpegCommand: `ffmpeg -i ${shellQuote(input.file.name)} ${cut ? `-vf ${cut} ` : ""}-c:v ${ffmpegEncoder[options.codec]} -b:v ${kbps}k -pix_fmt yuv420p ${audio}${faststart} ${shellQuote(outputName)}`,
      meta: `${codecLabel[v.codec] ?? v.codec} → ${name} · ${sizeWords(v, plan.size, options.codec)} · ${containerLabel[plan.to]} · ${sound}`,
    };
  },
};
