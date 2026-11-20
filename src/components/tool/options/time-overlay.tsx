"use client";

import { useCallback, useId, useMemo } from "react";
import { BoxEditor } from "@/components/tool/regions/box-editor";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { usePlayhead } from "@/components/tool/regions/use-playhead";
import { ClockField } from "@/components/tool/text-time/clock-field";
import { ColourField } from "@/components/tool/text-time/colour-field";
import { PictureCanvas } from "@/components/tool/text-time/picture-canvas";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { PositionGrid } from "@/components/tool/watermark/position-grid";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, formatTimecode, withUnit } from "@/lib/format";
import { audioCopied, encodedSoundWords, needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import { drawBar, drawTimer } from "@/tools/engines/time-overlay/draw";
import {
  barProgress,
  barRect,
  barThickness,
  formatSteps,
  frameSec,
  isWhole,
  shownSteps,
  showsAt,
  spanSec,
  type TimeOverlayOptions,
  type TimerFormat,
  timeRange,
  timerAlign,
  timerFrom,
  timerMax,
  timerPx,
  timerRect,
  timerSizes,
  timerText,
} from "@/tools/engines/time-overlay/options";
import type { MediaInfo } from "@/tools/engines/types";
import { anchorNames, toFractions } from "@/tools/engines/watermark/options";
import { pictureSize } from "./picture-size";
import { between, z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = TimeOverlayOptions;

const sourceOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

function soundWords(info: MediaInfo) {
  if (!info.audio?.length) return "no sound";
  return audioCopied(info, compositeContainer(sourceName(info)))
    ? "sound copied"
    : encodedSoundWords(compositeContainer(sourceName(info)), soundEncodersNow());
}

/** The page's sans, for the preview's digits (the worker uses the same Geist from /wasm/fonts). */
function pageFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
    "sans-serif"
  );
}

const span = (o: O, info: MediaInfo) => {
  const r = timeRange(o, info.durationSec);
  return isWhole(r, info.durationSec)
    ? "whole video"
    : `${formatTimecode(r.start)} to ${formatTimecode(r.end)}`;
};

const placeShort = (o: O) =>
  o.anchor === "custom" ? "placed by hand" : anchorNames[o.anchor].toLowerCase();

/** "0:00 to 0:09", the first and last values the timer shows. */
function timerSpan(o: O, info: MediaInfo) {
  const r = timeRange(o, info.durationSec);
  const f = frameSec(info.video?.fps);
  const first = formatSteps(shownSteps(timerFrom(o, r, f), o.format, o.direction), o.format);
  const lastValue =
    o.direction === "down" ? Math.max(0, timerFrom(o, r, f) - spanSec(r, f)) : timerMax(o, r, f);
  const last = formatSteps(shownSteps(lastValue, o.format, o.direction), o.format);
  return `${first} to ${last}`;
}

const barPx = (o: O, info: MediaInfo) => barRect(o, sourceOf(info)).height;

export const timeOverlaySpec: OptionsSpec<O> = {
  verb: "Add",
  remember: {
    schema: z.object({
      edge: z.enum(["bottom", "top"]),
      thickness: between(0.001, 0.1),
      track: z.boolean(),
      inset: between(0, 0.2),
      size: between(0.02, 0.3),
      style: z.enum(["shadow", "outline", "box"]),
      anchor: z.enum(["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br", "custom"]),
      fx: between(0, 1),
      fy: between(0, 1),
      margin: between(0, 0.25),
    }),
  },
  defaults: (info, preset) => ({
    kind: preset.kind === "timer" ? "timer" : "progress",
    color: "#ffffff",
    edge: "bottom",
    thickness: barThickness.medium,
    track: true,
    inset: 0,
    direction: preset.direction === "down" ? "down" : "up",
    format: info.durationSec >= 3600 ? "h:mm:ss" : "m:ss",
    size: timerSizes.medium,
    style: "shadow",
    anchor: "tr",
    fx: 1,
    fy: 0,
    margin: 0.04,
  }),
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  shortcuts: [
    { keys: "Arrows", label: "Move the timer (focus it on the picture)" },
    { keys: "+ −", label: "Make it larger or smaller" },
  ],
  blocked: (o, info, _inputs, file) => {
    const what = o.kind === "progress" ? "a progress bar" : "a timer";
    if (!info.video)
      return unfixable(`This file has no video track to put ${what} on. Choose a video file.`);
    if (needsFfmpeg(info, file?.name ?? sourceName(info)))
      return {
        reason:
          info.video.decodable === false
            ? `This browser cannot decode this video's picture, so ${what} cannot be drawn on it.`
            : "This tool cannot open this format. Convert it to MP4 first, then come back.",
        action: { slug: "video-converter", label: "Convert to MP4" },
        fixable: false,
      };
    if (info.durationSec <= 0)
      return unfixable("This video has no length to measure. Choose another video.");
    return undefined;
  },
  summary: (o, info) => {
    if (!info.video) return undefined;
    const size = pictureSize(info);
    const what =
      o.kind === "progress"
        ? `${withUnit(barPx(o, info), "px")} bar along the ${o.edge}`
        : `Counts ${o.direction} ${timerSpan(o, info)} · ${placeShort(o)}`;
    return `${what} · ${span(o, info)} · H.264 ${formatDimensions(size.width, size.height)} · ${soundWords(info)}`;
  },
  result: (o) => ({ title: o.kind === "progress" ? "Progress bar added" : "Timer added" }),
  Overlay: TimeOverlayPreview,
  Below({ value, onChange, info, media, disabled }) {
    if (!info.video) return null;
    const r = timeRange(value, info.durationSec);
    return (
      <div className="flex flex-col gap-2">
        <TrimTimeline
          file={media.file}
          video={media.video}
          duration={info.durationSec}
          fps={info.video.fps || 30}
          value={r}
          onChange={(range) =>
            onChange({ ...value, range: isWhole(range, info.durationSec) ? undefined : range })
          }
          disabled={disabled}
        />
        <p className="text-fg-muted text-xs">
          {value.kind === "progress"
            ? "Drag the handles to choose the part the bar measures. It is full on the last frame."
            : "Drag the handles to choose when the timer runs."}
        </p>
      </div>
    );
  },
  Panel: TimePanel,
};

function TimeOverlayPreview(props: OptionsPanelProps<O>) {
  return props.info.video ? <PreviewOn {...props} /> : null;
}

function PreviewOn({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const w = info.video?.width ?? 0;
  const h = info.video?.height ?? 0;
  const source = useMemo(() => ({ width: w, height: h }), [w, h]);
  const now = usePlayhead(media.video);
  const r = timeRange(value, info.durationSec);
  const frame = frameSec(info.video?.fps);
  const on = showsAt(r, now);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!on) return;
      if (value.kind === "progress")
        drawBar(ctx, barRect(value, source), barProgress(r, frame, now), value.color, value.track);
      else
        drawTimer(
          ctx,
          timerText(value, r, frame, now),
          timerRect(value, r, frame, source),
          timerPx(value, source),
          { color: value.color, style: value.style, align: timerAlign(value) },
          pageFamily(),
        );
    },
    [value, source, r, frame, now, on],
  );
  const rect = value.kind === "timer" ? timerRect(value, r, frame, source) : undefined;
  return (
    <PictureCanvas source={source} draw={draw}>
      {rect && (
        <BoxEditor
          boxes={[{ id: 1, rect, label: "Timer", hidden: !on }]}
          selected={1}
          source={source}
          disabled={disabled}
          noun="timer"
          resize="aspect"
          help="Drag the timer to place it, or a corner handle to resize it. Arrow keys move it, Shift moves further, plus and minus resize it."
          onSelect={() => undefined}
          onChange={(_id, next) => {
            const k = next.rect.width / Math.max(1, rect.width);
            const size = Math.min(0.3, Math.max(0.02, value.size * k));
            // Where the box was put, kept as a share of the free space (the watermark's custom spot).
            const moved = Math.abs(k - 1) < 1e-3;
            const placed = timerRect({ ...value, size }, r, frame, source);
            const at = moved
              ? toFractions(
                  {
                    ...placed,
                    x: next.rect.x + (next.rect.width - placed.width) / 2,
                    y: next.rect.y + (next.rect.height - placed.height) / 2,
                  },
                  source,
                )
              : undefined;
            onChange({ ...value, size, ...(at ? { anchor: "custom", ...at } : {}) });
          }}
        />
      )}
    </PictureCanvas>
  );
}

const THICK = [
  { value: "thin", label: "Thin" },
  { value: "medium", label: "Medium" },
  { value: "thick", label: "Thick" },
] as const;
const SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

function TimePanel(props: OptionsPanelProps<O>) {
  if (!props.info.video) return null;
  return props.value.kind === "progress" ? <BarPanel {...props} /> : <TimerPanel {...props} />;
}

function BarPanel({ value, onChange, info, disabled }: OptionsPanelProps<O>) {
  const edgeId = useId();
  const thickId = useId();
  const source = sourceOf(info);
  const shorter = Math.min(source.width, source.height);
  const preset = (Object.keys(barThickness) as (keyof typeof barThickness)[]).find(
    (k) => Math.abs(barThickness[k] - value.thickness) < 1e-6,
  );
  return (
    <div className="flex flex-col gap-6">
      <Field label="Position" labelId={edgeId}>
        <Segmented<O["edge"]>
          name="bar-edge"
          aria-labelledby={edgeId}
          value={value.edge}
          onChange={(edge) => onChange({ ...value, edge })}
          options={[
            { value: "bottom", label: "Bottom" },
            { value: "top", label: "Top" },
          ]}
        />
      </Field>
      <Field label="Thickness" labelId={thickId}>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Segmented<string>
              name="bar-thickness"
              aria-labelledby={thickId}
              value={preset ?? ""}
              onChange={(k) =>
                onChange({ ...value, thickness: barThickness[k as keyof typeof barThickness] })
              }
              options={THICK.map((t) => ({ value: t.value, label: t.label }))}
            />
          </div>
          <UnitField
            id="bar-thickness-px"
            label="Thickness in pixels"
            value={barRect(value, source).height}
            min={1}
            max={Math.max(2, Math.round(shorter * 0.1))}
            unit="px"
            onCommit={(n) => onChange({ ...value, thickness: Math.max(0.001, n / shorter) })}
          />
        </div>
      </Field>
      <ColourField
        name="bar-colour"
        value={value.color}
        disabled={disabled}
        custom={false}
        onChange={(color) => onChange({ ...value, color })}
      />
      <Checkbox
        label="Show the track"
        hint="A see-through strip under the whole bar, so viewers can see where it ends."
        checked={value.track}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, track: e.target.checked })}
      />
      <MoreOptions>
        <ColourField
          name="bar-colour-custom"
          label="Any colour"
          value={value.color}
          disabled={disabled}
          presets={false}
          onChange={(color) => onChange({ ...value, color })}
        />
        <Field
          label="Distance from the edge"
          htmlFor="bar-inset"
          trailing="of the shorter side"
          hint="Lifts the bar off the edge, clear of a player's own controls."
        >
          <UnitField
            id="bar-inset"
            label="Distance from the edge in percent of the shorter side"
            value={value.inset * 100}
            min={0}
            max={20}
            unit="%"
            onCommit={(n) => onChange({ ...value, inset: n / 100 })}
          />
        </Field>
      </MoreOptions>
    </div>
  );
}

const FORMATS: { value: TimerFormat; label: string }[] = [
  { value: "m:ss", label: "m:ss" },
  { value: "h:mm:ss", label: "h:mm:ss" },
  { value: "s.t", label: "s.t" },
];

function TimerPanel({ value, onChange, info, disabled }: OptionsPanelProps<O>) {
  const countId = useId();
  const fromId = useId();
  const formatId = useId();
  const sizeId = useId();
  const styleId = useId();
  const posId = useId();
  const source = sourceOf(info);
  const r = timeRange(value, info.durationSec);
  const frame = frameSec(info.video?.fps);
  const sizePreset = (Object.keys(timerSizes) as (keyof typeof timerSizes)[]).find(
    (k) => Math.abs(timerSizes[k] - value.size) < 1e-6,
  );
  const fmt = (s: number) => formatSteps(shownSteps(s, value.format, "up"), value.format);
  const autoFrom = formatSteps(
    shownSteps(timerFrom({ direction: value.direction }, r, frame), value.format, value.direction),
    value.format,
  );
  return (
    <div className="flex flex-col gap-6">
      <Field label="Count" labelId={countId}>
        <Segmented<O["direction"]>
          name="timer-direction"
          aria-labelledby={countId}
          value={value.direction}
          onChange={(direction) => onChange({ ...value, direction })}
          options={[
            { value: "up", label: "Up" },
            { value: "down", label: "Down" },
          ]}
        />
      </Field>
      <Field
        label="Start at"
        htmlFor={fromId}
        hint={
          value.direction === "down"
            ? "m:ss or seconds. Empty counts down to 0:00 on the last frame."
            : "m:ss or seconds. Empty starts at 0:00."
        }
      >
        <div className="w-36">
          <ClockField
            id={fromId}
            value={value.from}
            placeholder={`auto (${autoFrom})`}
            format={fmt}
            disabled={disabled}
            onCommit={(from) => onChange({ ...value, from })}
          />
        </div>
      </Field>
      <Field
        label="Size"
        labelId={sizeId}
        trailing={`${withUnit(timerPx(value, source), "px")} digits`}
      >
        <Segmented<string>
          name="timer-size"
          aria-labelledby={sizeId}
          value={sizePreset ?? ""}
          onChange={(k) => onChange({ ...value, size: timerSizes[k as keyof typeof timerSizes] })}
          options={SIZES.map((s) => ({ value: s.value, label: s.label }))}
        />
      </Field>
      <ColourField
        name="timer-colour"
        value={value.color}
        disabled={disabled}
        custom={false}
        onChange={(color) => onChange({ ...value, color })}
      />
      <Field
        label="Position"
        labelId={posId}
        hint={
          value.anchor === "custom"
            ? "Placed by dragging. Pick a square to snap it to an edge or corner."
            : "Or drag the timer on the preview to place it anywhere."
        }
      >
        <PositionGrid
          value={value.anchor}
          labelledBy={posId}
          onChange={(anchor) => onChange({ ...value, anchor })}
        />
      </Field>
      <MoreOptions>
        <Field
          label="Style"
          labelId={styleId}
          hint="Shadow for calm footage; outline or a box over busy or bright footage."
        >
          <Segmented<O["style"]>
            name="timer-style"
            aria-labelledby={styleId}
            value={value.style}
            onChange={(style) => onChange({ ...value, style })}
            options={[
              { value: "shadow", label: "Shadow" },
              { value: "outline", label: "Outline" },
              { value: "box", label: "Box" },
            ]}
          />
        </Field>
        <ColourField
          name="timer-colour-custom"
          label="Any colour"
          value={value.color}
          disabled={disabled}
          presets={false}
          onChange={(color) => onChange({ ...value, color })}
        />
        <Field label="Format" labelId={formatId}>
          <Segmented<TimerFormat>
            name="timer-format"
            aria-labelledby={formatId}
            value={value.format}
            onChange={(format) => onChange({ ...value, format })}
            options={FORMATS}
          />
        </Field>
        <Field
          label="Distance from the edge"
          htmlFor="timer-margin"
          trailing="of the shorter side"
          hint="Used by the nine positions; a dragged timer stays where you put it."
        >
          <UnitField
            id="timer-margin"
            label="Distance from the edge in percent of the shorter side"
            value={value.margin * 100}
            min={0}
            max={25}
            unit="%"
            onCommit={(n) => onChange({ ...value, margin: n / 100 })}
          />
        </Field>
      </MoreOptions>
    </div>
  );
}
