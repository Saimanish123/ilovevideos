"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, formatDuration, withUnit } from "@/lib/format";
import { needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import type { ReverseOptions } from "@/tools/engines/reverse";
import { decodeCost, maxReversedSound, windowFrames } from "@/tools/engines/reverse/math";
import type { MediaInfo } from "@/tools/engines/types";
import { containerNote, pictureEstimate } from "@/tools/engines/video-filter/plan";
import { undecodablePicture } from "./decodable";
import { pictureSize, sizeNote } from "./picture-size";
import type { OptionsSpec } from "./types";

/** Longest sound this tool reverses for this file, or undefined without sound. */
const soundLimit = (info: MediaInfo) => {
  const a = info.audio?.[0];
  return a ? maxReversedSound(a.sampleRate, a.channels) : undefined;
};
const soundTooLong = (info: MediaInfo) => {
  const limit = soundLimit(info);
  return limit !== undefined && info.durationSec > limit;
};

/** How many times, on average, each frame is decoded (1 when every key frame gap fits memory). */
function cost(info: MediaInfo): { factor: number; gap?: number } {
  const v = info.video;
  const keys = v?.keyframes;
  if (!v || !keys || keys.length === 0 || !(v.fps > 0)) return { factor: 1 };
  const n = Math.min(200_000, Math.round(info.durationSec * v.fps));
  const frames = Array.from({ length: n }, (_, i) => i / v.fps);
  const gap =
    keys.length > 1 ? ((keys.at(-1) ?? 0) - (keys[0] ?? 0)) / (keys.length - 1) : info.durationSec;
  return { factor: decodeCost(frames, keys, windowFrames(v.width, v.height)), gap };
}

export const reverseSpec: OptionsSpec<ReverseOptions> = {
  verb: "Reverse",
  previewResult: true,
  inspectKeyframes: true,
  nextStep: { slug: "loop-video", label: "Loop the result" },
  defaults: (info, preset) => ({
    sound:
      preset.sound === "drop" || soundTooLong(info) || !info.audio?.length ? "drop" : "reverse",
  }),
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track to reverse.";
    const undecodable = undecodablePicture(info);
    if (undecodable) return undecodable;
    if (needsFfmpeg(info, sourceName(info)))
      return {
        reason: `This tool reverses MP4, MOV, WebM and MKV files. Convert this ${info.container} file to MP4 first.`,
        action: { slug: "video-converter", label: "Convert to MP4" },
      };
    if (o.sound === "reverse" && soundTooLong(info))
      return `Reversing the sound holds all of it in memory, up to ${formatDuration(soundLimit(info) ?? 0)}; this clip is ${formatDuration(info.durationSec)}. Choose Remove the sound, or trim the video first.`;
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const est = pictureEstimate({ ...info, audio: o.sound === "drop" ? [] : info.audio }, v);
    const sound = !info.audio?.length
      ? "There is no sound track."
      : o.sound === "reverse"
        ? "The sound is reversed too and encoded to AAC."
        : "The result has no sound.";
    const out = pictureSize(info);
    return `Output ${formatDimensions(out.width, out.height)} H.264, ${est.label}.${sizeNote(info)} Every frame is re-encoded, last first. ${sound}${containerNote(info)} Runs on this device.`;
  },
  result: (o, info) => ({
    title: `Reversed: ${formatDuration(info.durationSec)} backwards`,
    detail: `${o.sound === "reverse" && info.audio?.length ? "The sound plays backwards too." : "The result is silent."} The preview plays the result.`,
    change: false,
  }),
  Panel({ value, onChange, info }) {
    const soundId = useId();
    const v = info.video;
    const hasSound = !!info.audio?.length;
    const tooLong = soundTooLong(info);
    const c = cost(info);
    return (
      <div className="flex flex-col gap-6">
        {v && (
          <div aria-live="polite">
            <p className="tabular text-h2" data-testid="reverse-frames">
              {Math.round(info.durationSec * v.fps).toLocaleString("en")} frames, last first
            </p>
            <p className="tabular mt-1 text-fg-muted text-sm">
              {c.factor > 1.05
                ? `Key frames here are ${withUnit((c.gap ?? 0).toFixed(1), "s")} apart, longer than one decode window, so some frames are decoded more than once (${withUnit(c.factor.toFixed(1), "×")} the decoding of a normal pass). It takes longer; memory stays bounded.`
                : `${formatDuration(info.durationSec)} of video, decoded one key frame gap at a time from the end, so memory stays bounded however long the clip is.`}
            </p>
          </div>
        )}
        {hasSound && tooLong ? (
          <div>
            <p className="font-medium text-sm">Sound</p>
            <p className="mt-2 text-body">Removed</p>
            <p className="mt-2 text-fg-muted text-xs">
              Reversed sound is held in memory whole, up to {formatDuration(soundLimit(info) ?? 0)}.
              This clip is {formatDuration(info.durationSec)}, so the result is silent.
            </p>
          </div>
        ) : hasSound ? (
          <Field
            label="Sound"
            labelId={soundId}
            hint="Reversed speech and music sound backwards, as on tape. Remove it for a silent clip."
          >
            <Segmented
              name="reverse-sound"
              aria-labelledby={soundId}
              value={value.sound}
              onChange={(sound) => onChange({ sound })}
              options={[
                { value: "reverse", label: "Reverse it" },
                { value: "drop", label: "Remove it" },
              ]}
            />
          </Field>
        ) : (
          <p className="text-fg-muted text-sm">This video has no sound track.</p>
        )}
      </div>
    );
  },
};
