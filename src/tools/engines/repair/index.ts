/**
 * Repair a damaged video (ADR-0097): diagnose (./diagnose), then copy every complete frame and sound
 * packet into a fresh file of the same container, with a new index. Nothing is re-encoded.
 *
 * - MP4/MOV cut short with its index intact: the index says where every sample is; samples whose
 *   bytes are all present are kept, up to the earliest presentation time of any missing one, so the
 *   picture and sound end together.
 * - Fragmented MP4 cut short: the file up to its last complete fragment.
 * - Matroska/WebM cut short: every cluster mediabunny can read.
 * - MP4/MOV with no index: refused with the reason; rebuilding an index from raw data needs the
 *   codec settings from a reference file and frame boundaries the sound does not mark (see ADR-0097).
 *
 * Runs in the engine worker; no network.
 */
import { EncodedPacketSink } from "mediabunny";
import { baseName, formatBytes, formatDuration, shellQuote } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { copyPackets, remux } from "../mediabunny/packet-copy";
import type { ContainerId } from "../mediabunny/shared";
import { openClip } from "../merge/concat";
import type { Engine, EngineResult } from "../types";
import { completeLead, type Diagnosis, diagnose, sampleTables, topBoxes } from "./diagnose";
import { RepairOptions } from "./options";

export { RepairOptions };

const cancelled = () => new EngineError("cancelled", "Cancelled.");

/** Why a file cannot be repaired here, or undefined when it can. */
export function unrepairable(d: Diagnosis): string | undefined {
  if (d.kind === "unknown") return d.reason;
  if (d.kind === "no-index")
    return `This ${d.container.toUpperCase()} has ${formatBytes(d.mediaBytes)} of picture and sound but no index (the moov box), which the recording app writes when it stops. Without it nothing says where each frame starts, and this tool cannot rebuild it.`;
  return undefined;
}

export async function repairFile(
  file: File,
  ctx: Parameters<Engine<RepairOptions>["run"]>[3],
): Promise<EngineResult> {
  ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file's structure" });
  const d = await diagnose(file);
  const no = unrepairable(d);
  if (no)
    throw new EngineError(
      "unsupported-input",
      no,
      "Try the original recording, if there is another copy.",
    );
  if (d.kind === "intact")
    throw new EngineError(
      "unsupported-input",
      "This file is complete: every frame its index lists is there.",
      "If it still will not play, convert it to MP4.",
    );
  if (ctx.signal.aborted) throw cancelled();
  if (d.kind === "unknown" || d.kind === "no-index")
    throw new EngineError("internal", "Unreachable.");
  const to: ContainerId = d.container;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? to;
  const outputName = `${baseName(file.name)}-repaired.${ext}`;
  const ffmpegCommand = `ffmpeg -err_detect ignore_err -i ${shellQuote(file.name)} -map 0 -c copy ${shellQuote(outputName)}`;

  if (d.kind === "fragments-cut") {
    const whole = new File([file.slice(0, d.keepBytes)], file.name, { type: file.type });
    const r = await remux({ file: whole, to, outputName, ffmpegCommand, ctx });
    if (!r)
      throw new EngineError(
        "unsupported-input",
        "The complete fragments could not be copied.",
        "Convert the file instead.",
      );
    return {
      ...r,
      meta: `complete part saved · ${formatBytes(file.size - d.keepBytes)} cut-off end left out · nothing re-encoded`,
    };
  }

  const clip = await openClip(file);
  try {
    let end = clip.end;
    if (d.kind === "truncated") {
      // The earliest presentation time of any sample not fully in the file, over all tracks.
      const boxes = await topBoxes(file);
      const moov = boxes.find((b) => b.type === "moov");
      if (!moov) throw new EngineError("internal", "The index went missing while reading.");
      const tables = sampleTables(
        new Uint8Array(await file.slice(moov.start, moov.start + moov.size).arrayBuffer()),
      );
      const tracks = [clip.video, clip.audio].filter((t) => t !== null);
      for (const t of tracks) {
        const table = tables.find((x) => x.id === t.id);
        if (!table) continue;
        const lead = completeLead(table, file.size);
        if (lead === table.offsets.length) continue;
        let k = 0;
        for await (const p of new EncodedPacketSink(t).packets(undefined, undefined, {
          metadataOnly: true,
        })) {
          if (k >= lead && p.timestamp < end) end = p.timestamp;
          k++;
        }
      }
    }
    if (!(end > clip.start))
      throw new EngineError(
        "unsupported-input",
        "Not one complete frame is left in this file.",
        "Try another copy of the recording.",
      );
    if (ctx.signal.aborted) throw cancelled();
    const r = await copyPackets(clip, { start: clip.start, end }, to, ctx, (ratio) =>
      ctx.onProgress({
        phase: "processing",
        ratio,
        detail: `${formatDuration(ratio * (end - clip.start))} of ${formatDuration(end - clip.start)} copied`,
      }),
    );
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    const recovered = Math.max(0, r.end - r.start);
    const stated = d.kind === "truncated" ? d.statedSec : 0;
    const secs = (x: number) => `${x.toFixed(1)}\u00a0s`;
    return {
      blob: r.blob,
      filename: outputName,
      ffmpegCommand,
      meta: [
        stated > 0 ? `${secs(recovered)} of ${secs(stated)} saved` : `${secs(recovered)} saved`,
        r.withAudio ? "nothing re-encoded" : "picture copied; the sound did not fit this container",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  } catch (e) {
    if (ctx.signal.aborted) throw cancelled();
    throw classifyError(e);
  } finally {
    clip.input.dispose();
  }
}

export const repairEngine: Engine<RepairOptions> = {
  id: "repair",
  backends: ["webcodecs"],
  optionsSchema: RepairOptions,
  async supports(backend) {
    return backend === "webcodecs" && typeof Blob !== "undefined";
  },
  async run(_backend, inputs, _options, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No file was given.", "Choose a file.");
    if (ctx.signal.aborted) throw cancelled();
    return repairFile(input.file, ctx);
  },
};
