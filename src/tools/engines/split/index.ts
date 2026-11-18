import { z } from "zod";
import { baseName, formatDuration, shellQuote } from "@/lib/format";
import { EngineError } from "../errors";
import { listKeyframes } from "../mediabunny/keyframes";
import { canEncodeAvc, convert, pictureDecodes } from "../mediabunny/shared";
import { containerFor } from "../trim";
import type { Engine, EngineOutputFile } from "../types";
import { splitCopy } from "./copy";
import {
  cutPoints,
  MAX_PARTS,
  partDigits,
  partFileNames,
  partMeta,
  partName,
  partsFrom,
} from "./math";

export const SplitOptions = z.object({
  /** How the cut points are chosen: N equal parts, every N seconds, or at the user's markers. */
  mode: z.enum(["equal", "every", "points"]).default("equal"),
  parts: z.number().int().min(2).max(MAX_PARTS).default(2),
  every: z.number().min(1).max(86_400).default(30),
  /** Marker times in seconds (mode "points"). */
  points: z
    .array(z.number().min(0))
    .max(MAX_PARTS - 1)
    .default([]),
  /** Frame-accurate cuts re-encode the video; the default cuts on key frames without re-encoding. */
  precise: z.boolean().default(false),
  /** Optional file name per part, by position; blank uses "<name>-part-01". */
  names: z.array(z.string().max(200)).max(MAX_PARTS).default([]),
});
export type SplitOptions = z.infer<typeof SplitOptions>;

export const splitEngine: Engine<SplitOptions> = {
  id: "split",
  backends: ["webcodecs"],
  optionsSchema: SplitOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    // A lossless cut copies the picture; only a frame-accurate one decodes it.
    if (!options.precise) return true;
    if (!pictureDecodes(input.info)) return false;
    const v = input.info?.video;
    return canEncodeAvc(v?.width, v?.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    if (!input) throw new Error("No input file");
    const { file, info } = input;
    const duration = info?.durationSec ?? 0;
    const fps = info?.video?.fps ?? 30;
    if (!(duration > 0)) {
      throw new EngineError(
        "unsupported-input",
        "This file does not report a duration, so it cannot be split.",
        "Convert it to MP4 first, then split the result.",
      );
    }

    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Finding key frames" });
    // The engine snaps on its own reading of the file; the page showed the same list from inspection.
    // Page times run from the file's start; the file's own may not (MPEG-TS: about 1.4 s).
    const t0 = info?.startSec ?? 0;
    const keyframes = options.precise
      ? undefined
      : (info?.video?.keyframes ??
        (info?.video ? (await listKeyframes(file)).map((k) => k - t0) : undefined));
    // Audio-only files have no key frames to respect: every packet is a valid cut, so snap to frames.
    const precise = options.precise || !info?.video;
    const points = cutPoints({ ...options, precise }, duration, { fps, keyframes });
    const parts = partsFrom(points, duration);
    if (parts.length < 2) {
      throw new EngineError(
        "unsupported-input",
        "These cut points leave only one part.",
        options.precise
          ? "Move a marker away from the start and end."
          : "The video has too few key frames there. Turn on frame-accurate cuts, or move the markers.",
      );
    }

    const to = containerFor(file.name);
    const names = partFileNames(file.name, parts.length, to, options.names);
    const report = (i: number, ratio: number) => {
      const part = parts[i];
      if (!part) return;
      const at = part.start + ratio * (part.end - part.start);
      ctx.onProgress({
        phase: "processing",
        ratio: Math.min(1, at / duration),
        detail: `Part ${i + 1} of ${parts.length} · ${formatDuration(at)} of ${formatDuration(duration)}`,
        item: { index: i, count: parts.length },
      });
    };
    const files: EngineOutputFile[] = [];
    if (!options.precise && info?.video) {
      // Lossless: a packet copy between key frames (see ./copy for why not Conversion).
      const blobs = await splitCopy(
        file,
        parts.map((part, i) => ({ part, onProgress: (r) => report(i, r) })),
        to,
        ctx,
        t0,
      );
      blobs.forEach((blob, i) => {
        const part = parts[i];
        if (part)
          files.push({
            blob,
            filename: names[i] ?? partName(file.name, i, parts.length, to),
            meta: partMeta(part),
          });
      });
    } else {
      for (const [i, part] of parts.entries()) {
        if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        const filename = names[i] ?? partName(file.name, i, parts.length, to);
        const result = await convert({
          file,
          to,
          outputName: filename,
          // The first part starts at the file's own start; the last runs to its real end.
          trim: {
            start: part.start + t0,
            end: i === parts.length - 1 ? undefined : part.end + t0,
          },
          video: { forceTranscode: true },
          ffmpegCommand: "",
          ctx: {
            signal: ctx.signal,
            onProgress: (p) => {
              if (p.phase === "processing") report(i, p.ratio);
            },
          },
        });
        files.push({ blob: result.blob, filename, meta: partMeta(part) });
      }
    }
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the parts" });

    const times = points.map((t) => t.toFixed(3)).join(",");
    const pattern = shellQuote(`${baseName(file.name)}-part-%0${partDigits(parts.length)}d.${to}`);
    const ffmpegCommand = options.precise
      ? `ffmpeg -i ${shellQuote(file.name)} -c:v libx264 -crf 18 -force_key_frames ${times} -c:a aac -f segment -segment_times ${times} -reset_timestamps 1 -segment_start_number 1 ${pattern}`
      : `ffmpeg -i ${shellQuote(file.name)} -map 0 -c copy -f segment -segment_times ${times} -reset_timestamps 1 -segment_start_number 1 ${pattern}`;
    const first = files[0];
    if (!first) throw new EngineError("internal", "The split produced no files.", "Try again.");
    return {
      blob: first.blob,
      filename: first.filename,
      files,
      ffmpegCommand,
      meta: `${parts.length} parts · ${options.precise ? "re-encoded, frame-accurate" : "streams copied"}`,
    };
  },
};
