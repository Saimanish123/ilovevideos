/**
 * Remove metadata. Re-muxes the file with an empty tag set: every video, audio and subtitle stream
 * is copied bit for bit, and the container's descriptive tags (`udta`/`ilst`/QuickTime keys on
 * MP4 and MOV, SimpleTags on WebM/MKV) are not written. Rotation lives in the track header and is kept.
 */
import { z } from "zod";
import { baseName, shellQuote, withUnit } from "@/lib/format";
import { type ContainerId, convert } from "../mediabunny/shared";
import type { Engine } from "../types";
import { countTags } from "./tags";

export const StripMetadataOptions = z.object({});
export type StripMetadataOptions = z.infer<typeof StripMetadataOptions>;

const containerFor = (name: string): ContainerId => {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "mov") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mkv") return "mkv";
  return "mp4";
};

export const stripMetadataEngine: Engine<StripMetadataOptions> = {
  id: "strip-metadata",
  backends: ["webcodecs"],
  optionsSchema: StripMetadataOptions,
  async supports(backend) {
    return backend === "webcodecs";
  },
  async run(_backend, inputs, _options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const to = containerFor(input.file.name);
    const outputName = `${baseName(input.file.name)}-clean.${to}`;
    const removed = countTags(input.info?.tags);
    const result = await convert({
      file: input.file,
      to,
      outputName,
      tags: () => ({}),
      // The muxer stamps the movie and track headers with the time of writing; a clean file has none.
      clearTimes: true,
      ffmpegCommand: `ffmpeg -i ${shellQuote(input.file.name)} -map 0 -c copy -map_metadata -1 ${shellQuote(outputName)}`,
      ctx,
    });
    return {
      ...result,
      meta:
        removed === 0
          ? "no tags found · streams copied"
          : `${withUnit(removed, removed === 1 ? "tag" : "tags")} removed · streams copied`,
    };
  },
};
