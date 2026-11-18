"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, formatDuration } from "@/lib/format";
import type { MergeOptions } from "@/tools/engines/merge";
import { MAX_CLIPS, type MergeClip, planMerge, unusableClip } from "@/tools/engines/merge/plan";
import { undecodablePicture } from "./decodable";
import type { OptionsSpec, StageInput } from "./types";

const clipsOf = (inputs: StageInput[] = []): MergeClip[] =>
  inputs.map((i) => ({ name: i.file.name, info: i.info }));

export const mergeSpec: OptionsSpec<MergeOptions> = {
  verb: "Merge",
  multiple: { min: 2, max: MAX_CLIPS },
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress the merged video" },
  defaults: () => ({ reencode: false, fit: "contain" }),
  result: (o, _info, { inputs }) => {
    const clips = clipsOf(inputs);
    if (clips.length < 2) return undefined;
    const plan = planMerge(clips, o);
    const total = clips.reduce((sum, c) => sum + c.info.durationSec, 0);
    return {
      title: `${clips.length} clips joined: ${formatDuration(total)}`,
      detail: plan.copy
        ? "Lossless: the streams were copied, not re-encoded."
        : `Re-encoded to H.264 at ${formatDimensions(plan.width, plan.height)}.`,
    };
  },
  blocked: (_o, _info, inputs) => {
    const clips = clipsOf(inputs);
    if (clips.length < 2) return "Add at least one more video to merge.";
    return unusableClip(clips) ?? undecodablePicture(...clips.map((c) => c.info));
  },
  summary: (o, _info, inputs) => {
    const clips = clipsOf(inputs);
    if (clips.length < 2) return undefined;
    const plan = planMerge(clips, o);
    const frame = formatDimensions(plan.width, plan.height);
    if (plan.copy)
      return `Lossless: the ${clips.length} clips share codec, frame size and sound, so they are joined without re-encoding.`;
    if (plan.reasons.length === 0)
      return `Every clip is re-encoded to H.264 at ${frame}, as you asked.`;
    const fit =
      o.fit === "contain"
        ? "clips of another shape get black bars"
        : "clips of another shape are cropped to fill";
    return `Re-encodes. ${plan.reasons[0]} The joined video is H.264 at ${frame}; ${fit}.`;
  },
  inputNotes: (o, inputs) => {
    const plan = planMerge(clipsOf(inputs), o);
    return inputs.map((input, i) =>
      !input.info.video
        ? "No video track: remove this file."
        : plan.culprits.includes(i)
          ? "Differs from clip 1, so the merge re-encodes."
          : undefined,
    );
  },
  Panel({ value, onChange, media }) {
    const fitId = useId();
    const clips = clipsOf(media.inputs);
    const plan = planMerge(clips, { reencode: false });
    const frame = formatDimensions(plan.width, plan.height);
    const reencoding = !plan.copy || value.reencode;
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm">
          The clips play in list order. The first clip sets the frame: {frame}.
          <span className="text-fg-muted"> Move another clip to the top to use its size.</span>
        </p>
        {reencoding && plan.reasons.length > 0 && (
          <Field
            label="Clips of another shape"
            labelId={fitId}
            hint="Black bars keep every picture whole. Crop fills the frame and trims the edges that do not fit."
          >
            <Segmented
              name="merge-fit"
              aria-labelledby={fitId}
              value={value.fit}
              onChange={(fit) => onChange({ ...value, fit })}
              options={[
                { value: "contain", label: "Black bars" },
                { value: "cover", label: "Crop to fill" },
              ]}
            />
          </Field>
        )}
        {plan.copy && (
          <Checkbox
            label="Re-encode anyway"
            hint={`Only needed if a player stutters at a join. Every clip is re-encoded to H.264 at ${frame}, which is slower and costs a little quality.`}
            checked={value.reencode}
            onChange={(e) => onChange({ ...value, reencode: e.target.checked })}
          />
        )}
      </div>
    );
  },
};
