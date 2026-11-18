import { Quality } from "mediabunny";
import { z } from "zod";
import { baseName, formatBytes, formatDimensions, formatDuration, shellQuote } from "@/lib/format";
import { EngineError } from "../errors";
import { canEncodeAvc, convert, pictureDecodes } from "../mediabunny/shared";
import type { Engine, EngineContext, EngineResult, MediaInput } from "../types";
import {
  AUDIO_BITRATE,
  type HeightCap,
  MB,
  outputDimensions,
  planTarget,
  retryVideoBitrate,
  videoBitrateForPreset,
} from "./math";

export const CompressOptions = z.object({
  preset: z.enum(["smaller", "balanced", "best", "target"]).default("balanced"),
  /** Only used when preset is "target". Decimal megabytes (see `MB` in ./math). */
  targetMb: z.number().min(1).max(4000).default(25),
  maxHeight: z
    .union([
      z.literal("original"),
      /** Target mode only: the resolution the planned bitrate can carry. Treated as "original" otherwise. */
      z.literal("auto"),
      z.literal(2160),
      z.literal(1440),
      z.literal(1080),
      z.literal(720),
      z.literal(480),
      z.literal(360),
    ])
    .default("original"),
});
export type CompressOptions = z.infer<typeof CompressOptions>;

interface Pass {
  videoBitrate: number;
  audioBitrate: number;
  height: HeightCap;
}

export const compressEngine: Engine<CompressOptions> = {
  id: "compress",
  backends: ["webcodecs"],
  optionsSchema: CompressOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const v = input.info?.video;
    return canEncodeAvc(v?.width, v?.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const info = input.info;
    const v = info?.video;
    const src = { width: v?.width ?? 1920, height: v?.height ?? 1080, fps: v?.fps ?? 30 };
    const duration = info?.durationSec ?? 0;
    const hasAudio = (info?.audio?.length ?? 1) > 0;

    if (options.preset !== "target") {
      const height = options.maxHeight === "auto" ? "original" : options.maxHeight;
      const dims = outputDimensions(src.width, src.height, height);
      const videoBitrate = videoBitrateForPreset(options.preset, dims.width, dims.height, src.fps);
      return encode(input, { videoBitrate, audioBitrate: AUDIO_BITRATE, height }, ctx);
    }

    const targetBytes = options.targetMb * MB;
    const plan = planTarget(
      targetBytes,
      { ...src, durationSec: duration, hasAudio },
      options.maxHeight,
    );
    if (!plan.ok) {
      throw plan.reason === "no-duration"
        ? new EngineError(
            "unsupported-input",
            "This file does not say how long it is, so a size target cannot be planned.",
            "Use a quality preset on the compress page instead.",
          )
        : new EngineError(
            "unsupported-input",
            `At ${formatDuration(duration)} this video cannot fit in ${options.targetMb} MB without falling apart; the smallest usable result is about ${formatBytes(plan.minBytes)}.`,
            `Trim it to under ${formatDuration(plan.maxDurationSec)} first, or choose a larger size.`,
          );
    }

    const first: Pass = {
      videoBitrate: plan.videoBitrate,
      audioBitrate: plan.audioBitrate,
      height: plan.height,
    };
    let result = await encode(input, first, ctx);
    let pass = first;
    // Encoders do not hit a bitrate exactly, least of all on short or very static clips. Measure the
    // real file and, if it is over, encode once more with the bitrate corrected by the overshoot.
    if (result.blob.size > targetBytes) {
      const over = result.blob.size;
      pass = {
        ...first,
        videoBitrate: retryVideoBitrate(
          first.videoBitrate,
          first.audioBitrate,
          duration,
          targetBytes,
          over,
        ),
      };
      ctx.onProgress({
        phase: "processing",
        ratio: 0,
        detail: `First pass came to ${formatBytes(over)}, over ${options.targetMb} MB. Encoding again at a lower bitrate`,
      });
      result = await encode(input, pass, ctx, "Second pass: ");
    }
    const dims = outputDimensions(src.width, src.height, pass.height);
    // The verdict (fits, or by how much it missed) is written by the stage from the real size.
    const passes = pass === first ? "" : " · second pass";
    return { ...result, meta: `${formatDimensions(dims.width, dims.height)}${passes}` };
  },
};

async function encode(
  input: MediaInput,
  pass: Pass,
  ctx: EngineContext,
  detailPrefix = "",
): Promise<EngineResult> {
  const v = input.info?.video;
  const src = { width: v?.width ?? 1920, height: v?.height ?? 1080 };
  const dims = outputDimensions(src.width, src.height, pass.height);
  const scaled = pass.height !== "original" && dims.height !== src.height;
  const outputName = `${baseName(input.file.name)}-compressed.mp4`;
  const scale = scaled ? ` -vf scale=-2:${dims.height}` : "";
  const audioArgs =
    pass.audioBitrate > 0 ? `-c:a aac -b:a ${Math.round(pass.audioBitrate / 1000)}k` : "-an";
  const ffmpegCommand = `ffmpeg -i ${shellQuote(input.file.name)}${scale} -c:v libx264 -b:v ${Math.round(pass.videoBitrate / 1000)}k ${audioArgs} -movflags +faststart ${shellQuote(outputName)}`;

  const onProgress: EngineContext["onProgress"] = detailPrefix
    ? (p) => ctx.onProgress({ ...p, detail: p.detail ? `${detailPrefix}${p.detail}` : p.detail })
    : ctx.onProgress;

  return convert({
    file: input.file,
    to: "mp4",
    outputName,
    video: {
      codec: "avc",
      quality: new Quality({ bitrate: pass.videoBitrate, bitrateMode: "variable" }),
      forceTranscode: true,
      ...(scaled ? { height: dims.height } : {}),
    },
    audio: {
      codec: "aac",
      quality: new Quality({ bitrate: pass.audioBitrate || AUDIO_BITRATE }),
    },
    ffmpegCommand,
    ctx: { ...ctx, onProgress },
  });
}
