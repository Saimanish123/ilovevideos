"use client";

import { Play, Square } from "lucide-react";
import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { type PitchOptions, shiftWords } from "@/tools/engines/pitch/options";
import { MAX_SEMITONES, MIN_SEMITONES, pitchRatio } from "@/tools/engines/sound/dsp/pitch";
import { soundOutputFacts } from "@/tools/engines/sound/summary";
import { nameFor, soundTarget } from "@/tools/engines/sound/target";
import { MoreOptions } from "../regions/more-options";
import { UnitField } from "../regions/percent-field";
import { PLAY_SHORTCUT } from "../shortcuts";
import { SoundHero } from "../sound/sound-hero";
import { AUDITION_SEC, usePitchAudition } from "../sound/use-pitch-audition";
import { z } from "./remember-schema";
import type { HeroProps, OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

const clampInt = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

function ShiftField({
  label,
  hint,
  value,
  min,
  max,
  unit,
  onChange,
  short,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  /** The unit inside the field: "st", "ct". */
  short: string;
  onChange: (v: number) => void;
}) {
  const fieldId = useId();
  const labelId = useId();
  return (
    <Field label={label} labelId={labelId} hint={hint}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Slider
            aria-labelledby={labelId}
            min={min}
            max={max}
            step={1}
            value={value}
            onValueChange={(v) => onChange(clampInt(v, min, max))}
            getAriaValueText={(_f, v) => `${signed(v)} ${unit}`}
          />
        </div>
        <UnitField
          id={fieldId}
          label={`${label}, ${unit}`}
          value={value}
          min={min}
          max={max}
          unit={short}
          onCommit={(v) => onChange(clampInt(v, min, max))}
        />
      </div>
    </Field>
  );
}

function PitchPanel({ value, onChange, media, disabled }: OptionsPanelProps<PitchOptions>) {
  const audition = usePitchAudition(media.file, media.video, value);
  const busy = audition.state === "rendering" || audition.state === "playing";
  // A run starting (the panel is disabled) ends the audition: nothing plays over the job.
  const stopAudition = audition.stop;
  useEffect(() => {
    if (disabled) stopAudition();
  }, [disabled, stopAudition]);
  return (
    <div className="flex flex-col gap-6">
      <ShiftField
        label="Semitones"
        hint="12 semitones is one octave. The length and tempo stay the same."
        value={value.semitones}
        min={MIN_SEMITONES}
        max={MAX_SEMITONES}
        unit="semitones"
        short="st"
        onChange={(semitones) => onChange({ ...value, semitones })}
      />
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => (busy ? audition.stop() : audition.start())}
          disabled={disabled || audition.state === "unavailable"}
        >
          {busy ? (
            <Square size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <Play size={16} strokeWidth={1.5} aria-hidden />
          )}
          {busy ? "Stop listening" : `Listen to ${AUDITION_SEC} s from the playhead`}
        </Button>
        {(audition.state === "unavailable" || audition.error) && (
          <p className="text-fg-muted text-xs" role="status">
            {audition.state === "unavailable"
              ? "This browser cannot play a preview; the result plays when it is done."
              : audition.error}
          </p>
        )}
      </div>
      <MoreOptions>
        <ShiftField
          label="Fine tune"
          hint="Cents are hundredths of a semitone, for a recording that is slightly sharp or flat."
          value={value.cents}
          min={-50}
          max={50}
          unit="cents"
          short="ct"
          onChange={(cents) => onChange({ ...value, cents })}
        />
      </MoreOptions>
    </div>
  );
}

function PitchHero(props: HeroProps<PitchOptions>) {
  return <SoundHero {...props} stripLabel="The video's sound" />;
}

export const pitchSpec: OptionsSpec<PitchOptions> = {
  verb: "Change pitch",
  Panel: PitchPanel,
  Hero: PitchHero,
  previewResult: true,
  // The sound is the job, also on a video: Before/After, matched in loudness (ADR-0136).
  compare: () => ({ what: "sound" }),
  shortcuts: [PLAY_SHORTCUT],
  route: () => "page",
  nextStep: { slug: "key-bpm-finder", label: "Check the new key" },
  remember: {
    schema: z.object({
      semitones: z.int().check(z.minimum(-12), z.maximum(12)),
      cents: z.int().check(z.minimum(-50), z.maximum(50)),
      output: z.enum(["auto", "wav"]),
    }),
  },
  defaults: (_info, preset) => ({
    semitones:
      typeof preset.semitones === "number"
        ? clampInt(preset.semitones, MIN_SEMITONES, MAX_SEMITONES)
        : 2,
    cents: typeof preset.cents === "number" ? clampInt(preset.cents, -50, 50) : 0,
    output: "auto",
  }),
  blocked: (o, info) => {
    if (!info.audio?.length)
      return unfixable(
        "This file has no sound track, so there is no pitch to change. Choose a file with sound.",
      );
    const t = soundTarget(info, nameFor(info));
    if (t.kind === "none") return t.reason;
    if (o.semitones === 0 && o.cents === 0)
      return "The shift is 0. Choose how many semitones up or down.";
    return undefined;
  },
  summary: (o, info) =>
    [
      shiftWords(o),
      `frequencies × ${pitchRatio(o.semitones, o.cents).toFixed(3)}`,
      ...soundOutputFacts(info, nameFor(info)),
    ].join(" · "),
  result: () => ({ title: "Pitch changed", change: false }),
};
