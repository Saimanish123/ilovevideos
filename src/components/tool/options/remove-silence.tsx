"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { withUnit } from "@/lib/format";
import type { RemoveSilenceOptions } from "@/tools/engines/remove-silence/options";
import { suggestThreshold } from "@/tools/engines/sound/dsp/silence";
import { soundSummary } from "@/tools/engines/sound/summary";
import { nameFor, soundTarget } from "@/tools/engines/sound/target";
import { PLAY_SHORTCUT } from "../shortcuts";
import { SilenceTimeline } from "../sound/silence-timeline";
import { SoundHero } from "../sound/sound-hero";
import { useSoundAnalysis } from "../sound/use-sound-analysis";
import type { OptionsPanelProps, OptionsSpec } from "./types";

const pauseOptions = [
  { value: "0.3", label: "0.3 s" },
  { value: "0.5", label: "0.5 s" },
  { value: "1", label: "1 s" },
  { value: "2", label: "2 s" },
] as const;
const paddingOptions = [
  { value: "0.05", label: "Tight" },
  { value: "0.15", label: "Natural" },
  { value: "0.3", label: "Loose" },
] as const;

function SilencePanel({ value, onChange, media }: OptionsPanelProps<RemoveSilenceOptions>) {
  const analysis = useSoundAnalysis(media.file, { levels: true });
  const levels = analysis.result?.levels;
  const suggested = levels ? suggestThreshold(levels) : undefined;
  const threshold = value.thresholdDb ?? suggested;
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Silence threshold"
        htmlFor="threshold"
        trailing={threshold !== undefined ? withUnit(threshold, "dBFS") : undefined}
        hint={
          value.thresholdDb === null
            ? "Suggested from this recording's background noise. Drag the line on the timeline, or type a level."
            : "Anything quieter than this, for long enough, is a pause. Higher cuts more."
        }
      >
        <div className="flex items-center gap-3">
          <div className="w-24 shrink-0">
            <NumberInput
              id="threshold"
              min={-70}
              max={-10}
              step={1}
              value={threshold ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n))
                  onChange({ ...value, thresholdDb: Math.round(Math.min(-10, Math.max(-70, n))) });
              }}
            />
          </div>
          {value.thresholdDb !== null && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => onChange({ ...value, thresholdDb: null })}
            >
              Use suggested
            </Button>
          )}
        </div>
      </Field>
      <Field
        label="Shortest pause to cut"
        labelId="pause-label"
        hint="Shorter pauses are left alone. 0.5 s keeps the rhythm of speech; 0.3 s gives a fast jump-cut pace."
      >
        <Segmented
          name="min-silence"
          aria-labelledby="pause-label"
          value={
            (pauseOptions.find((p) => Number(p.value) === value.minSilence)?.value ??
              "0.5") as (typeof pauseOptions)[number]["value"]
          }
          onChange={(v) => onChange({ ...value, minSilence: Number(v) })}
          options={[...pauseOptions]}
        />
      </Field>
      <Field
        label="Room around words"
        labelId="padding-label"
        hint={`Keeps ${withUnit(Math.round(value.padding * 1000), "ms")} of each pause on both sides, so the start and end of words are not clipped.`}
      >
        <Segmented
          name="padding"
          aria-labelledby="padding-label"
          value={
            (paddingOptions.find((p) => Number(p.value) === value.padding)?.value ??
              "0.15") as (typeof paddingOptions)[number]["value"]
          }
          onChange={(v) => onChange({ ...value, padding: Number(v) })}
          options={[...paddingOptions]}
        />
      </Field>
      <p className="text-fg-muted text-sm">The preview skips the marked pauses while it plays.</p>
    </div>
  );
}

function SilenceBelow({
  value,
  onChange,
  media,
  disabled,
}: OptionsPanelProps<RemoveSilenceOptions>) {
  const analysis = useSoundAnalysis(media.file, { levels: true });
  return (
    <SilenceTimeline
      analysis={analysis}
      value={value}
      onChange={onChange}
      disabled={disabled}
      media={media.video}
    />
  );
}

export const removeSilenceSpec: OptionsSpec<RemoveSilenceOptions> = {
  verb: "Remove silence",
  Panel: SilencePanel,
  Below: SilenceBelow,
  Hero: (props) => <SoundHero {...props} noStrip />,
  previewResult: true,
  shortcuts: [PLAY_SHORTCUT],
  route: () => "page",
  defaults: (_info, preset) => ({
    thresholdDb: typeof preset.thresholdDb === "number" ? preset.thresholdDb : null,
    minSilence: typeof preset.minSilence === "number" ? preset.minSilence : 0.5,
    padding: typeof preset.padding === "number" ? preset.padding : 0.15,
    output: "auto",
  }),
  blocked: (_o, info) => {
    if (!info.audio?.length) return "This file has no sound, so there are no pauses to find.";
    const t = soundTarget(info, nameFor(info));
    if (t.kind === "none") return t.reason;
    return undefined;
  },
  summary: (_o, info) =>
    info.video
      ? "Picture and sound are cut at the same frames and re-encoded, to H.264 and AAC in an MP4."
      : soundSummary(info, nameFor(info)),
  result: (o, info) => ({
    title: "Pauses removed",
    detail: [
      `The cuts follow the timeline you saw, with ${withUnit(Math.round(o.padding * 1000), "ms")} kept around each word.`,
      info.video ? "The picture was re-encoded." : "",
      "The preview plays the result.",
    ]
      .filter(Boolean)
      .join(" "),
    change: false,
  }),
};
