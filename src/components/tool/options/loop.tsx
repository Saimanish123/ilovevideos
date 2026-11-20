"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { formatBytes, formatDuration } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import type { LoopOptions } from "@/tools/engines/loop";
import {
  lengthPresets,
  loopBytes,
  MAX_OUTPUT_BYTES,
  MAX_PLAYS,
  playLength,
  plays,
  timesPresets,
} from "@/tools/engines/loop/math";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { pictureEstimate } from "@/tools/engines/video-filter/plan";
import { type Choice, Choices } from "./choices";
import { undecodablePicture } from "./decodable";
import { z } from "./remember-schema";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

const fps = (info: MediaInfo) => info.video?.fps ?? 30;
const onePlay = (o: LoopOptions, info: MediaInfo) =>
  playLength(info.durationSec, fps(info), o.boomerang);
const count = (o: LoopOptions, info: MediaInfo) =>
  plays(onePlay(o, info), { times: o.times, minSeconds: o.minSeconds });

/** Size of the result: a copy repeats the file; a boomerang is one re-encoded bounce, repeated. */
function outputBytes(o: LoopOptions, info: MediaInfo): number {
  const n = count(o, info);
  if (!o.boomerang) return loopBytes(info.sizeBytes, n);
  const v = info.video;
  const bounce = v
    ? pictureEstimate({ ...info, audio: [] }, v, soundEncodersNow(), v.fps, onePlay(o, info)).bytes
    : info.sizeBytes * 2;
  return bounce * n;
}

const timesOptions: Choice<string>[] = timesPresets.map((t) => ({
  value: String(t),
  label: `${t}×`,
  detail: `${t} plays`,
}));

export const loopSpec: OptionsSpec<LoopOptions> = {
  verb: "Loop",
  previewResult: true,
  // The same picture repeated: its timeline is longer than the source's (ADR-0134).
  compare: false,
  nextStep: { slug: "video-to-gif", label: "Make it a GIF" },
  // The boomerang is its own page (the preset); the loop page links there instead of a switch.
  remember: {
    schema: z.object({
      times: z.int().check(z.minimum(2), z.maximum(MAX_PLAYS)),
      boomerang: z.boolean(),
    }),
  },
  defaults: (_info, preset) => ({
    times: typeof preset.times === "number" ? preset.times : 3,
    minSeconds: typeof preset.minSeconds === "number" ? preset.minSeconds : undefined,
    boomerang: preset.boomerang === true,
  }),
  blocked: (o, info) => {
    if (!info.video) return unfixable("This file has no video track to loop. Choose a video file.");
    const undecodable = undecodablePicture(info);
    if (undecodable) return undecodable;
    if (needsFfmpeg(info, sourceName(info)))
      return {
        reason: `This tool loops MP4, MOV, WebM and MKV files. Convert this ${info.container} file to MP4 first.`,
        action: { slug: "video-converter", label: "Convert to MP4" },
      };
    const n = count(o, info);
    if (n < 2)
      return `This clip is already ${formatDuration(onePlay(o, info))} long. Choose a longer length.`;
    const bytes = outputBytes(o, info);
    if (bytes > MAX_OUTPUT_BYTES)
      return `${n} plays would make about ${formatBytes(bytes)}; this tool holds the result in memory up to ${formatBytes(MAX_OUTPUT_BYTES)}. Choose fewer plays, or trim the clip first.`;
    return undefined;
  },
  summary: (o, info) => {
    if (!info.video) return undefined;
    const n = count(o, info);
    if (n < 2) return undefined;
    const size = `about ${formatBytes(outputBytes(o, info))}`;
    return o.boomerang
      ? `${n} bounces, ${formatDuration(onePlay(o, info) * n)}, ${size}. One bounce is encoded to H.264, then copied ${n} times; a boomerang has no sound.`
      : `${n} plays, ${formatDuration(info.durationSec * n)}, ${size}. The streams are copied ${n} times: nothing is re-encoded, every play is identical to the original.`;
  },
  result: (o, info) => {
    const n = count(o, info);
    return {
      title: `${n} ${o.boomerang ? "bounces" : "plays"}: ${formatDuration(onePlay(o, info) * n)}`,
      detail: o.boomerang
        ? "Forwards, then backwards, repeated. The preview plays the result."
        : `The clip plays ${n} times in a row with no gap and no quality lost. The preview plays the result.`,
      change: false,
    };
  },
  Panel({ value, onChange, info }) {
    const modeId = useId();
    const timesId = useId();
    const lengthId = useId();
    const mode = value.minSeconds !== undefined ? "length" : "times";
    const n = count(value, info);
    const one = onePlay(value, info);
    const lengthOptions: Choice<string>[] = lengthPresets
      .filter((s) => s > one)
      .map((s) => {
        const k = plays(one, { minSeconds: s });
        return {
          value: String(s),
          label: formatDuration(s),
          detail: `${k} plays, ${formatDuration(one * k)}`,
        };
      });
    return (
      <div className="flex flex-col gap-6">
        <div aria-live="polite">
          <p className="tabular text-h2" data-testid="loop-length">
            <span className="text-fg-muted">{formatDuration(info.durationSec)} →</span>{" "}
            {formatDuration(one * Math.max(1, n))}
          </p>
          <p className="tabular mt-1 text-fg-muted text-sm">
            {n < 2
              ? "The clip is already that long."
              : `${n} ${value.boomerang ? "bounces" : "plays"} of ${formatDuration(one)}${value.boomerang ? " (forwards and back)" : ""}.`}
          </p>
        </div>
        <Field
          label="Repeat"
          labelId={modeId}
          hint={
            mode === "times"
              ? "The whole clip, this many times in a row."
              : "Whole plays until the result is at least this long; a copy cannot stop part way through a play."
          }
        >
          <Segmented
            name="loop-mode"
            aria-labelledby={modeId}
            value={mode}
            onChange={(m) =>
              onChange(
                m === "times"
                  ? { ...value, minSeconds: undefined }
                  : {
                      ...value,
                      minSeconds: lengthOptions[0] ? Number(lengthOptions[0].value) : 30,
                    },
              )
            }
            options={[
              { value: "times", label: "A number of times" },
              { value: "length", label: "To a length" },
            ]}
          />
        </Field>
        {mode === "times" ? (
          <>
            <Field label="Plays" labelId={timesId}>
              <Choices
                name="loop-times"
                aria-labelledby={timesId}
                columns={4}
                value={
                  (timesPresets as readonly number[]).includes(value.times)
                    ? String(value.times)
                    : undefined
                }
                onChange={(t) => onChange({ ...value, times: Number(t) })}
                options={timesOptions}
              />
            </Field>
            <Field
              label="Exact number of plays"
              htmlFor="loop-times-exact"
              hint={`From 2 to ${MAX_PLAYS}.`}
            >
              <NumberInput
                id="loop-times-exact"
                min={2}
                max={MAX_PLAYS}
                step={1}
                value={value.times}
                onChange={(e) => {
                  const t = Math.round(Number(e.target.value));
                  if (e.target.value !== "" && Number.isFinite(t))
                    onChange({ ...value, times: Math.min(MAX_PLAYS, Math.max(2, t)) });
                }}
              />
            </Field>
          </>
        ) : (
          <>
            {lengthOptions.length > 0 && (
              <Field label="At least" labelId={lengthId}>
                <Choices
                  name="loop-length"
                  aria-labelledby={lengthId}
                  columns={Math.min(3, lengthOptions.length)}
                  value={
                    lengthOptions.some((l) => Number(l.value) === value.minSeconds)
                      ? String(value.minSeconds)
                      : undefined
                  }
                  onChange={(s) => onChange({ ...value, minSeconds: Number(s) })}
                  options={lengthOptions}
                />
              </Field>
            )}
            <Field label="Exact length" htmlFor="loop-seconds" trailing="seconds">
              <NumberInput
                id="loop-seconds"
                min={1}
                step={1}
                value={value.minSeconds ?? ""}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  if (e.target.value !== "" && Number.isFinite(s) && s > 0)
                    onChange({ ...value, minSeconds: s });
                }}
              />
            </Field>
          </>
        )}
        {!value.boomerang && (
          <p className="text-fg-muted text-xs">
            Forwards, then backwards?{" "}
            <Link
              href="/boomerang-video"
              className="rounded-sm font-medium text-fg underline decoration-1 underline-offset-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              Make a boomerang
            </Link>{" "}
            instead.
          </p>
        )}
      </div>
    );
  },
};
