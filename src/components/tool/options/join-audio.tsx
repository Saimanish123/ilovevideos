"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { formatDuration, withUnit } from "@/lib/format";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import {
  JOIN_KBPS,
  type JoinAudioOptions,
  type JoinInput,
  joinFormats,
  MAX_FILES,
  MAX_JOIN_SEC,
  planJoin,
} from "@/tools/engines/join-audio/options";
import { AudioHero } from "../audio/audio-hero";
import { UnitField } from "../regions/percent-field";
import { between, z } from "./remember-schema";
import type { OptionsSpec, StageInput } from "./types";

const joinInputs = (inputs: StageInput[] = []): JoinInput[] =>
  inputs.map((i) => ({ name: i.file.name, info: i.info }));
const secs = (s: number) => withUnit((Math.round(s * 10) / 10).toFixed(1), "s");
const khz = (hz: number) => withUnit(Number((hz / 1000).toFixed(1)), "kHz");
const clampSec = (v: number) => Math.round(Math.min(MAX_JOIN_SEC, Math.max(0.1, v)) * 10) / 10;

const formatLabels: Record<(typeof joinFormats)[number], string> = {
  auto: "Same as file 1",
  mp3: "MP3",
  m4a: "M4A (AAC)",
  wav: "WAV",
  flac: "FLAC",
};

function SecondsField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
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
            min={0.1}
            max={MAX_JOIN_SEC}
            step={0.1}
            value={value}
            onValueChange={(v) => onChange(clampSec(v))}
            getAriaValueText={(_f, v) => secs(v)}
          />
        </div>
        <UnitField
          id={fieldId}
          label={`${label}, seconds`}
          value={value}
          min={0.1}
          max={MAX_JOIN_SEC}
          step={0.1}
          decimals={1}
          unit="s"
          onCommit={(v) => onChange(clampSec(v))}
        />
      </div>
    </Field>
  );
}

export const joinAudioSpec: OptionsSpec<JoinAudioOptions> = {
  verb: "Merge",
  multiple: { min: 2, max: MAX_FILES, noun: "file", collapseAfter: 6 },
  // Done: the joined file's waveform and player, in place of a picture.
  previewResult: true,
  // Several sources joined: no one source to compare with (ADR-0134).
  compare: false,
  // The facts the stage holds are file 1's; the joined file's length comes from the player itself.
  Hero: (props) => (
    <AudioHero {...props} info={props.showing === "result" ? undefined : props.info} />
  ),
  route: () => "page",
  nextStep: { slug: "normalize-audio", label: "Normalise the merged audio" },
  remember: {
    schema: z.object({
      join: z.enum(["butt", "gap", "crossfade"]),
      gapSec: between(0.1, 10),
      crossfadeSec: between(0.1, 10),
      matchLoudness: z.boolean(),
      format: z.enum(["auto", "mp3", "m4a", "wav", "flac"]),
      output: z.enum(["auto", "wav"]),
    }),
  },
  defaults: () => ({
    join: "butt",
    gapSec: 1,
    crossfadeSec: 3,
    matchLoudness: false,
    format: "auto",
    output: "auto",
  }),
  blocked: (_o, _info, inputs) => {
    const list = joinInputs(inputs);
    if (list.length < 2) return "Add at least one more audio file to merge.";
    const silent = list.findIndex((i) => !i.info.audio?.length);
    if (silent >= 0) return `File ${silent + 1} has no sound track. Remove it to merge the rest.`;
    return undefined;
  },
  summary: (o, _info, inputs) => {
    const list = joinInputs(inputs);
    if (list.length < 2) return undefined;
    const plan = planJoin(list, o);
    // The list's footer already gives the total; a gap or a crossfade changes it, so it is said then.
    const length = o.join === "butt" ? "" : `result ${formatDuration(plan.seconds)}`;
    if (plan.copy) return ["MP3 frames copied, not re-encoded", length].filter(Boolean).join(" · ");
    return [
      plan.format.lossless
        ? `${plan.format.name} ${plan.bits ?? 16}\u2011bit`
        : `${plan.format.name} ${withUnit(JOIN_KBPS, "kbps")}`,
      `${khz(plan.sampleRate)} ${plan.channels === 1 ? "mono" : "stereo"}`,
      length,
      plan.format.id === "mp3" || plan.format.id === "flac"
        ? `${ffmpegDownloadSize()} download, once`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  },
  inputNotes: (o, inputs) => {
    const plan = planJoin(joinInputs(inputs), o);
    return inputs.map((i) => {
      const a = i.info.audio?.[0];
      if (!a) return "No sound track: remove this file.";
      const notes: string[] = [];
      if (!plan.copy && a.sampleRate !== plan.sampleRate)
        notes.push(`${khz(a.sampleRate)}, resampled to ${khz(plan.sampleRate)}`);
      if (a.channels === 1 && plan.channels === 2) notes.push("mono, plays on both sides");
      if (a.channels > 2) notes.push(`${a.channels} channels, mixed to stereo`);
      return notes.length ? `${notes.join("; ")}.` : undefined;
    });
  },
  result: (_o, _info, { inputs }) => {
    const count = inputs?.length ?? 0;
    return count < 2 ? undefined : { title: `${count} files merged`, change: false };
  },
  Panel({ value, onChange, media }) {
    const joinId = useId();
    const formatId = useId();
    const list = joinInputs(media.inputs);
    const plan = planJoin(list, value);
    const first = plan.format;
    return (
      <div className="flex flex-col gap-6">
        <Field
          label="Joins"
          labelId={joinId}
          hint={
            value.join === "butt"
              ? "Each file starts the moment the last one ends."
              : value.join === "gap"
                ? "Silence between files, for chapters or separate tracks."
                : "Each file fades into the next, as a DJ mix does."
          }
        >
          <Segmented
            name="join"
            aria-labelledby={joinId}
            value={value.join}
            onChange={(join) => onChange({ ...value, join })}
            options={[
              { value: "butt", label: "End to end" },
              { value: "gap", label: "Gap" },
              { value: "crossfade", label: "Crossfade" },
            ]}
          />
        </Field>
        {value.join === "gap" && (
          <SecondsField
            label="Gap"
            hint="Seconds of silence after each file but the last."
            value={value.gapSec}
            onChange={(gapSec) => onChange({ ...value, gapSec })}
          />
        )}
        {value.join === "crossfade" && (
          <SecondsField
            label="Crossfade"
            hint={
              plan.crossfadeSec < value.crossfadeSec
                ? `Shortened to ${secs(plan.crossfadeSec)}, half the shortest file.`
                : "How long two files overlap; the result is that much shorter at each join."
            }
            value={value.crossfadeSec}
            onChange={(crossfadeSec) => onChange({ ...value, crossfadeSec })}
          />
        )}
        <Checkbox
          label="Match loudness"
          hint="Brings every file to the same loudness, so a quiet recording does not drop out between loud ones."
          checked={value.matchLoudness}
          onChange={(e) => onChange({ ...value, matchLoudness: e.target.checked })}
        />
        <Field label="Save as" labelId={formatId} hint={plan.copyBlocked}>
          <Select
            aria-labelledby={formatId}
            value={value.format}
            onValueChange={(format) => onChange({ ...value, format })}
            options={joinFormats.map((f) => ({
              value: f,
              label: f === "auto" ? `${formatLabels.auto} (${first.name})` : formatLabels[f],
            }))}
          />
        </Field>
      </div>
    );
  },
};
