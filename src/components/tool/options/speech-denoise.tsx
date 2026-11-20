"use client";

import { Play, Square } from "lucide-react";
import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { withUnit } from "@/lib/format";
import { soundOutputFacts } from "@/tools/engines/sound/summary";
import { nameFor, soundTarget } from "@/tools/engines/sound/target";
import {
  MAX_MAKEUP_DB,
  type SpeechDenoiseOptions,
  strengthHint,
  strengthWords,
} from "@/tools/engines/speech-denoise/options";
import { UnitField } from "../regions/percent-field";
import { PLAY_SHORTCUT } from "../shortcuts";
import { SoundHero } from "../sound/sound-hero";
import { AUDITION_SEC, useSoundAudition } from "../sound/use-sound-audition";
import { z } from "./remember-schema";
import type { HeroProps, OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

const clampPct = (v: number) => Math.round(Math.min(100, Math.max(1, v)));

function DenoisePanel({
  value,
  onChange,
  media,
  disabled,
}: OptionsPanelProps<SpeechDenoiseOptions>) {
  const audition = useSoundAudition(media.file, media.video, {
    type: "denoise",
    strength: value.strength,
    keepLoudness: value.keepLoudness,
  });
  const rendering = audition.state === "rendering";
  const playing = audition.state === "playing";
  // A run starting (the panel is disabled) ends the audition: nothing plays over the job.
  const stopAudition = audition.stop;
  useEffect(() => {
    if (disabled) stopAudition();
  }, [disabled, stopAudition]);
  const labelId = useId();
  const fieldId = useId();
  return (
    <div className="flex flex-col gap-6">
      <Field label="Strength" labelId={labelId} hint={strengthHint(value.strength)}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Slider
              aria-labelledby={labelId}
              min={1}
              max={100}
              step={1}
              value={value.strength}
              onValueChange={(v) => onChange({ ...value, strength: clampPct(v) })}
              getAriaValueText={(_f, v) => `${v}%, ${strengthWords(v)}`}
              disabled={disabled}
            />
          </div>
          <UnitField
            id={fieldId}
            label="Strength, percent"
            value={value.strength}
            min={1}
            max={100}
            unit="%"
            onCommit={(v) => onChange({ ...value, strength: clampPct(v) })}
          />
        </div>
      </Field>
      <div className="flex flex-col gap-2">
        {/* While the few seconds are cleaned (the model downloads first, once) the label stays and
            a spinner takes the icon's place; a click then cancels. Only playback says "Stop". */}
        <Button
          onClick={() => (rendering || playing ? audition.stop() : audition.start())}
          disabled={disabled || audition.state === "unavailable"}
          aria-busy={rendering || undefined}
        >
          {rendering ? (
            <Spinner />
          ) : playing ? (
            <Square size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <Play size={16} strokeWidth={1.5} aria-hidden />
          )}
          {playing ? "Stop listening" : `Listen to ${AUDITION_SEC} s, cleaned`}
        </Button>
        <p className="text-fg-muted text-xs" role="status">
          {audition.state === "unavailable"
            ? "This browser cannot play a preview; the result plays when it is done."
            : (audition.error ?? "From the playhead, with these settings.")}
        </p>
      </div>
      <Checkbox
        label="Keep the original's loudness"
        hint={`Removing noise makes a file quieter. This brings it back to the level it had, up to ${withUnit(MAX_MAKEUP_DB, "dB")} louder, peaks held under −1 dBTP.`}
        checked={value.keepLoudness}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, keepLoudness: e.target.checked })}
      />
    </div>
  );
}

function DenoiseHero(props: HeroProps<SpeechDenoiseOptions>) {
  return <SoundHero {...props} stripLabel="The video's sound" />;
}

export const speechDenoiseSpec: OptionsSpec<SpeechDenoiseOptions> = {
  verb: "Remove noise",
  Panel: DenoisePanel,
  Hero: DenoiseHero,
  previewResult: true,
  // The sound is the job, also on a video: Before/After, matched in loudness (ADR-0136).
  compare: () => ({ what: "sound" }),
  shortcuts: [PLAY_SHORTCUT],
  route: () => "page",
  remember: {
    schema: z.object({
      strength: z.int().check(z.minimum(1), z.maximum(100)),
      keepLoudness: z.boolean(),
      output: z.enum(["auto", "wav"]),
    }),
  },
  defaults: (_info, preset) => ({
    strength: typeof preset.strength === "number" ? clampPct(preset.strength) : 100,
    keepLoudness: preset.keepLoudness !== false,
    output: "auto",
  }),
  blocked: (_o, info) => {
    if (!info.audio?.length)
      return unfixable(
        "This file has no sound track, so there is no noise to remove. Choose a file with sound.",
      );
    const t = soundTarget(info, nameFor(info));
    if (t.kind === "none") return t.reason;
    return undefined;
  },
  summary: (o, info) =>
    [
      strengthWords(o.strength),
      o.keepLoudness ? "loudness kept" : "",
      ...soundOutputFacts(info, nameFor(info)),
    ]
      .filter(Boolean)
      .join(" · "),
  result: (_o, info) => ({
    title: "Noise removed",
    change: false,
    next: {
      slug: info.video ? "remove-silence-from-video" : "remove-silence-from-audio",
      label: "Cut the pauses",
    },
  }),
};
