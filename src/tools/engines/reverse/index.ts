/**
 * Reverse a video: the picture plays backwards, re-encoded to H.264; the sound is reversed too
 * (decoded whole, so it has a length limit, ./math `maxReversedSound`) or removed. WebCodecs only,
 * in the engine worker (./native). Files only ffmpeg can read are refused with a way out: ffmpeg's
 * `reverse` filter holds every decoded frame in memory, which a browser tab cannot afford.
 */
import { z } from "zod";
import { baseName, formatDuration, shellQuote } from "@/lib/format";
import { type Size, withEvenCrop } from "../crop/math";
import { EngineError } from "../errors";
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { pictureBitrate, pictureContainer, pictureSize, sizeWords } from "../video-filter/plan";
import { noVideoError } from "../video-filter/run";
import { encodeSequence } from "./native";

export const ReverseOptions = z.object({
  /** reverse: the sound plays backwards too; drop: the result is silent. */
  sound: z.enum(["reverse", "drop"]).default("reverse"),
});
export type ReverseOptions = z.infer<typeof ReverseOptions>;

export function reverseCommand(
  input: string,
  output: string,
  kbps: number,
  sound: boolean,
  /** The source size; an odd edge is cut for H.264 (../crop/math `withEvenCrop`). */
  src?: Size,
) {
  return `ffmpeg -i ${shellQuote(input)} -vf ${src ? withEvenCrop(src, "reverse") : "reverse"} ${sound ? "-af areverse -c:a aac -b:a 128k" : "-an"} -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p -movflags +faststart ${shellQuote(output)}`;
}

export const reverseEngine: Engine<ReverseOptions> = {
  id: "reverse",
  backends: ["webcodecs"],
  optionsSchema: ReverseOptions,
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
    const to = pictureContainer(input.file.name);
    const bitrate = pictureBitrate(info);
    const outputName = `${baseName(input.file.name)}-reversed.${to}`;
    const withSound = options.sound === "reverse" && !!info.audio?.length;
    const r = await encodeSequence({
      file: input.file,
      to,
      bitrate,
      order: "reverse",
      sound: withSound,
      ctx,
    });
    if (r.frames === 0)
      throw new EngineError(
        "internal",
        "No frames could be decoded from this video.",
        "Try another file.",
      );
    return {
      blob: r.blob,
      filename: outputName,
      ffmpegCommand: reverseCommand(
        input.file.name,
        outputName,
        Math.round(bitrate / 1000),
        withSound,
        v,
      ),
      meta: `reversed · ${r.frames.toLocaleString("en")} frames · ${sizeWords(v, pictureSize(info))} · ${formatDuration(info.durationSec)} · ${withSound ? "sound reversed" : info.audio?.length ? "sound removed" : "no sound"}`,
    };
  },
};
