"use client";

import { PlacementTimeline } from "@/components/tool/timeline/placement-timeline";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { normalizeAudioCodec } from "@/content/formats/audio";
import { containerById } from "@/content/formats/containers";
import { formatDuration, formatTimecode, withUnit } from "@/lib/format";
import type { AddAudioOptions } from "@/tools/engines/add-audio";
import {
  audioUnchanged,
  type Balance,
  outputContainer,
  pickRoles,
  placement,
} from "@/tools/engines/add-audio/math";
import { codecName } from "@/tools/engines/convert-video/plan";
import { TimeInput } from "./trim";
import type { OptionsSpec, StageInput } from "./types";

const fadeOptions = [
  { value: "0", label: "Off" },
  { value: "1", label: withUnit(1, "s") },
  { value: "2", label: withUnit(2, "s") },
  { value: "4", label: withUnit(4, "s") },
] as const;
const volumeOptions = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.5", label: "150%" },
] as const;
const balanceOptions: { value: Balance; label: string }[] = [
  { value: "original", label: "Video in front" },
  { value: "even", label: "Even" },
  { value: "new", label: "New audio in front" },
];

interface Roles {
  video?: StageInput;
  audio?: StageInput;
}
const rolesOf = (inputs: StageInput[] = []): Roles => pickRoles(inputs);

/** What the run will do, from the same facts the engine uses. */
function facts(o: AddAudioOptions, r: Roles) {
  if (!r.video || !r.audio) return undefined;
  const place = placement(r.video.info.durationSec, r.audio.info.durationSec, o);
  const hasOriginal = (r.video.info.audio?.length ?? 0) > 0;
  const mixing = o.mode === "mix" && hasOriginal;
  const container = outputContainer({ file: r.video.file, info: r.video.info });
  const codec = normalizeAudioCodec(r.audio.info.audio?.[0]?.codec);
  const holds = containerById.get(container)?.audioCodecs ?? [];
  const copy =
    audioUnchanged({ ...o, mode: mixing ? "mix" : "replace" }, place.cut) &&
    !!codec &&
    holds.includes(codec);
  return { place, hasOriginal, mixing, container, codec, copy };
}

export const addAudioSpec: OptionsSpec<AddAudioOptions> = {
  verb: "Add audio",
  multiple: {
    min: 2,
    max: 2,
    noun: "file",
    roles: (inputs) => {
      const r = rolesOf(inputs);
      return inputs.map((i) =>
        i === r.video
          ? "Video"
          : i === r.audio
            ? i.info.video
              ? "New audio (from a video)"
              : "New audio"
            : undefined,
      );
    },
  },
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  defaults: (_info, preset) => ({
    mode: preset.mode === "replace" ? "replace" : "mix",
    offset: 0,
    skip: 0,
    loop: false,
    fadeOut: 2,
    volume: 1,
    balance: "even",
  }),
  blocked: (o, _info, inputs) => {
    const r = rolesOf(inputs);
    if ((inputs?.length ?? 0) < 2)
      return r.video
        ? "Add the audio file to put on this video."
        : "Add the video to put this audio on.";
    if (!r.video) return "One of the two files must be a video.";
    if (!r.audio?.info.audio?.length) return `${r.audio?.file.name ?? "The audio"} has no sound.`;
    const f = facts(o, r);
    if (f && f.place.end - f.place.start <= 0)
      return "The audio starts after the video ends. Drag it earlier on the timeline.";
    return undefined;
  },
  summary: (o, _info, inputs) => {
    const f = facts(o, rolesOf(inputs));
    if (!f) return undefined;
    const span = `${formatTimecode(f.place.start)} to ${formatTimecode(f.place.end)}`;
    if (f.copy)
      return `Lossless: the picture and the ${codecName(f.codec) ?? "audio"} track are both copied, not re-encoded. The new audio plays ${span}.`;
    const what = f.mixing ? "mixed with the video's own sound" : "as the only sound";
    return `The picture is copied, not re-encoded. The new audio plays ${span}, ${what}, encoded to ${f.container === "webm" ? "Opus" : "AAC"} at ${withUnit(192, "kbps")}.`;
  },
  // The row already names its role ("Video", "New audio"); the note adds only what changes the job.
  inputNotes: (_o, inputs) => {
    const r = rolesOf(inputs);
    return inputs.map((input) => {
      if (input === r.video)
        return input.info.audio?.length ? "Has its own sound." : "No sound of its own.";
      if (input === r.audio && !input.info.audio?.length)
        return "No sound in this file: remove it.";
      return undefined;
    });
  },
  result: (o, _info, { inputs }) => {
    const f = facts(o, rolesOf(inputs));
    if (!f) return undefined;
    const length = formatDuration(rolesOf(inputs).video?.info.durationSec ?? 0);
    return {
      title: f.mixing
        ? `Audio added: ${length}, mixed with the original`
        : `Audio replaced: ${length}`,
      detail: f.copy
        ? "Lossless: the picture and the audio were copied without re-encoding."
        : "The picture was copied without re-encoding; only the sound was encoded.",
      change: false,
    };
  },
  Below({ value, onChange, media, disabled }) {
    const r = rolesOf(media.inputs);
    // The video alone already gets its frame, so the audio lands in place when it is read.
    if (!r.video) return null;
    return (
      <PlacementTimeline
        video={r.video}
        audio={r.audio}
        value={value}
        disabled={disabled}
        onChange={(p) => onChange({ ...value, ...p })}
      />
    );
  },
  Panel({ value, onChange, media }) {
    const r = rolesOf(media.inputs);
    const f = facts(value, r);
    const hasOriginal = f?.hasOriginal ?? (r.video?.info.audio?.length ?? 0) > 0;
    const shorter =
      r.video && r.audio
        ? r.audio.info.durationSec - value.skip < r.video.info.durationSec - value.offset - 0.05
        : false;
    return (
      <div className="flex flex-col gap-6">
        {hasOriginal ? (
          <Field
            label="The video's own sound"
            labelId="mode-label"
            hint={
              value.mode === "mix"
                ? "Both play together. Choose which one is in front."
                : "Only the new audio is heard."
            }
          >
            <Segmented
              name="mode"
              aria-labelledby="mode-label"
              value={value.mode}
              onChange={(mode) => onChange({ ...value, mode })}
              options={[
                { value: "replace", label: "Replace it" },
                { value: "mix", label: "Keep and mix" },
              ]}
            />
          </Field>
        ) : (
          r.video && (
            <p className="text-fg-muted text-sm">
              The video has no sound of its own, so the new audio becomes its soundtrack.
            </p>
          )
        )}
        {value.mode === "mix" && hasOriginal ? (
          <Field
            label="Balance"
            labelId="balance-label"
            hint="Video in front suits music under speech; new audio in front suits a voiceover."
          >
            <Segmented
              name="balance"
              aria-labelledby="balance-label"
              value={value.balance}
              onChange={(balance) => onChange({ ...value, balance })}
              options={balanceOptions}
            />
          </Field>
        ) : (
          <Field
            label="Volume of the new audio"
            labelId="volume-label"
            hint="100% leaves it as recorded."
          >
            <Segmented
              name="volume"
              aria-labelledby="volume-label"
              value={String(value.volume) as (typeof volumeOptions)[number]["value"]}
              onChange={(v) => onChange({ ...value, volume: Number(v) })}
              options={[...volumeOptions]}
            />
          </Field>
        )}
        <Field
          label="Fade out at the end"
          labelId="fade-label"
          hint={
            f?.place.cut
              ? "Applies where the video's end cuts the audio."
              : "Only used when the video ends before the audio does."
          }
        >
          <Segmented
            name="fade"
            aria-labelledby="fade-label"
            value={String(value.fadeOut) as (typeof fadeOptions)[number]["value"]}
            onChange={(v) => onChange({ ...value, fadeOut: Number(v) })}
            options={[...fadeOptions]}
          />
        </Field>
        {(shorter || value.loop) && (
          <Checkbox
            label="Loop the audio to the end of the video"
            hint="The audio is shorter than the rest of the video. Looping repeats it; otherwise the end is silent."
            checked={value.loop}
            onChange={(e) => onChange({ ...value, loop: e.target.checked })}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts at" htmlFor="offset" trailing="s">
            <TimeInput
              id="offset"
              value={value.offset}
              onCommit={(t) =>
                onChange({
                  ...value,
                  offset: Math.min(
                    Math.max(0, t),
                    Math.max(0, (r.video?.info.durationSec ?? 0) - 0.1),
                  ),
                })
              }
            />
          </Field>
          <Field label="Skip into audio" htmlFor="skip" trailing="s">
            <TimeInput
              id="skip"
              value={value.skip}
              onCommit={(t) =>
                onChange({
                  ...value,
                  skip: Math.min(
                    Math.max(0, t),
                    Math.max(0, (r.audio?.info.durationSec ?? 0) - 0.1),
                  ),
                })
              }
            />
          </Field>
        </div>
      </div>
    );
  },
};
