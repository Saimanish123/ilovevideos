import { z } from "zod";
import { baseName, shellQuote } from "@/lib/format";
import { type ContainerId, convert } from "../mediabunny/shared";
import type { Engine } from "../types";

export const MuteOptions = z.object({});
export type MuteOptions = z.infer<typeof MuteOptions>;

const containerFor = (name: string): ContainerId => {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "mov") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mkv") return "mkv";
  return "mp4";
};

/** Drops every audio track and copies the video stream. Lossless, near-instant. */
export const muteEngine: Engine<MuteOptions> = {
  id: "mute",
  backends: ["webcodecs"],
  optionsSchema: MuteOptions,
  async supports(backend) {
    return backend === "webcodecs";
  },
  async run(_backend, inputs, _options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const to = containerFor(input.file.name);
    const outputName = `${baseName(input.file.name)}-muted.${to}`;
    return convert({
      file: input.file,
      to,
      outputName,
      audio: { discard: true },
      ffmpegCommand: `ffmpeg -i ${shellQuote(input.file.name)} -c:v copy -an ${shellQuote(outputName)}`,
      ctx,
    });
  },
};
