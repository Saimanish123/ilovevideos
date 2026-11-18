"use client";

import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { formatDimensions } from "@/lib/format";
import {
  type ColorTransform,
  isIdentity,
  svgMatrixValues,
} from "@/tools/engines/video-filter/color";
import {
  colorLookIds,
  isLookId,
  type LookId,
  looks,
  monoLookIds,
} from "@/tools/engines/video-filter/looks";
import {
  type FilterOptions,
  filterIsNoop,
  filterTransform,
} from "@/tools/engines/video-filter/options";
import {
  containerNote,
  needsFfmpeg,
  pictureContainer,
  pictureEstimate,
  soundLine,
  soundPlan,
  sourceName,
} from "@/tools/engines/video-filter/plan";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { type Choice, Choices } from "./choices";
import { pictureSize, sizeNote } from "./picture-size";
import type { OptionsSpec } from "./types";

/**
 * The preview compares through the value (`compare: "before"` shows the untouched picture); the
 * engine's schema drops the key. The preview itself is an SVG filter with the same numbers the
 * encoder uses (video-filter/color), applied to the <video> by `previewStyle`.
 */
type FilterValue = FilterOptions & { compare?: "before" | "after" };

const FILTER_ID = "video-filter-preview";

/** The SVG filter the preview references: the power curve, then the matrix, in sRGB like the encoder. */
function PreviewFilter({ t }: { t: ColorTransform }) {
  const [r, g, b] = t.gamma;
  return (
    <svg aria-hidden width="0" height="0" className="absolute" focusable="false">
      <filter id={FILTER_ID} colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1" exponent={r} offset="0" />
          <feFuncG type="gamma" amplitude="1" exponent={g} offset="0" />
          <feFuncB type="gamma" amplitude="1" exponent={b} offset="0" />
        </feComponentTransfer>
        <feColorMatrix type="matrix" values={svgMatrixValues(t.matrix)} />
      </filter>
    </svg>
  );
}

/**
 * "Original" on the stage while Before is shown, so a paused frame is never mistaken for the
 * result. Rendered into the preview's own box (a portal next to the <video>); no animation.
 */
function OriginalLabel({
  video,
  show,
}: {
  video: RefObject<HTMLVideoElement | null>;
  show: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let parent: HTMLElement | null = null;
    let before = "";
    const attach = () => {
      parent = video.current?.parentElement ?? null;
      if (!parent) {
        if (tries++ < 240) raf = requestAnimationFrame(attach);
        return;
      }
      before = parent.style.position;
      if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
      setHost(parent);
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (parent) parent.style.position = before;
    };
  }, [video]);
  if (!host || !show) return null;
  return createPortal(
    <span
      data-testid="original-label"
      className="pointer-events-none absolute top-3 left-3 rounded-sm bg-gray-950 px-2 py-1 text-gray-50 text-xs"
    >
      Original
    </span>,
    host,
  );
}

const choicesFor = (ids: readonly LookId[]): Choice<LookId>[] =>
  ids.map((id) => ({ value: id, label: looks[id].label, detail: looks[id].detail }));

const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}`;

function AdjustSlider({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} labelId={`${id}-l`} hint={hint}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Slider
            aria-labelledby={`${id}-l`}
            value={Math.round(value * 100)}
            min={-100}
            max={100}
            step={1}
            disabled={disabled}
            getAriaValueText={(_f, v) => `${pct(v / 100)}`}
            onValueChange={(v) => onChange(v / 100)}
          />
        </div>
        <NumberInput
          aria-label={`${label}, −100 to 100`}
          className="w-20 shrink-0"
          min={-100}
          max={100}
          step={1}
          value={Math.round(value * 100)}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n))
              onChange(Math.max(-1, Math.min(1, n / 100)));
          }}
        />
      </div>
    </Field>
  );
}

function jobOf(preset: Record<string, unknown>): FilterOptions["job"] {
  return preset.job === "mono" || preset.job === "adjust" ? preset.job : "look";
}

export const filterSpec: OptionsSpec<FilterValue> = {
  verb: "Apply",
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress the result" },
  shortcuts: [{ keys: "C", label: "Compare with the original" }, PLAY_SHORTCUT],
  defaults: (_info, preset) => {
    const job = jobOf(preset);
    return {
      job,
      look: isLookId(preset.look) ? preset.look : job === "mono" ? "neutral" : "sepia",
      strength: typeof preset.strength === "number" ? preset.strength : 1,
      // The adjust page opens with a gentle lift, so a first run on a dark clip already helps.
      brightness:
        typeof preset.brightness === "number" ? preset.brightness : job === "adjust" ? 0.2 : 0,
      contrast: typeof preset.contrast === "number" ? preset.contrast : 0,
      saturation: typeof preset.saturation === "number" ? preset.saturation : 0,
      compare: "after",
    };
  },
  route: (_o, info, fileName) => (needsFfmpeg(info, fileName) ? "page" : "worker"),
  previewStyle: (o) =>
    o.compare === "before" || isIdentity(filterTransform(o))
      ? undefined
      : { filter: `url(#${FILTER_ID})` },
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track.";
    if (filterIsNoop(o))
      return o.job === "adjust"
        ? "All three sliders are at 0, which leaves the picture as it is. Move one first."
        : "At 0% the look leaves the picture as it is. Raise the strength first.";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || filterIsNoop(o)) return undefined;
    const est = pictureEstimate(info, v);
    const to = pictureContainer(sourceName(info));
    const sound = soundLine(needsFfmpeg(info, sourceName(info)) ? "encode" : soundPlan(info, to));
    const out = pictureSize(info);
    return `Output ${formatDimensions(out.width, out.height)}, ${est.label}.${sizeNote(info)} Every frame is re-encoded to H.264 with the colours the preview shows. ${sound}${containerNote(info)} Runs on this device.`;
  },
  result: (o) => ({
    title:
      o.job === "mono"
        ? `Black and white: ${looks[o.look].label.toLowerCase()}`
        : o.job === "adjust"
          ? `Adjusted: brightness ${pct(o.brightness)}, contrast ${pct(o.contrast)}, saturation ${pct(o.saturation)}`
          : `${looks[o.look].label} applied${o.strength < 1 ? ` at ${Math.round(o.strength * 100)}%` : ""}`,
    detail: "The preview plays the result. Colours can look slightly different in other players.",
    change: false,
  }),
  Panel({ value, onChange, disabled, preset, media }) {
    const root = useRef<HTMLDivElement>(null);
    const lookId = useId();
    const compareId = useId();
    const strengthId = useId();
    const job = value.job ?? jobOf(preset);
    const t = filterTransform(value);
    useWorkspaceKeys(
      root,
      [
        {
          key: "c",
          run: () =>
            onChange({ ...value, compare: value.compare === "before" ? "after" : "before" }),
        },
      ],
      !disabled,
    );
    return (
      <div ref={root} className="flex flex-col gap-6">
        <PreviewFilter t={t} />
        <OriginalLabel video={media.video} show={value.compare === "before"} />
        <Field
          label="Preview"
          labelId={compareId}
          hint="Switch to see the original, or press C. The preview plays with the same colours the file will have."
        >
          <Segmented
            name="filter-compare"
            aria-labelledby={compareId}
            value={value.compare ?? "after"}
            onChange={(compare) => onChange({ ...value, compare })}
            options={[
              { value: "before", label: "Before" },
              { value: "after", label: "After" },
            ]}
          />
        </Field>
        {job === "adjust" ? (
          <>
            <AdjustSlider
              label="Brightness"
              value={value.brightness}
              disabled={disabled}
              onChange={(brightness) => onChange({ ...value, brightness })}
              hint="Lifts or deepens the midtones; black and white stay where they are."
            />
            <AdjustSlider
              label="Contrast"
              value={value.contrast}
              disabled={disabled}
              onChange={(contrast) => onChange({ ...value, contrast })}
              hint="Spreads or flattens the tones around mid grey. High values clip highlights."
            />
            <AdjustSlider
              label="Saturation"
              value={value.saturation}
              disabled={disabled}
              onChange={(saturation) => onChange({ ...value, saturation })}
              hint="−100 is black and white; +100 is twice as colourful."
            />
          </>
        ) : (
          <>
            <Field
              label={job === "mono" ? "Black and white" : "Look"}
              labelId={lookId}
              hint={
                job === "mono"
                  ? "Neutral weighs colours by how bright they look to the eye; the others shift that balance."
                  : "Each look is a fixed colour transform; the strength blends it with the original."
              }
            >
              <Choices
                name="filter-look"
                aria-labelledby={lookId}
                columns={2}
                value={value.look}
                onChange={(look) => onChange({ ...value, look })}
                options={choicesFor(job === "mono" ? monoLookIds : colorLookIds)}
              />
            </Field>
            <Field
              label="Strength"
              labelId={strengthId}
              trailing={`${Math.round(value.strength * 100)}%`}
            >
              <Slider
                aria-labelledby={strengthId}
                value={Math.round(value.strength * 100)}
                min={0}
                max={100}
                step={1}
                disabled={disabled}
                getAriaValueText={(_f, v) => `${v}%`}
                onValueChange={(v) => onChange({ ...value, strength: v / 100 })}
              />
            </Field>
          </>
        )}
      </div>
    );
  },
};
