import { canEncodeVideo, Quality } from "mediabunny";
import { z } from "zod";
import { baseName, formatDuration, formatTimecode, shellQuote } from "@/lib/format";
import { encodedSize } from "../crop/math";
import { reencodeBitrate } from "../crop/plan";
import { classifyError, EngineError } from "../errors";
import { listKeyframes } from "../mediabunny/keyframes";
import { copyPackets } from "../mediabunny/packet-copy";
import { type ContainerId, canEncodeAvc, convert, pictureDecodes } from "../mediabunny/shared";
import { openClip } from "../merge/concat";
import type { Engine, MediaInfo } from "../types";
import { losslessStart, startNote } from "./math";

export const TrimOptions = z
  .object({
    start: z.number().min(0).default(0),
    end: z.number().min(0),
    /** Frame-accurate cut re-encodes the video; the default cuts at keyframes without re-encoding. */
    precise: z.boolean().default(false),
  })
  .refine((o) => o.end > o.start, { message: "End must be after start" });
export type TrimOptions = z.infer<typeof TrimOptions>;

/** Output container for a stream copy: the input's own, by extension (MP4 when unknown). Shared with split. */
export const containerFor = (name: string): ContainerId => {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "mov") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mkv") return "mkv";
  return "mp4";
};

/**
 * The picture of a frame-accurate cut: the container's usual codec (VP9 in WebM, H.264 elsewhere),
 * cropped to even edges where the codec needs them (a 641×361 H.264 encode is refused), at the
 * shared re-encode bitrate from size, rate and the source's own bitrate (before, density alone took
 * a 364 kB VP9 cut to 1.3 MB).
 */
export function preciseVideo(to: ContainerId, v: MediaInfo["video"]) {
  const codec: "avc" | "vp9" = to === "webm" ? "vp9" : "avc";
  if (!v)
    return { codec, size: undefined, bitrate: undefined, options: { forceTranscode: true, codec } };
  // H.264 takes even edges only (../crop/math `encodedSize`, ADR-0060); VP9 keeps every pixel.
  const size = encodedSize(v, codec);
  const crop =
    size.width !== v.width || size.height !== v.height
      ? { left: 0, top: 0, width: size.width, height: size.height }
      : undefined;
  const bitrate = reencodeBitrate({ size, fps: v.fps, codec, source: v });
  return {
    codec,
    size,
    bitrate,
    options: {
      forceTranscode: true,
      codec,
      ...(crop ? { crop } : {}),
      quality: new Quality({ bitrate, bitrateMode: "variable" as const }),
    },
  };
}

export const trimEngine: Engine<TrimOptions> = {
  id: "trim",
  backends: ["webcodecs"],
  optionsSchema: TrimOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    // A lossless cut copies the picture; only a frame-accurate one decodes it.
    if (!options.precise) return true;
    if (!pictureDecodes(input.info)) return false;
    const v = input.info?.video;
    // Probed at the size it will be written: H.264 takes even edges only (641×361 → 640×360).
    const plan = preciseVideo(containerFor(input.file.name), v);
    return plan.codec === "avc"
      ? canEncodeAvc(plan.size?.width, plan.size?.height)
      : canEncodeVideo(plan.codec, { width: plan.size?.width, height: plan.size?.height });
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const { file, info } = input;
    const to = containerFor(file.name);
    const outputName = `${baseName(file.name)}-trimmed.${to}`;
    // The page's times run from the file's start; the file's own may not (MPEG-TS: about 1.4 s).
    const t0 = info?.startSec ?? 0;

    if (options.precise) {
      const plan = preciseVideo(to, info?.video);
      const evenCrop =
        plan.size && info?.video && plan.size.width !== info.video.width
          ? ` -vf crop=${plan.size.width}:${plan.size.height}:0:0`
          : plan.size && info?.video && plan.size.height !== info.video.height
            ? ` -vf crop=${plan.size.width}:${plan.size.height}:0:0`
            : "";
      const ss = options.start.toFixed(2);
      const t = (options.end - options.start).toFixed(2);
      const result = await convert({
        file,
        to,
        outputName,
        trim: { start: options.start + t0, end: options.end + t0 },
        video: plan.options,
        ffmpegCommand: `ffmpeg -ss ${ss} -i ${shellQuote(file.name)} -t ${t}${evenCrop}${
          plan.codec === "vp9" ? " -c:v libvpx-vp9 -c:a libopus" : " -c:v libx264 -c:a aac"
        }${plan.bitrate ? ` -b:v ${Math.round(plan.bitrate / 1000)}k` : ""} ${shellQuote(outputName)}`,
        ctx,
      });
      return {
        ...result,
        meta: `Starts at ${formatTimecode(options.start)} · re-encoded, frame-accurate`,
      };
    }

    // Lossless: a packet copy from the key frame at or before the start (see ../mediabunny/packet-copy
    // for why not Conversion, which re-encodes whenever the start is later than the first frame).
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Finding key frames" });
    const keyframes = info?.video
      ? (info.video.keyframes ?? (await listKeyframes(file)).map((k) => k - t0))
      : undefined;
    // Without video every audio packet is a cut point, so the start stands.
    const start = keyframes ? losslessStart(options.start, keyframes) : options.start;
    const total = Math.max(1e-6, options.end - start);
    const clip = await openClip(file);
    let copied: Awaited<ReturnType<typeof copyPackets>>;
    try {
      copied = await copyPackets(
        clip,
        { start: start + t0, end: options.end + t0 },
        to,
        ctx,
        (ratio) =>
          ctx.onProgress({
            phase: "processing",
            ratio,
            detail: `${formatDuration(ratio * total)} of ${formatDuration(total)} copied`,
          }),
      );
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    } finally {
      clip.input.dispose();
    }
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    copied = { ...copied, start: copied.start - t0, end: copied.end - t0 };

    const ss = copied.start.toFixed(3);
    const t = (options.end - copied.start).toFixed(3);
    const facts = [
      info?.video ? startNote(options.start, copied.start) : undefined,
      `${formatTimecode(copied.end - copied.start)} kept`,
      "streams copied",
      clip.audio && !copied.withAudio ? "sound left out" : undefined,
    ].filter(Boolean);
    return {
      blob: copied.blob,
      filename: outputName,
      // Input seeking to the key frame itself, so ffmpeg starts where this cut starts.
      ffmpegCommand: `ffmpeg -ss ${ss} -i ${shellQuote(file.name)} -t ${t} -c copy ${shellQuote(outputName)}`,
      meta: facts.join(" · "),
    };
  },
};
