"use client";

import { useCallback } from "react";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { withUnit } from "@/lib/format";
import { type AudioFadeOptions, MAX_FADE_SEC } from "@/tools/engines/audio-fade/options";
import { fadeGain, fitFades } from "@/tools/engines/sound/dsp/fade";
import { soundSummary } from "@/tools/engines/sound/summary";
import { nameFor, soundTarget } from "@/tools/engines/sound/target";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import { PLAY_SHORTCUT } from "../shortcuts";
import { FadeLayer } from "../sound/fade-layer";
import { SoundHero } from "../sound/sound-hero";
import { useSoundPreview } from "../sound/use-sound-preview";
import { z } from "./remember-schema";
import type { HeroProps, OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

const secs = (s: number) => withUnit((Math.round(s * 10) / 10).toFixed(1), "s");
/** The longest fade the controls offer for a sound this long: half of it, at most a minute. */
const maxFor = (duration: number) => Math.max(0.1, Math.min(MAX_FADE_SEC, duration / 2));
const clamp = (v: number, max: number) => Math.round(Math.min(max, Math.max(0, v)) * 10) / 10;

function FadeField({
  id,
  label,
  hint,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field
      label={label}
      labelId={`${id}-label`}
      trailing={value > 0 ? secs(value) : "Off"}
      hint={hint}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Slider
            aria-labelledby={`${id}-label`}
            min={0}
            max={max}
            step={0.1}
            value={Math.min(value, max)}
            onValueChange={(v) => onChange(clamp(v, max))}
            getAriaValueText={(_f, v) => (v > 0 ? secs(v) : "Off")}
          />
        </div>
        <div className="w-20 shrink-0">
          <NumberInput
            aria-label={`${label}, seconds`}
            min={0}
            max={max}
            step={0.1}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(n)) onChange(clamp(n, max));
            }}
          />
        </div>
      </div>
    </Field>
  );
}

function FadePanel({ value, onChange, info, media }: OptionsPanelProps<AudioFadeOptions>) {
  const duration = info.durationSec;
  const fitted = fitFades(value, duration);
  const gainAt = useCallback((t: number) => fadeGain(t, duration, fitted), [duration, fitted]);
  useSoundPreview(media.video, gainAt);
  const max = maxFor(duration);
  return (
    <div className="flex flex-col gap-6">
      <FadeField
        id="fade-in"
        label="Fade in"
        hint="From silence at the start up to full level."
        value={value.fadeIn}
        max={max}
        onChange={(fadeIn) => onChange({ ...value, fadeIn })}
      />
      <FadeField
        id="fade-out"
        label="Fade out"
        hint="From full level down to silence at the end."
        value={value.fadeOut}
        max={max}
        onChange={(fadeOut) => onChange({ ...value, fadeOut })}
      />
      <Field
        label="Shape"
        labelId="curve-label"
        hint={
          value.curve === "smooth"
            ? "Smooth holds the level longer and eases out, like a hand on a fader."
            : "Linear lowers the level evenly, which sounds quicker at the start."
        }
      >
        <Segmented
          name="curve"
          aria-labelledby="curve-label"
          value={value.curve}
          onChange={(curve) => onChange({ ...value, curve })}
          options={[
            { value: "smooth", label: "Smooth" },
            { value: "linear", label: "Linear" },
          ]}
        />
      </Field>
      <p className="text-fg-muted text-sm">
        Drag the handles on the waveform, or type the lengths. The preview plays with the fades.
      </p>
    </div>
  );
}

function FadeHero(props: HeroProps<AudioFadeOptions>) {
  const v = props.value;
  const editable = props.phase === "ready" && props.showing === "source" && props.onChange;
  return (
    <SoundHero
      {...props}
      stripLabel="The video's sound, with the fades drawn over it"
      layer={
        v && props.showing === "source"
          ? (duration) => (
              <FadeLayer
                fades={v}
                duration={duration}
                maxFade={maxFor(duration)}
                onChange={
                  editable
                    ? (f) => props.onChange?.({ ...v, fadeIn: f.fadeIn, fadeOut: f.fadeOut })
                    : undefined
                }
              />
            )
          : undefined
      }
    />
  );
}

/** A default that suits the length: 2 s in and 3 s out, shorter for a short clip. */
const fit = (want: number, duration: number) =>
  Math.round(Math.min(want, Math.max(0.1, duration * 0.2)) * 10) / 10;

export const audioFadeSpec: OptionsSpec<AudioFadeOptions> = {
  verb: "Fade",
  Panel: FadePanel,
  Hero: FadeHero,
  previewResult: true,
  // Level over time is the job: Before/After keeps it as it is (ADR-0136).
  compare: () => ({ what: "sound", keepLoudness: true }),
  shortcuts: [PLAY_SHORTCUT],
  route: () => "page",
  remember: {
    schema: z.object({ curve: z.enum(["smooth", "linear"]), output: z.enum(["auto", "wav"]) }),
  },
  defaults: (info, preset) => ({
    fadeIn: fit(typeof preset.fadeIn === "number" ? preset.fadeIn : 2, info.durationSec),
    fadeOut: fit(typeof preset.fadeOut === "number" ? preset.fadeOut : 3, info.durationSec),
    curve: preset.curve === "linear" ? "linear" : "smooth",
    output: "auto",
  }),
  blocked: (o, info) => {
    if (!info.audio?.length)
      return unfixable(
        "This file has no sound track, so there is nothing to fade. Choose a file with sound.",
      );
    const t = soundTarget(info, nameFor(info));
    if (t.kind === "none") return t.reason;
    if (o.fadeIn <= 0 && o.fadeOut <= 0)
      return "Both fades are off. Choose a fade-in or a fade-out.";
    return undefined;
  },
  summary: (o, info) => {
    const f = fitFades(o, info.durationSec);
    const parts = [
      f.fadeIn > 0 ? `in over ${secs(f.fadeIn)}` : "",
      f.fadeOut > 0 ? `out over ${secs(f.fadeOut)}` : "",
    ].filter(Boolean);
    const lead = parts.length ? `Fades ${parts.join(" and ")}. ` : "";
    return `${lead}${soundSummary(info, nameFor(info), soundEncodersNow()) ?? ""}`.trim();
  },
  result: (o, info) => {
    const f = fitFades(o, info.durationSec);
    const parts = [
      f.fadeIn > 0 ? `in over ${secs(f.fadeIn)}` : "",
      f.fadeOut > 0 ? `out over ${secs(f.fadeOut)}` : "",
    ].filter(Boolean);
    return {
      title: `Faded ${parts.join(" and ")}`,
      detail: info.video
        ? "The picture is untouched; only the sound fades. The preview plays the result."
        : "The preview plays the result.",
      change: false,
    };
  },
};
