import { canEncodeVideo } from "mediabunny";
import { z } from "zod";
import { writableContainers } from "@/content/formats/containers";
import { baseName, shellQuote } from "@/lib/format";
import { evenCropFilter } from "../crop/math";
import { type ContainerId, canEncodeAvc, convert } from "../mediabunny/shared";
import type { Engine } from "../types";
import { planConversion } from "./plan";

const targetIds = writableContainers.map((c) => c.id) as [string, ...string[]];

export const ConvertVideoOptions = z.object({
  to: z.enum(targetIds).default("mp4"),
  /** "keep" copies the stream when the container allows it; "avc" forces H.264 for compatibility. */
  videoCodec: z.enum(["keep", "avc"]).default("keep"),
});
export type ConvertVideoOptions = z.infer<typeof ConvertVideoOptions>;

/** Native (WebCodecs) path. The ffmpeg path runs on the page (see ../ffmpeg) and is routed by the stage. */
export const convertVideoEngine: Engine<ConvertVideoOptions> = {
  id: "convert-video",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: ConvertVideoOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs" || !input.info) return false;
    const plan = planConversion(
      input.info,
      input.file.name,
      options.to,
      options.videoCodec === "avc",
    );
    if (plan.backend !== "webcodecs") return false;
    if (plan.copyVideo || !plan.size) return true;
    // Probed at the size it is written: H.264 takes even edges only (641×361 → 640×360).
    const { width, height } = plan.size;
    return plan.videoCodec === "avc"
      ? canEncodeAvc(width, height)
      : canEncodeVideo(plan.videoCodec as "vp9", { width, height });
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input?.info) throw new Error("No input file");
    const plan = planConversion(
      input.info,
      input.file.name,
      options.to,
      options.videoCodec === "avc",
    );
    const to = plan.target.id as ContainerId;
    const outputName = `${baseName(input.file.name)}.${plan.target.extensions[0]}`;
    const cv = plan.copyVideo ? "copy" : to === "webm" ? "libvpx-vp9" : "libx264 -crf 18";
    const ca = plan.copyAudio ? "copy" : to === "webm" ? "libopus" : "aac";
    const faststart = to === "mp4" || to === "mov" ? " -movflags +faststart" : "";
    const v = input.info.video;
    const size = plan.size;
    // The odd edge an H.264 re-encode cuts, the same cut the ffmpeg command shows.
    const cut = !plan.copyVideo && v ? evenCropFilter(v, plan.videoCodec) : "";
    const crop =
      cut && size ? { left: 0, top: 0, width: size.width, height: size.height } : undefined;
    const vf = cut ? ` -vf ${cut}` : "";
    const ffmpegCommand =
      cv === "copy" && ca === "copy"
        ? `ffmpeg -i ${shellQuote(input.file.name)} -c copy${faststart} ${shellQuote(outputName)}`
        : `ffmpeg -i ${shellQuote(input.file.name)}${vf} -c:v ${cv} -c:a ${ca}${faststart} ${shellQuote(outputName)}`;
    return convert({
      file: input.file,
      to,
      outputName,
      video: plan.copyVideo
        ? undefined
        : {
            codec: to === "webm" ? "vp9" : "avc",
            forceTranscode: true,
            ...(crop ? { crop } : {}),
          },
      // The plan, from the capability table, decides; mediabunny's muxers accept more than players do.
      audio: plan.copyAudio
        ? undefined
        : { codec: plan.audioCodec as "aac" | "opus", forceTranscode: true },
      ffmpegCommand,
      ctx,
    });
  },
};
