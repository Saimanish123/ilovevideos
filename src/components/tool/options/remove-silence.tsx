"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { withUnit } from "@/lib/format";
import {
  planCuts,
  type RemoveSilenceOptions,
  speechUsable,
} from "@/tools/engines/remove-silence/options";
import { suggestThreshold } from "@/tools/engines/sound/dsp/silence";
import { soundOutputFacts } from "@/tools/engines/sound/summary";
import { nameFor, soundTarget } from "@/tools/engines/sound/target";
import { soundCodecName, soundEncodersNow, writtenSoundCodec } from "@/tools/engines/sound-codec";
import { UnitField } from "../regions/percent-field";
import { PLAY_SHORTCUT } from "../shortcuts";
import { SilenceTimeline } from "../sound/silence-timeline";
import { SoundHero } from "../sound/sound-hero";
import { useSoundAnalysis } from "../sound/use-sound-analysis";
import { between, z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

const pauseOptions = [
  { value: "0.3", label: "0.3 s" },
  { value: "0.5", label: "0.5 s" },
  { value: "1", label: "1 s" },
  { value: "2", label: "2 s" },
] as const;
const detectOptions = [
  { value: "speech", label: "Speech" },
  { value: "level", label: "Loudness" },
] as const;
const paddingOptions = [
  { value: "0.05", label: "Tight" },
  { value: "0.15", label: "Natural" },
  { value: "0.3", label: "Loose" },
] as const;

function SilencePanel({ value, onChange, media }: OptionsPanelProps<RemoveSilenceOptions>) {
  const analysis = useSoundAnalysis(media.file, { levels: true, speech: true });
  const levels = analysis.result?.levels;
  const suggested = levels ? suggestThreshold(levels) : undefined;
  const threshold = value.thresholdDb ?? suggested;
  const speech = analysis.result?.speech;
  // The same plan the timeline and the engine make: whether it fell back to loudness is its answer.
  const plan =
    levels && analysis.result
      ? planCuts(value, levels, analysis.result.duration, speech)
      : undefined;
  // Speech asked for, too little of it in the file (music, a tone) or no model: the pauses come
  // from the level. The threshold stays on the timeline's line, so nothing jumps in the panel.
  const fellBack = value.detect === "speech" && plan !== undefined && plan.detect === "level";
  // What was heard, kept in the options for the ready line (the summary only sees the options).
  const heard: RemoveSilenceOptions["heard"] =
    analysis.status !== "done"
      ? undefined
      : speechUsable(speech)
        ? "speech"
        : speech?.length
          ? "little"
          : "none";
  useEffect(() => {
    if (heard && value.heard !== heard) onChange({ ...value, heard });
  }, [heard, value, onChange]);
  const detectId = useId();
  const pauseId = useId();
  const paddingId = useId();
  const thresholdId = useId();
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Find pauses by"
        labelId={detectId}
        hint={
          fellBack
            ? speech && speech.length > 0
              ? "Too little speech in this file, so pauses are found by loudness: drag the line on the timeline."
              : "The speech model could not be loaded, so pauses are found by loudness: drag the line on the timeline."
            : value.detect === "speech"
              ? "The gaps between words, found by a speech model, so noise or music under the voice does not hide them."
              : "Moments quieter than the threshold. Suits a quiet recording or a file without speech."
        }
      >
        <Segmented
          name="detect"
          aria-labelledby={detectId}
          value={value.detect}
          onChange={(v) => onChange({ ...value, detect: v })}
          options={[...detectOptions]}
        />
      </Field>
      {value.detect === "level" && (
        <Field
          label="Silence threshold"
          htmlFor={thresholdId}
          hint={
            value.thresholdDb === null
              ? "Suggested from this recording's background noise. Drag the line on the timeline, or type a level."
              : "Anything quieter than this, for long enough, is a pause. Higher cuts more."
          }
        >
          <div className="flex items-center gap-3">
            {threshold !== undefined && (
              <UnitField
                id={thresholdId}
                label="Silence threshold, dBFS"
                value={threshold}
                min={-70}
                max={-10}
                unit="dBFS"
                wide
                onCommit={(n) => onChange({ ...value, thresholdDb: Math.round(n) })}
              />
            )}
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
      )}
      <Field
        label="Shortest pause to cut"
        labelId={pauseId}
        hint="Shorter pauses are left alone. 0.5 s keeps the rhythm of speech; 0.3 s gives a fast jump-cut pace."
      >
        <Segmented
          name="min-silence"
          aria-labelledby={pauseId}
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
        labelId={paddingId}
        hint={`Keeps ${withUnit(Math.round(value.padding * 1000), "ms")} of each pause on both sides, so the start and end of words are not clipped.`}
      >
        <Segmented
          name="padding"
          aria-labelledby={paddingId}
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
  const analysis = useSoundAnalysis(media.file, { levels: true, speech: true });
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
  // Cut pauses shorten the timeline (ADR-0134).
  compare: false,
  shortcuts: [PLAY_SHORTCUT],
  route: () => "page",
  remember: {
    schema: z.object({
      detect: z.enum(["speech", "level"]),
      minSilence: between(0.1, 5),
      padding: between(0, 1),
      output: z.enum(["auto", "wav"]),
    }),
  },
  defaults: (_info, preset) => ({
    detect: preset.detect === "level" ? "level" : "speech",
    thresholdDb: typeof preset.thresholdDb === "number" ? preset.thresholdDb : null,
    minSilence: typeof preset.minSilence === "number" ? preset.minSilence : 0.5,
    padding: typeof preset.padding === "number" ? preset.padding : 0.15,
    output: "auto",
  }),
  blocked: (_o, info) => {
    if (!info.audio?.length)
      return unfixable(
        "This file has no sound, so there are no pauses to find. Choose a file with sound.",
      );
    const t = soundTarget(info, nameFor(info));
    if (t.kind === "none") return t.reason;
    return undefined;
  },
  summary: (o, info) =>
    [
      o.detect === "level"
        ? "by loudness"
        : o.heard === "little"
          ? "by loudness, too little speech"
          : o.heard === "none"
            ? "by loudness, no speech model"
            : "by speech",
      ...(info.video
        ? [
            "picture and sound re-encoded",
            `H.264, ${soundCodecName(writtenSoundCodec("mp4", soundEncodersNow()))} in MP4`,
          ]
        : soundOutputFacts(info, nameFor(info), soundEncodersNow())),
    ].join(" · "),
  result: () => ({ title: "Pauses removed", change: false }),
};
