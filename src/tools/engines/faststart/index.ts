/**
 * Optimise for web (fast start): move an MP4 or MOV's index in front of its media (./boxes). Runs on
 * the page (engines/page-runners): it reads the index and a few box headers, and the output is a Blob
 * made of slices of the original File plus the new index, so nothing is decoded and the file is never
 * copied in memory. The worker engine object exists for the loader table only.
 */
import { z } from "zod";
import { baseName, formatBytes, shellQuote } from "@/lib/format";
import { EngineError } from "../errors";
import type { Engine, EngineContext, EngineResult } from "../types";
import { hasForeignOffsets, isPlan, planFastStart, type Read } from "./boxes";

export const FaststartOptions = z.object({});
export type FaststartOptions = z.infer<typeof FaststartOptions>;

export const fileReader =
  (file: Blob): Read =>
  async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());

/** MP4, M4V, MOV and M4A carry a `moov` index; other containers do not work this way. */
export const faststartExtensions = ["mp4", "m4v", "mov", "m4a", "3gp"] as const;
export const takesFaststart = (fileName: string) =>
  (faststartExtensions as readonly string[]).includes(
    fileName.toLowerCase().split(".").pop() ?? "",
  );

export function faststartCommand(input: string, output: string): string {
  return `ffmpeg -i ${shellQuote(input)} -map 0 -c copy -movflags +faststart ${shellQuote(output)}`;
}

/** The whole job, on the page thread. */
export async function faststartOnPage(file: File, ctx: EngineContext): Promise<EngineResult> {
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  if (!takesFaststart(file.name)) {
    throw new EngineError(
      "unsupported-input",
      "Fast start applies to MP4 and MOV files.",
      "Convert the video to MP4 first; the converter writes the index at the front.",
    );
  }
  ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file's layout" });
  const read = fileReader(file);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const outputName = `${baseName(file.name)}-faststart.${ext}`;
  const plan = await planFastStart(read, file.size);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  if (!isPlan(plan)) {
    if (plan.kind === "no-index")
      throw new EngineError(
        "unsupported-input",
        "This file has no index (no moov box), so it cannot be played or rearranged.",
        "It may be an unfinished recording. Try the original file from the camera or app.",
      );
    // Already streamable: the same bytes, said so.
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Nothing to move" });
    return {
      blob: file.slice(0, file.size, file.type || "video/mp4"),
      filename: outputName,
      ffmpegCommand: faststartCommand(file.name, outputName),
      meta:
        plan.kind === "fragmented"
          ? "fragmented MP4 · already streams as it downloads · unchanged"
          : "index already at the front · unchanged",
    };
  }
  const index = plan.parts.find((p): p is Uint8Array => p instanceof Uint8Array);
  if (index && hasForeignOffsets(index.subarray(8))) {
    throw new EngineError(
      "unsupported-input",
      "This file's index holds encryption offsets that this tool does not move.",
      "Use ffmpeg with -movflags +faststart on a desktop for this file.",
    );
  }
  ctx.onProgress({ phase: "processing", ratio: 0.5, detail: "Moving the index" });
  const blob = new Blob(
    plan.parts.map((p) => (p instanceof Uint8Array ? (p as BlobPart) : file.slice(p.from, p.to))),
    { type: file.type || (ext === "mov" ? "video/quicktime" : "video/mp4") },
  );
  ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
  return {
    blob,
    filename: outputName,
    ffmpegCommand: faststartCommand(file.name, outputName),
    meta: `index (${formatBytes(plan.indexBytes)}) moved to the front · streams copied · every track kept`,
  };
}

export const faststartEngine: Engine<FaststartOptions> = {
  id: "faststart",
  backends: ["canvas"],
  optionsSchema: FaststartOptions,
  async supports() {
    // Runs on the page, never inside the engine worker.
    return false;
  },
  async run() {
    throw new EngineError(
      "internal",
      "Fast start runs on the page, not in the worker.",
      "Try again.",
    );
  },
};
