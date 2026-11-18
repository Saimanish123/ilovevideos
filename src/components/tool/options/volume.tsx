"use client";

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { formatLevel, fromDb } from "@/tools/engines/sound/dsp/loudness";
import { soundSummary } from "@/tools/engines/sound/summary";
import { nameFor, soundTarget } from "@/tools/engines/sound/target";
import {
  gainPresets,
  loudnessTargets,
  planGain,
  type VolumeOptions,
} from "@/tools/engines/volume/options";
import { PLAY_SHORTCUT } from "../shortcuts";
import { LoudnessReadout } from "../sound/loudness-readout";
import { SoundHero } from "../sound/sound-hero";
import { useSoundAnalysis } from "../sound/use-sound-analysis";
import { useSoundPreview } from "../sound/use-sound-preview";
import type { OptionsPanelProps, OptionsSpec } from "./types";

const GAIN_MIN = -20;
const GAIN_MAX = 20;
const clampGain = (v: number) => Math.round(Math.min(GAIN_MAX, Math.max(GAIN_MIN, v)) * 2) / 2;
const db = (v: number) => formatLevel(v, "dB");

type GainChoice = `${(typeof gainPresets)[number]}` | "custom";
const gainOptions = [
  ...gainPresets.map((g) => ({ value: String(g) as GainChoice, label: db(g).replace(".0", "") })),
];
const gainChoice = (v: number): GainChoice =>
  (gainPresets as readonly number[]).includes(v) ? (String(v) as GainChoice) : "custom";

type TargetChoice = `${(typeof loudnessTargets)[number]["value"]}` | "custom";
const targetOptions = loudnessTargets.map((t) => ({
  value: String(t.value) as TargetChoice,
  label: `${t.label} LUFS`,
}));
const ceilingOptions = [
  { value: "-1", label: "−1 dBTP" },
  { value: "-2", label: "−2 dBTP" },
] as const;

/** In words: what a gain does to how loud it sounds (about +10 dB is heard as twice as loud). */
function gainWords(g: number): string {
  if (Math.abs(g) < 0.05) return "No change.";
  const heard = 2 ** (g / 10);
  const word = g > 0 ? "louder" : "quieter";
  const factor = g > 0 ? heard : 1 / heard;
  return `Sounds roughly ${factor.toFixed(1)}× ${word}.`;
}

function VolumePanel({ value, onChange, info, media, preset }: OptionsPanelProps<VolumeOptions>) {
  const analysis = useSoundAnalysis(media.file);
  const before = analysis.result?.loudness;
  const plan = before ? planGain(value, before) : undefined;
  // The preview plays at the planned gain (limiter stand-in included), from the first play on.
  const gain = plan?.gainDb ?? (value.mode === "gain" ? value.gainDb : 0);
  const gainAt = useCallback(() => fromDb(gain), [gain]);
  useSoundPreview(media.video, gainAt);
  const normalize = value.mode === "normalize";
  const lockedMode = preset.mode === "normalize" || preset.mode === "gain";
  const after =
    plan && before
      ? {
          integrated: plan.expected,
          truePeak: plan.limiter ? value.ceiling : plan.peakBefore,
          limited: plan.limiter,
        }
      : undefined;
  const afterNote = !plan
    ? undefined
    : plan.heldByPeaks
      ? `Stops ${db(Math.abs(value.target - plan.expected))} short of the target: without the limiter, the peaks set the ceiling.`
      : plan.limiter
        ? `Peaks over ${formatLevel(value.ceiling, "dBTP")} are held down by the limiter, by up to about ${db(plan.peakBefore - value.ceiling).replace("+", "")}. The result states what it measured.`
        : normalize
          ? `${gainWords(plan.gainDb).replace("Sounds", "Plays")} The gain is ${db(plan.gainDb)}.`
          : undefined;

  return (
    <div className="flex flex-col gap-6">
      {!lockedMode && (
        <Field label="Job" labelId="mode-label">
          <Segmented
            name="mode"
            aria-labelledby="mode-label"
            value={value.mode}
            onChange={(mode) => onChange({ ...value, mode })}
            options={[
              { value: "gain", label: "Change volume" },
              { value: "normalize", label: "Normalise" },
            ]}
          />
        </Field>
      )}
      {normalize ? (
        <Field
          label="Target loudness"
          labelId="target-label"
          hint={
            loudnessTargets.find((t) => t.value === value.target)?.note ??
            "Integrated loudness, EBU R128."
          }
        >
          <Segmented
            name="target"
            aria-labelledby="target-label"
            value={
              targetOptions.some((t) => t.value === String(value.target))
                ? (String(value.target) as TargetChoice)
                : ("custom" as TargetChoice)
            }
            onChange={(t) => onChange({ ...value, target: Number(t) })}
            options={targetOptions}
          />
        </Field>
      ) : (
        <Field
          label="Volume"
          labelId="gain-label"
          trailing={db(value.gainDb)}
          hint={`${gainWords(value.gainDb)} +6 dB doubles the height of the wave; about +10 dB is heard as twice as loud.`}
        >
          <div className="flex flex-col gap-3">
            <Segmented
              name="gain"
              aria-labelledby="gain-label"
              value={gainChoice(value.gainDb)}
              onChange={(g) => g !== "custom" && onChange({ ...value, gainDb: Number(g) })}
              options={gainOptions}
            />
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Slider
                  aria-label="Volume change in decibels"
                  min={GAIN_MIN}
                  max={GAIN_MAX}
                  step={0.5}
                  value={value.gainDb}
                  onValueChange={(v) => onChange({ ...value, gainDb: clampGain(v) })}
                  getAriaValueText={(_f, v) => db(v)}
                />
              </div>
              <div className="w-20 shrink-0">
                <NumberInput
                  aria-label="Volume change, dB"
                  min={GAIN_MIN}
                  max={GAIN_MAX}
                  step={0.5}
                  value={value.gainDb}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (e.target.value !== "" && Number.isFinite(n))
                      onChange({ ...value, gainDb: clampGain(n) });
                  }}
                />
              </div>
            </div>
          </div>
        </Field>
      )}
      <LoudnessReadout analysis={analysis} after={after} afterNote={afterNote} />
      {normalize ? (
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-fg-muted hover:text-fg">
            More options
          </summary>
          <div className="mt-3 flex flex-col gap-6">
            <Field
              label="Peak ceiling"
              labelId="ceiling-label"
              hint="The highest the true peak may reach. −1 dBTP leaves room for lossy encoders; −2 is safer for MP3 at low bitrates."
            >
              <Segmented
                name="ceiling"
                aria-labelledby="ceiling-label"
                value={String(value.ceiling) as "-1" | "-2"}
                onChange={(c) => onChange({ ...value, ceiling: Number(c) })}
                options={[...ceilingOptions]}
              />
            </Field>
            <Checkbox
              label="Limit peaks"
              hint="Off: nothing is limited, and the gain stops where the loudest peak meets the ceiling."
              checked={value.limit}
              onChange={(e) => onChange({ ...value, limit: e.target.checked })}
            />
          </div>
        </details>
      ) : (
        <Checkbox
          label="Prevent clipping"
          hint={`A limiter holds peaks at ${formatLevel(value.ceiling, "dBTP")}, so a boost does not distort. It does nothing below that.`}
          checked={value.limit}
          onChange={(e) => onChange({ ...value, limit: e.target.checked })}
        />
      )}
      {info.video && <p className="text-fg-muted text-sm">The preview plays at the new volume.</p>}
    </div>
  );
}

const isMode = (v: unknown): v is VolumeOptions["mode"] => v === "gain" || v === "normalize";

export const volumeSpec: OptionsSpec<VolumeOptions> = {
  verb: "Change volume",
  Panel: VolumePanel,
  Hero: (props) => <SoundHero {...props} stripLabel="The video's sound, as a waveform" />,
  previewResult: true,
  shortcuts: [PLAY_SHORTCUT],
  route: () => "page",
  defaults: (_info, preset) => ({
    mode: isMode(preset.mode) ? preset.mode : "gain",
    gainDb: typeof preset.gainDb === "number" ? preset.gainDb : 6,
    target: typeof preset.target === "number" ? preset.target : -16,
    limit: true,
    ceiling: -1,
    output: "auto",
  }),
  blocked: (o, info) => {
    const t = soundTarget(info, nameFor(info));
    if (!info.audio?.length)
      return "This file has no sound track, so there is no volume to change.";
    if (t.kind === "none") return t.reason;
    if (o.mode === "gain" && Math.abs(o.gainDb) < 0.05)
      return "0 dB leaves the sound as it is. Choose a gain.";
    return undefined;
  },
  summary: (_o, info) => soundSummary(info, nameFor(info)),
  result: (o) => ({
    title:
      o.mode === "normalize"
        ? `Normalised towards ${formatLevel(o.target, "LUFS")}`
        : `${o.gainDb > 0 ? "Louder" : "Quieter"} by ${db(Math.abs(o.gainDb)).replace("+", "")}`,
    detail:
      "The numbers below were measured on the file just written. The preview plays the result.",
    change: false,
  }),
};
