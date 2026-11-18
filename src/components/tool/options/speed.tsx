"use client";

import { useEffect, useRef } from "react";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { withUnit } from "@/lib/format";
import type { SpeedOptions } from "@/tools/engines/speed";
import {
  audioSpeedTarget,
  clampPlaybackRate,
  clampSpeed,
  formatSpeed,
  formatSpeedDuration,
  MAX_SPEED,
  MIN_SPEED,
  outputDuration,
  speedPresets,
} from "@/tools/engines/speed/math";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { SoundHero } from "../sound/sound-hero";
import { type Choice, Choices } from "./choices";
import type { OptionsPanelProps, OptionsSpec } from "./types";

type PresetChoice = `${(typeof speedPresets)[number]}` | "custom";
type AudioChoice = "keep" | "shift" | "mute";

/** What each preset is for, in the words people search with. */
const presetMeaning: Record<(typeof speedPresets)[number], string> = {
  0.25: "Very slow",
  0.5: "Slow motion",
  0.75: "A little slower",
  1.25: "A little faster",
  1.5: "Faster",
  2: "Twice as fast",
  4: "Timelapse",
};
const presetOptions: Choice<PresetChoice>[] = [
  ...speedPresets.map((p) => ({
    value: String(p) as PresetChoice,
    label: formatSpeed(p),
    detail: presetMeaning[p],
  })),
  { value: "custom" as PresetChoice, label: "Custom", detail: "Any speed" },
];
const audioOptions: { value: AudioChoice; label: string }[] = [
  { value: "keep", label: "Keep pitch" },
  { value: "shift", label: "Shift pitch" },
  { value: "mute", label: "Mute" },
];

const presetFor = (speed: number): PresetChoice =>
  (speedPresets as readonly number[]).includes(speed) ? (String(speed) as PresetChoice) : "custom";
const audioFor = (o: SpeedOptions): AudioChoice =>
  o.muteAudio ? "mute" : o.keepPitch ? "keep" : "shift";

/** Drives the preview: the <video> plays at the chosen speed with the chosen pitch handling. */
function useLivePlayback(media: OptionsPanelProps<SpeedOptions>["media"], o: SpeedOptions) {
  const rate = clampPlaybackRate(o.speed);
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    // The preview element mounts one commit after its object URL exists; wait for it briefly.
    const apply = () => {
      const el = media.video.current;
      if (el) {
        el.playbackRate = rate;
        el.preservesPitch = o.keepPitch;
        el.muted = o.muteAudio;
      } else if (tries++ < 120) {
        raf = requestAnimationFrame(apply);
      }
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [media.video, rate, o.keepPitch, o.muteAudio]);
  useEffect(
    () => () => {
      const el = media.video.current;
      if (el) {
        el.playbackRate = 1;
        el.preservesPitch = true;
        el.muted = false;
      }
    },
    [media.video],
  );
}

/** "Twice as fast", "Slow motion" or "3.2× faster": the effect in words, for the verdict. */
const effect = (speed: number) =>
  speed > 1 ? `${formatSpeed(speed)} faster` : `${formatSpeed(speed)} slower`;

/** The next preset up or down from the current speed (for [ and ]). */
const stepPreset = (speed: number, dir: 1 | -1) => {
  const list = speedPresets as readonly number[];
  return dir > 0
    ? list.find((p) => p > speed + 1e-6)
    : [...list].reverse().find((p) => p < speed - 1e-6);
};

export const speedSpec: OptionsSpec<SpeedOptions> = {
  verb: "Change speed",
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress the result" },
  shortcuts: [
    { keys: "]", label: "Next faster preset" },
    { keys: "[", label: "Next slower preset" },
    PLAY_SHORTCUT,
  ],
  result: (o, info) => {
    const to = formatSpeedDuration(outputDuration(info.durationSec, o.speed));
    const hasAudio = !!info.audio?.length;
    return {
      title: `Now ${to} long, ${effect(o.speed)}`,
      detail: `${!info.video ? (o.keepPitch ? "It keeps its pitch." : "Its pitch shifts with the speed.") : !hasAudio ? "The video had no sound." : o.muteAudio ? "The sound was removed." : o.keepPitch ? "The sound keeps its pitch." : "The sound shifts in pitch with the speed."} The preview plays the result.`,
      change: false,
    };
  },
  defaults: (info, preset) => ({
    speed: typeof preset.speed === "number" ? clampSpeed(preset.speed) : info.video ? 2 : 1.25,
    keepPitch: typeof preset.keepPitch === "boolean" ? preset.keepPitch : true,
    // An audio file cannot lose its sound: it is the whole file.
    muteAudio: info.video && typeof preset.muteAudio === "boolean" ? preset.muteAudio : false,
  }),
  // A video keeps its preview; an audio file (change audio speed) gets its waveform player.
  Hero: (props) => <SoundHero {...props} noStrip />,
  route: () => "page",
  blocked: (o, info) => {
    if (!info.video && !info.audio?.length)
      return "This file has no picture or sound to change the speed of.";
    if (o.speed === 1) return "1× leaves the video as it is. Choose a different speed.";
    return undefined;
  },
  // The new length is the panel's headline; this line says what happens to the sound and how it runs.
  summary: (o, info) => {
    if (o.speed === 1) return undefined;
    if (!info.video) {
      const t = audioSpeedTarget(info);
      return `${o.keepPitch ? "Pitch is kept." : "Pitch shifts with the speed."} Saved as ${t.format.name}${t.bitrateKbps ? ` at ${withUnit(t.bitrateKbps, "kbps")}` : ""} with the ffmpeg engine on this device.`;
    }
    const hasAudio = !!info.audio?.length;
    const audio = !hasAudio
      ? "No audio track."
      : o.muteAudio
        ? "The sound is removed."
        : o.keepPitch
          ? "Audio pitch is kept."
          : "Audio pitch shifts with the speed.";
    return `${audio} Re-encodes to MP4 with the ffmpeg engine on this device.`;
  },
  Panel({ value, onChange, info, media, disabled }) {
    const root = useRef<HTMLDivElement>(null);
    useLivePlayback(media, value);
    const hasAudio = !!info.audio?.length;
    const extreme = value.speed > 4 || value.speed < 0.5;
    const step = (dir: 1 | -1) => {
      const next = stepPreset(value.speed, dir);
      if (next !== undefined) onChange({ ...value, speed: next });
    };
    useWorkspaceKeys(
      root,
      [
        { key: "]", run: () => step(1) },
        { key: "[", run: () => step(-1) },
      ],
      !disabled,
    );
    return (
      <div ref={root} className="flex flex-col gap-6">
        {(info.video || info.audio?.length) && (
          <div aria-live="polite">
            <p className="tabular text-h2" data-testid="speed-length">
              <span className="text-fg-muted">{formatSpeedDuration(info.durationSec)} →</span>{" "}
              {formatSpeedDuration(outputDuration(info.durationSec, value.speed))}
            </p>
            <p className="tabular mt-1 text-fg-muted text-sm">
              {value.speed === 1
                ? "The same length: choose a speed."
                : info.video
                  ? `${effect(value.speed)}, at ${withUnit(Math.round(info.video.fps), "fps")}. The preview plays at this speed.`
                  : `${effect(value.speed)}. The player plays at this speed.`}
            </p>
          </div>
        )}
        <Field
          label="Speed"
          labelId="speed-label"
          hint="Above 1× is faster and shorter; below 1× is slower and longer."
        >
          <Choices
            name="speed"
            aria-labelledby="speed-label"
            columns={4}
            value={presetFor(value.speed)}
            onChange={(p) => {
              if (p !== "custom") onChange({ ...value, speed: Number(p) });
              // Custom is the exact field below: take the user there.
              else document.getElementById("speed-exact")?.focus();
            }}
            options={presetOptions}
          />
        </Field>
        <Field
          label="Exact speed"
          htmlFor="speed-exact"
          trailing="×"
          hint={`Any value from ${formatSpeed(MIN_SPEED)} to ${formatSpeed(MAX_SPEED)}.`}
        >
          <NumberInput
            id="speed-exact"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.05}
            value={value.speed}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && e.target.value !== "")
                onChange({ ...value, speed: clampSpeed(n) });
            }}
          />
        </Field>
        {hasAudio ? (
          <Field
            label="Audio"
            labelId="audio-label"
            hint={
              extreme
                ? `Stretched sound turns artificial beyond ${formatSpeed(4)} or below ${formatSpeed(0.5)}; Mute is the clean choice here.`
                : "Keep pitch stretches the sound so voices stay natural. Shift pitch is the tape-speed effect."
            }
          >
            <Segmented
              name="audio"
              aria-labelledby="audio-label"
              value={audioFor(value)}
              onChange={(a) =>
                onChange({ ...value, keepPitch: a !== "shift", muteAudio: a === "mute" })
              }
              options={info.video ? audioOptions : audioOptions.filter((a) => a.value !== "mute")}
            />
          </Field>
        ) : (
          <p className="text-fg-muted text-sm">This video has no audio track.</p>
        )}
      </div>
    );
  },
};
