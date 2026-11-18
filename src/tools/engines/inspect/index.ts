/**
 * Inspect: the panel shows what the inspector already read, so there is nothing to process. This
 * engine exists so the report can also be saved as a text file; it decodes nothing.
 */
import { z } from "zod";
import { baseName } from "@/lib/format";
import { EngineError } from "../errors";
import type { Engine } from "../types";
import { infoReport } from "./report";

export const InspectOptions = z.object({});
export type InspectOptions = z.infer<typeof InspectOptions>;

export const inspectEngine: Engine<InspectOptions> = {
  id: "inspect",
  backends: ["webcodecs"],
  optionsSchema: InspectOptions,
  async supports(_backend, input) {
    return !!input.info;
  },
  async run(_backend, inputs, _options, ctx) {
    const input = inputs[0];
    if (!input?.info) {
      throw new EngineError(
        "unsupported-input",
        "The file could not be read.",
        "Choose a video or audio file.",
      );
    }
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    const text = infoReport(input.info, input.file.name);
    return {
      blob: new Blob([text], { type: "text/plain" }),
      filename: `${baseName(input.file.name)}-info.txt`,
      ffmpegCommand: `ffprobe -hide_banner -show_format -show_streams ${input.file.name}`,
    };
  },
};
