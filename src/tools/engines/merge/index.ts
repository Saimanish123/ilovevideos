import { z } from "zod";
import { baseName, formatDimensions, formatDuration, shellQuote } from "@/lib/format";
import { EngineError } from "../errors";
import { type ContainerId, canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import { containerFor } from "../trim";
import type { Engine } from "../types";
import { concatCopy, configMismatch, type OpenClip, openClip } from "./concat";
import { MAX_CLIPS, type MergeClip, planMerge, unusableClip } from "./plan";
import { concatReencode } from "./reencode";

export const MergeOptions = z.object({
  /** Re-encode even when the clips could be joined as they are (e.g. to even out a stutter at a join). */
  reencode: z.boolean().default(false),
  /** When re-encoding, how a clip of another shape fits the first clip's frame. */
  fit: z.enum(["contain", "cover"]).default("contain"),
});
export type MergeOptions = z.infer<typeof MergeOptions>;

const mergedName = (first: string, ext: string) => `${baseName(first)}-merged.${ext}`;

/** ffmpeg equivalents: the concat demuxer for a copy, the concat filter for a re-encode. */
export function mergeCommand(
  names: string[],
  out: string,
  plan: { copy: boolean; width: number; height: number; fit: "contain" | "cover" },
  audio: { sampleRate: number; channels: number; hasAudio: boolean[] } | null,
): string {
  if (plan.copy) {
    const list = names.map((n) => `file '${n.replace(/'/g, "'\\''")}'`).join("\\n");
    return `printf "${list}\\n" > list.txt && ffmpeg -f concat -safe 0 -i list.txt -c copy ${shellQuote(out)}`;
  }
  const { width: w, height: h } = plan;
  const fit =
    plan.fit === "contain"
      ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const parts: string[] = [];
  const pads: string[] = [];
  names.forEach((_, i) => {
    parts.push(`[${i}:v]${fit},setsar=1[v${i}]`);
    if (audio) {
      const layout = audio.channels === 1 ? "mono" : "stereo";
      parts.push(
        audio.hasAudio[i]
          ? `[${i}:a]aresample=${audio.sampleRate},aformat=channel_layouts=${layout}[a${i}]`
          : `anullsrc=r=${audio.sampleRate}:cl=${layout},atrim=duration=<length of clip ${i + 1}>[a${i}]`,
      );
      pads.push(`[v${i}][a${i}]`);
    } else pads.push(`[v${i}]`);
  });
  const concat = `${pads.join("")}concat=n=${names.length}:v=1:a=${audio ? 1 : 0}${audio ? "[v][a]" : "[v]"}`;
  const inputs = names.map((n) => `-i ${shellQuote(n)}`).join(" ");
  const maps = audio ? `-map "[v]" -map "[a]"` : `-map "[v]"`;
  return `ffmpeg ${inputs} -filter_complex "${[...parts, concat].join(";")}" ${maps} -c:v libx264 -crf 18 ${audio ? "-c:a aac " : ""}-movflags +faststart ${shellQuote(out)}`;
}

export const mergeEngine: Engine<MergeOptions> = {
  id: "merge",
  backends: ["webcodecs"],
  optionsSchema: MergeOptions,
  async supports(backend, input, options, inputs) {
    if (backend !== "webcodecs") return false;
    const all = inputs ?? [input];
    const clips = all.flatMap((i) => (i.info ? [{ name: i.file.name, info: i.info }] : []));
    const plan = planMerge(clips, options);
    // A lossless join copies every picture; a re-encode has to decode them all.
    if (!plan.copy && !pictureDecodes(...all.map((i) => i.info))) return false;
    // A stream copy needs no encoder. The copy may still be refused later on the codec configuration
    // bytes, in which case run() checks the encoder itself and says so.
    return plan.copy || canEncodeAvc(plan.width, plan.height);
  },
  async run(_backend, inputs, options, ctx) {
    if (inputs.length < 2)
      throw new EngineError("unsupported-input", "Add at least two videos to merge.");
    if (inputs.length > MAX_CLIPS)
      throw new EngineError(
        "resource",
        `This tool joins up to ${MAX_CLIPS} clips at a time.`,
        "Merge them in groups, then merge the results.",
      );
    const facts: MergeClip[] = inputs.map((i) => ({
      name: i.file.name,
      info: i.info ?? { container: "", durationSec: 0, sizeBytes: i.file.size },
    }));
    const unusable = unusableClip(facts);
    if (unusable) throw new EngineError("unsupported-input", unusable);

    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the clips" });
    const clips: OpenClip[] = [];
    try {
      for (const i of inputs) clips.push(await openClip(i.file));
      const plan = planMerge(facts, options);
      const names = inputs.map((i) => i.file.name);
      const first = names[0] ?? "video.mp4";
      let to: ContainerId = containerFor(first);
      let reason = plan.reasons[0];
      let copy = plan.copy;
      if (copy) {
        const mismatch = configMismatch(clips, to);
        if (mismatch?.startsWith("The ")) {
          // The first clip's container cannot hold the codec; MP4 or MKV usually can.
          to = configMismatch(clips, "mp4")?.startsWith("The ") ? "mkv" : "mp4";
        }
        const again = configMismatch(clips, to);
        if (again) {
          copy = false;
          reason = again;
        }
      }
      const total = clips.reduce((s, c) => s + (c.end - c.start), 0);

      if (copy) {
        const filename = mergedName(first, to);
        const blob = await concatCopy(clips, to, ctx);
        return {
          blob,
          filename,
          meta: `${clips.length} clips · ${formatDuration(total)} · streams copied`,
          ffmpegCommand: mergeCommand(
            names,
            filename,
            { ...plan, copy: true, fit: options.fit },
            null,
          ),
        };
      }

      if (!(await canEncodeAvc(plan.width, plan.height)))
        throw new EngineError(
          "unsupported-output",
          `${reason ?? "The clips differ"} Joining them means re-encoding, and this browser cannot encode H.264 at ${formatDimensions(plan.width, plan.height)}.`,
          "Try desktop Chrome, Edge or Safari 17.4 or newer.",
        );
      const filename = mergedName(first, "mp4");
      const { blob, audioCodec } = await concatReencode(
        clips,
        { width: plan.width, height: plan.height, fit: options.fit },
        ctx,
      );
      const withAudio = clips.filter((c) => c.audio);
      return {
        blob,
        filename,
        // When only the configuration bytes differed, the page predicted a copy: say why it re-encoded.
        meta: `${clips.length} clips · ${formatDuration(total)} · re-encoded at ${formatDimensions(plan.width, plan.height)}${audioCodec === "opus" ? ", Opus sound" : ""}${plan.copy ? " (the clips were encoded with different settings)" : ""}`,
        ffmpegCommand: mergeCommand(
          names,
          filename,
          { ...plan, copy: false, fit: options.fit },
          withAudio.length > 0
            ? {
                sampleRate: withAudio[0]?.audio?.sampleRate ?? 48_000,
                channels: Math.min(
                  2,
                  Math.max(...withAudio.map((c) => c.audio?.numberOfChannels ?? 2)),
                ),
                hasAudio: clips.map((c) => !!c.audio),
              }
            : null,
        ),
      };
    } finally {
      for (const c of clips) c.input.dispose();
    }
  },
};
