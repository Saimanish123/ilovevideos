"use client";

import { Check, Scissors } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { SplitTimeline } from "@/components/tool/timeline/split-timeline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { formatDuration, formatTimecode, NBSP, withUnit } from "@/lib/format";
import type { SplitOptions } from "@/tools/engines/split";
import {
  cutPoints,
  EVERY_PRESETS,
  MAX_PARTS,
  nearestKeyframe,
  partName,
  partsFrom,
  requestedPoints,
  type SplitMode,
} from "@/tools/engines/split/math";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsPanelProps, OptionsSpec } from "./types";

const media = (info: MediaInfo) => ({
  fps: info.video?.fps ?? 30,
  keyframes: info.video?.keyframes,
});

const plan = (o: SplitOptions, info: MediaInfo) => {
  const points = cutPoints(o, info.durationSec, media(info));
  return { points, parts: partsFrom(points, info.durationSec) };
};

const seconds = (s: number) => withUnit(s.toFixed(1), "s");

function lengths(parts: { start: number; end: number }[]): string {
  const lens = parts.map((p) => p.end - p.start);
  const min = Math.min(...lens);
  const max = Math.max(...lens);
  return max - min < 0.05 ? `${seconds(min)} each` : `${seconds(min)} to ${seconds(max)} long`;
}

export const splitSpec: OptionsSpec<SplitOptions> = {
  verb: "Split",
  inspectKeyframes: true,
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress this part to share it" },
  result: (o, _info, { files }) => ({
    title: `Split into ${files} parts`,
    detail: o.precise
      ? "Frame-accurate cuts: every part was re-encoded."
      : "Cut on key frames: the streams were copied, not re-encoded.",
  }),
  defaults: (_info, preset) => ({
    mode: (preset.mode as SplitMode | undefined) ?? "equal",
    parts: typeof preset.parts === "number" ? preset.parts : 2,
    every: typeof preset.every === "number" ? preset.every : 30,
    points: [],
    precise: preset.precise === true,
    names: [],
  }),
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track to split.";
    const { parts } = plan(o, info);
    if (parts.length >= 2) return undefined;
    if (o.mode === "every" && o.every >= info.durationSec)
      return `Parts of ${seconds(o.every)} leave one part: the video is ${formatDuration(info.durationSec)} long. Choose a shorter length.`;
    if (o.mode === "points" && o.points.length === 0)
      return "Add a cut: scrub the preview to a moment and press Split here.";
    if (!o.precise && (info.video.keyframes?.length ?? 0) <= 1)
      return "This video has a key frame only at the start, so a lossless cut has nowhere to land. Turn on frame-accurate cuts.";
    if (!o.precise)
      return "No cut lands on a key frame between the start and the end. Move the markers, or turn on frame-accurate cuts.";
    return "Move the cut away from the very start or end of the video.";
  },
  summary: (o, info) => {
    const { parts } = plan(o, info);
    if (parts.length < 2) return undefined;
    const asked = requestedPoints(o, info.durationSec).length + 1;
    const fewer =
      !o.precise && asked > parts.length
        ? `You asked for ${asked} parts; the key frames allow ${parts.length}. `
        : "";
    const how = o.precise
      ? "Frame-accurate cuts: the video is re-encoded."
      : "Cuts sit on key frames, so the streams are copied and nothing is re-encoded.";
    return `${fewer}${parts.length} parts, ${lengths(parts)}. ${how}`;
  },
  Below({ value, onChange, info, media: m, disabled, progress }) {
    const { points, parts } = plan(value, info);
    const md = media(info);
    const toCustom = (next: number[]) =>
      onChange({ ...value, mode: "points", points: [...next].sort((a, b) => a - b) });
    const splitHere = () => {
      const t = m.video.current?.currentTime ?? 0;
      const at = value.precise
        ? Math.round(t * md.fps) / md.fps
        : nearestKeyframe(
            t,
            (md.keyframes ?? []).filter((k) => k > 0),
          );
      if (at === undefined || at <= 0 || at >= info.durationSec) return;
      if (points.some((p) => Math.abs(p - at) < 1 / md.fps / 2)) return;
      toCustom([...points, at]);
    };
    const active = progress?.item?.index;
    return (
      <div className="flex flex-col gap-4">
        <SplitTimeline
          disabled={disabled}
          file={m.file}
          video={m.video}
          duration={info.durationSec}
          fps={md.fps}
          points={points}
          keyframes={md.keyframes}
          precise={value.precise}
          onChange={toCustom}
          onRemove={(i) => toCustom(points.filter((_, j) => j !== i))}
          activePart={disabled ? active : undefined}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="md"
            variant="secondary"
            className="min-h-11"
            onClick={splitHere}
            disabled={disabled || points.length >= MAX_PARTS - 1}
          >
            <Scissors size={16} strokeWidth={1.5} aria-hidden />
            Split here
          </Button>
          <p className="text-fg-muted text-xs">
            {value.precise
              ? "Adds a cut at the frame under the playhead."
              : "Adds a cut at the key frame nearest the playhead."}
          </p>
        </div>
        <PartsList
          parts={parts}
          names={value.names}
          fileName={m.file.name}
          disabled={disabled}
          active={active}
          onName={(i, name) => {
            const names = [...value.names];
            while (names.length < i) names.push("");
            names[i] = name;
            onChange({ ...value, names });
          }}
          onJoin={(i) => toCustom(points.filter((_, j) => j !== i - 1))}
        />
      </div>
    );
  },
  Panel({ value, onChange, info }) {
    const modeId = useId();
    const everyId = useId();
    const { points } = plan(value, info);
    const setMode = (mode: SplitMode) =>
      // Custom starts from the cuts on screen, so the markers do not jump.
      onChange(mode === "points" ? { ...value, mode, points } : { ...value, mode });
    return (
      <div className="flex flex-col gap-6">
        <Field label="Split into" labelId={modeId}>
          <Segmented
            name="split-mode"
            aria-labelledby={modeId}
            value={value.mode}
            onChange={setMode}
            options={[
              { value: "equal", label: "Equal parts" },
              { value: "every", label: "By length" },
              { value: "points", label: "Custom" },
            ]}
          />
        </Field>
        {value.mode === "equal" && (
          <Field
            label="Number of parts"
            htmlFor="split-parts"
            hint="Each part gets the same length, give or take the distance to a key frame."
          >
            <CommitNumber
              id="split-parts"
              value={value.parts}
              min={2}
              max={MAX_PARTS}
              step={1}
              onCommit={(n) => onChange({ ...value, parts: Math.round(n) })}
            />
          </Field>
        )}
        {value.mode === "every" && (
          <Field
            label="Part length"
            labelId={everyId}
            hint="Every part has this length except the last, which takes what is left."
          >
            <div className="flex flex-col gap-3">
              <Segmented
                name="split-every"
                aria-labelledby={everyId}
                value={
                  (EVERY_PRESETS as readonly number[]).includes(value.every)
                    ? String(value.every)
                    : "other"
                }
                onChange={(v) => v !== "other" && onChange({ ...value, every: Number(v) })}
                options={[
                  ...EVERY_PRESETS.map((s) => ({ value: String(s), label: withUnit(s, "s") })),
                  { value: "other", label: "Other" },
                ]}
              />
              <div className="flex items-center gap-2">
                <CommitNumber
                  id="split-every-seconds"
                  aria-label="Seconds per part"
                  value={value.every}
                  min={1}
                  max={86_400}
                  step={1}
                  onCommit={(n) => onChange({ ...value, every: n })}
                />
                <span className="text-fg-muted text-sm">seconds</span>
              </div>
            </div>
          </Field>
        )}
        {value.mode === "points" && (
          <p className="text-fg-muted text-sm">
            Scrub the preview to a moment and press Split here, or drag a marker on the timeline.
            Select a marker and press Delete to remove it.
          </p>
        )}
        <Checkbox
          label="Frame-accurate cuts"
          hint="Re-encodes so each cut lands on the exact frame. Without it, cuts move to the nearest key frame and nothing is re-encoded."
          checked={value.precise}
          onChange={(e) => onChange({ ...value, precise: e.target.checked })}
        />
      </div>
    );
  },
} satisfies OptionsSpec<SplitOptions> & {
  Below: React.ComponentType<OptionsPanelProps<SplitOptions>>;
};

/** The parts as time ranges, each with an optional file name; the join button removes the cut before it. */
function PartsList({
  parts,
  names,
  fileName,
  disabled,
  active,
  onName,
  onJoin,
}: {
  parts: { start: number; end: number }[];
  names: string[];
  fileName: string;
  disabled?: boolean;
  active?: number;
  onName: (i: number, name: string) => void;
  onJoin: (i: number) => void;
}) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "mp4";
  return (
    <div>
      <p className="font-medium text-sm">Parts</p>
      <ol className="mt-2 flex max-h-80 flex-col gap-2 overflow-y-auto">
        {parts.map((p, i) => {
          const status =
            active === undefined ? undefined : i < active ? "done" : i === active ? "now" : "next";
          return (
            <li
              key={`${p.start}-${p.end}`}
              className="flex flex-col gap-2 rounded-md bg-bg-subtle px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="tabular w-6 shrink-0 text-fg-muted">{i + 1}</span>
                <span className="tabular min-w-0 flex-1">
                  {formatTimecode(p.start)}–{formatTimecode(p.end)}
                  <span className="text-fg-muted">
                    {" "}
                    · {(p.end - p.start).toFixed(1)}
                    {NBSP}s
                  </span>
                </span>
                {status === "done" && (
                  <span className="flex items-center gap-1 text-fg-muted text-xs">
                    <Check size={14} strokeWidth={1.5} aria-hidden /> Written
                  </span>
                )}
                {status === "now" && <span className="text-xs">Writing</span>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label={`Name of part ${i + 1}`}
                  placeholder={partName(fileName, i, parts.length, ext).replace(/\.[^.]+$/, "")}
                  value={names[i] ?? ""}
                  disabled={disabled}
                  onChange={(e) => onName(i, e.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-md border border-border bg-bg-raised px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-60 sm:w-48 sm:flex-none"
                />
                {/* The first part has no cut before it; the empty slot keeps the name fields aligned. */}
                {i > 0 ? (
                  <Button
                    variant="ghost"
                    size="md"
                    className="h-11 w-16 shrink-0 px-0"
                    aria-label={`Join part ${i + 1} to part ${i}: remove the cut at ${formatTimecode(p.start)}`}
                    title="Join with the part before"
                    disabled={disabled}
                    onClick={() => onJoin(i)}
                  >
                    {/* A word, not an X: an X reads as "delete this part" (design review 2026-09-30). */}
                    Join
                  </Button>
                ) : (
                  <span className="h-11 w-16 shrink-0" aria-hidden />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Number field that commits on blur or Enter, so typing "1" on the way to "12" does not re-plan. */
function CommitNumber({
  id,
  value,
  min,
  max,
  step,
  onCommit,
  "aria-label": ariaLabel,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (n: number) => void;
  "aria-label"?: string;
}) {
  const shown = String(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    const n = Number(text);
    if (text.trim() !== "" && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
    else setText(shown);
  };
  return (
    <NumberInput
      id={id}
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      inputMode="numeric"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-11"
    />
  );
}
