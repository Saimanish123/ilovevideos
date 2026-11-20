import { canEncodeAudio, Quality } from "mediabunny";
import { z } from "zod";
import { baseName, shellQuote } from "@/lib/format";
import { canEncodeAvc, convert, pictureDecodes } from "../mediabunny/shared";
import type { Engine, EngineContext, EngineResult, MediaInput } from "../types";
import { AUDIO_BITRATE, outputDimensions } from "./math";
import { type Pass, runCompress } from "./run";

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

export const compressEngine: Engine<CompressOptions> = {
  id: "compress",
  backends: ["webcodecs"],
  optionsSchema: CompressOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const v = input.info?.video;
    if (!(await canEncodeAvc(v?.width, v?.height))) return false;
    // The sound is written as AAC: a browser without that encoder goes to ffmpeg.wasm (ADR-0147).
    return (input.info?.audio?.length ?? 0) === 0 || canEncodeAudio("aac");
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    return runCompress(input, options, ctx, encode);
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
