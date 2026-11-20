"use client";

import { useId } from "react";
import { FadeTimeline } from "@/components/tool/timeline/fade-timeline";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, withUnit } from "@/lib/format";
import type { MediaInfo } from "@/tools/engines/types";
import { fadeOutStart } from "@/tools/engines/video-fade/math";
import {
  type FadeOptions,
  fadeIsNoop,
  fitFades,
  MAX_FADE,
} from "@/tools/engines/video-filter/options";
import {
  containerNote,
  needsFfmpeg,
  pictureContainer,
  pictureEstimate,
  soundLine,
  soundPlan,
  sourceName,
} from "@/tools/engines/video-filter/plan";
import { PLAY_SHORTCUT } from "../shortcuts";
import { pictureSize, sizeNote } from "./picture-size";
import { z } from "./remember-schema";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

const presets = [
  { value: "0", label: "None" },
  { value: "0.5", label: "0.5 s" },
  { value: "1", label: "1 s" },
  { value: "2", label: "2 s" },
  { value: "3", label: "3 s" },
] as const;

/** Longest fade either end for this clip: half of it, at most MAX_FADE. */
const longest = (info: MediaInfo) => Math.max(0, Math.min(MAX_FADE, info.durationSec / 2 - 0.05));

const seconds = (s: number) => withUnit(Number(s.toFixed(2)), "s");

function SecondsField({
  label,
  value,
  onChange,
  max,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  disabled?: boolean;
}) {
  const id = useId();
  const current = presets.find((p) => Math.abs(Number(p.value) - value) < 1e-6)?.value ?? "";
  return (
    <Field label={label} labelId={`${id}-l`} trailing="s">
      <div className="flex flex-col gap-2">
        <Segmented
          name={`${id}-presets`}
          aria-labelledby={`${id}-l`}
          value={current as (typeof presets)[number]["value"]}
          onChange={(v) => onChange(Math.min(max, Number(v)))}
          options={presets.filter((p) => Number(p.value) <= max + 1e-6)}
        />
        <NumberInput
          aria-label={`${label} in seconds`}
          min={0}
          max={max}
          step={0.1}
          value={Number(value.toFixed(2))}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n))
              onChange(Math.max(0, Math.min(max, n)));
          }}
        />
      </div>
    </Field>
  );
}

export const videoFadeSpec: OptionsSpec<FadeOptions> = {
  verb: "Add fade",
  previewResult: true,
  nextStep: { slug: "merge-videos", label: "Join with another clip" },
  shortcuts: [
    { keys: "← →", label: "Move a focused fade handle a tenth of a second" },
    { keys: "Shift ← →", label: "Move it one second" },
    PLAY_SHORTCUT,
  ],
  remember: { schema: z.object({ color: z.enum(["black", "white"]), audio: z.boolean() }) },
  defaults: (info, preset) => {
    const cap = longest(info);
    const num = (v: unknown, d: number) => Math.min(cap, typeof v === "number" ? v : d);
    return {
      fadeIn: num(preset.fadeIn, 1),
      fadeOut: num(preset.fadeOut, 1),
      color: preset.color === "white" ? "white" : "black",
      audio: preset.audio !== false,
    };
  },
  route: (_o, info, fileName) => (needsFfmpeg(info, fileName) ? "page" : "worker"),
  blocked: (o, info) => {
    if (!info.video)
      // Sound only: the audio fade page does this job.
      return info.audio?.length
        ? unfixable("This file has only sound. Fade it on the audio page.", {
            slug: "fade-audio",
            label: "Fade audio",
          })
        : unfixable("This file has no video track to fade. Choose a video file.");
    if (fadeIsNoop(o)) return "Both fades are at 0. Drag a handle or pick a length first.";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || fadeIsNoop(o)) return undefined;
    const est = pictureEstimate(info, v);
    const to = pictureContainer(sourceName(info));
    const hasSound = !!info.audio?.length;
    const sound =
      hasSound && o.audio
        ? soundLine("encode", true)
        : soundLine(needsFfmpeg(info, sourceName(info)) ? "encode" : soundPlan(info, to));
    const out = pictureSize(info);
    return `Output ${formatDimensions(out.width, out.height)}, ${est.label}.${sizeNote(info)} Every frame is re-encoded to H.264, the fades included. ${sound}${containerNote(info)}`;
  },
  result: (o, info) => {
    const { fadeIn, fadeOut } = fitFades(o, info.durationSec);
    const parts = [
      fadeIn > 0 ? `in over ${seconds(fadeIn)}` : "",
      fadeOut > 0 ? `out over ${seconds(fadeOut)} from ${fadeOutStart(o, info.durationSec)}` : "",
    ].filter(Boolean);
    return {
      title: `Fades ${parts.join(", ")}`,
      detail: `${o.color === "black" ? "From and to black." : "From and to white."} ${o.audio && info.audio?.length ? "The sound fades with the picture." : "The sound is unchanged."} The preview plays the result.`,
      change: false,
    };
  },
  Below({ value, onChange, info, media, disabled }) {
    return (
      <FadeTimeline
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        value={value}
        max={longest(info)}
        color={value.color}
        disabled={disabled}
        onChange={(r) => onChange({ ...value, ...r })}
      />
    );
  },
  Panel({ value, onChange, info, disabled }) {
    const colorId = useId();
    const cap = longest(info);
    const hasSound = !!info.audio?.length;
    return (
      <div className="flex flex-col gap-6">
        <SecondsField
          label="Fade in"
          value={value.fadeIn}
          max={cap}
          disabled={disabled}
          onChange={(fadeIn) => onChange({ ...value, fadeIn })}
        />
        <SecondsField
          label="Fade out"
          value={value.fadeOut}
          max={cap}
          disabled={disabled}
          onChange={(fadeOut) => onChange({ ...value, fadeOut })}
        />
        <Field
          label="Fade from and to"
          labelId={colorId}
          hint="Black is the usual start and end of a film; white suits bright, airy footage."
        >
          <Segmented
            name="fade-color"
            aria-labelledby={colorId}
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
            options={[
              { value: "black", label: "Black" },
              { value: "white", label: "White" },
            ]}
          />
        </Field>
        {hasSound ? (
          <Checkbox
            label="Fade the sound too"
            hint="Over the same seconds. Re-encodes the sound once to AAC; off keeps it as it is."
            checked={value.audio}
            onChange={(e) => onChange({ ...value, audio: e.target.checked })}
          />
        ) : (
          <p className="text-fg-muted text-sm">This video has no sound track.</p>
        )}
      </div>
    );
  },
};
