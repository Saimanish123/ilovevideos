/**
 * Loop a video: the whole clip played N times in one file, or enough times to reach a length. A
 * plain loop is a lossless packet copy (merge's `concatCopy` with the same clip N times): nothing is
 * decoded, every play is bit-identical to the source. A boomerang (forwards, then backwards) has to
 * be encoded once (../reverse/native `encodeSequence`); that one bounce is then copied N times. The
 * boomerang has no sound: reversed sound on a bounce is rarely what anyone wants.
 */
import { z } from "zod";
import { baseName, formatBytes, formatDuration, shellQuote } from "@/lib/format";
import { encodedSize, evenCropFilter, type Size } from "../crop/math";
import { EngineError } from "../errors";
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import { concatCopy, openClip } from "../merge/concat";
import { encodedBytes } from "../reverse/math";
import { encodeSequence } from "../reverse/native";
import { containerFor } from "../trim";
import type { Engine } from "../types";
import { pictureBitrate, pictureContainer, pictureSize, sizeWords } from "../video-filter/plan";
import { noVideoError } from "../video-filter/run";
import { loopBytes, MAX_OUTPUT_BYTES, MAX_PLAYS, playLength, plays } from "./math";

export const LoopOptions = z.object({
  times: z.number().int().min(2).max(MAX_PLAYS).default(3),
  /** When set, repeat until the result is at least this long (seconds). */
  minSeconds: z
    .number()
    .positive()
    .max(24 * 3600)
    .optional(),
  boomerang: z.boolean().default(false),
});
export type LoopOptions = z.infer<typeof LoopOptions>;

export function loopCommand(
  input: string,
  output: string,
  n: number,
  boomerang: boolean,
  kbps: number,
  /** The source size; an odd edge is cut for H.264 (../crop/math `evenCropFilter`). */
  src?: Size,
) {
  const cut = src ? evenCropFilter(src) : "";
  if (boomerang)
    return `ffmpeg -i ${shellQuote(input)} -filter_complex "[0:v]${cut ? `${cut},` : ""}split[f][r];[r]reverse,trim=start_frame=1[b];[f][b]concat=n=2:v=1:a=0,loop=loop=${n - 1}:size=32767" -an -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p -movflags +faststart ${shellQuote(output)}`;
  return `ffmpeg -stream_loop ${n - 1} -i ${shellQuote(input)} -c copy ${shellQuote(output)}`;
}

export const loopEngine: Engine<LoopOptions> = {
  id: "loop",
  backends: ["webcodecs"],
  optionsSchema: LoopOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    const v = input.info?.video;
    if (!v) return false;
    // A plain loop is a copy and needs no encoder, nor a decoder.
    if (!options.boomerang) return true;
    const size = encodedSize(v);
    return pictureDecodes(input.info) && canEncodeAvc(size.width, size.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) throw noVideoError();
    const n = plays(playLength(info.durationSec, v.fps, options.boomerang), options);
    if (n < 2) {
      throw new EngineError(
        "internal",
        `This clip is already ${formatDuration(info.durationSec)} long, as long as the length you asked for.`,
        "Choose a longer length or a number of plays.",
      );
    }
    let source: File = input.file;
    let to = containerFor(input.file.name);
    const bitrate = pictureBitrate(info);
    if (options.boomerang) {
      // Refused before the bounce is encoded when the copies would pass the memory cap.
      const planned = encodedBytes(bitrate, playLength(info.durationSec, v.fps, true)) * n;
      if (planned > MAX_OUTPUT_BYTES) {
        throw new EngineError(
          "resource",
          `${n} bounces would make about a ${formatBytes(planned)} file, and this tool holds the result in memory up to ${formatBytes(MAX_OUTPUT_BYTES)}.`,
          "Choose fewer bounces, or trim the clip first.",
        );
      }
      to = pictureContainer(input.file.name);
      const bounce = await encodeSequence({
        file: input.file,
        to,
        bitrate,
        order: "bounce",
        sound: false,
        ctx: {
          signal: ctx.signal,
          onProgress: (p) =>
            ctx.onProgress(
              p.phase === "processing"
                ? { ...p, ratio: p.ratio * 0.95, detail: `Making the bounce · ${p.detail ?? ""}` }
                : p,
            ),
        },
      });
      source = new File([bounce.blob], `bounce.${to}`, { type: bounce.blob.type });
    }
    const bytes = loopBytes(source.size, n);
    if (bytes > MAX_OUTPUT_BYTES) {
      throw new EngineError(
        "resource",
        `${n} plays would make a ${formatBytes(bytes)} file, and this tool holds the result in memory up to ${formatBytes(MAX_OUTPUT_BYTES)}.`,
        "Choose fewer plays or a shorter length, or trim the clip first.",
      );
    }
    const clip = await openClip(source);
    try {
      const outputName = `${baseName(input.file.name)}-${options.boomerang ? "boomerang" : `loop${n}`}.${to}`;
      const blob = await concatCopy(
        Array.from({ length: n }, () => clip),
        to,
        {
          signal: ctx.signal,
          onProgress: (p) =>
            ctx.onProgress(
              p.phase === "processing" && p.item
                ? {
                    phase: "processing",
                    ratio: options.boomerang ? 0.95 + p.ratio * 0.05 : p.ratio,
                    detail: `Play ${p.item.index + 1} of ${n}`,
                  }
                : p,
            ),
        },
      );
      const one = clip.end - clip.start;
      return {
        blob,
        filename: outputName,
        ffmpegCommand: loopCommand(
          input.file.name,
          outputName,
          n,
          options.boomerang,
          Math.round(bitrate / 1000),
          v,
        ),
        meta: options.boomerang
          ? `${n} bounces · ${formatDuration(one * n)} · ${sizeWords(v, pictureSize(info))} · bounce encoded once, then copied · no sound`
          : `${n} plays · ${formatDuration(one * n)} · streams copied, nothing re-encoded`,
      };
    } finally {
      clip.input.dispose();
    }
  },
};
