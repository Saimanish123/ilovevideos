"use client";

import { useEffect, useId, useState } from "react";
import { type BarsValue, barsHooks } from "@/components/tool/crop/black-bars";
import { CropFrame } from "@/components/tool/crop/crop-frame";
import { geometryEstimate } from "@/components/tool/crop/estimate";
import { PreviewScrubber } from "@/components/tool/crop/preview-scrubber";
import { ShapePicker } from "@/components/tool/crop/shape-picker";
import { shapeLabel, shapeOption, shapesFor } from "@/components/tool/crop/shapes";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { formatBytes, formatDimensions, withUnit } from "@/lib/format";
import {
  evenFloor,
  fullRect,
  isFullFrame,
  keptShare,
  largestRect,
  MIN_EDGE,
  normalizeRect,
  type RatioId,
  type Rect,
  ratioIds,
  ratioValue,
  refitToRatio,
  type Size,
} from "@/tools/engines/crop/math";
import { type CropOptions, cropRect } from "@/tools/engines/crop/options";
import { needsFfmpeg } from "@/tools/engines/crop/plan";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsSpec } from "./types";

const isRatio = (v: unknown): v is RatioId =>
  typeof v === "string" && (ratioIds as readonly string[]).includes(v);

const withRect = (o: CropOptions, r: Rect): CropOptions => ({ ...o, ...r });
const sourceOf = (info: MediaInfo): Size => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});
const percent = (share: number) => `${Math.round(share * 100)}%`;

type Edge = keyof Rect;
const fieldName: Record<Edge, string> = { x: "Left", y: "Top", width: "Width", height: "Height" };

/**
 * Why a typed value came out different, in one sentence, so a corrected number never looks like a
 * bug: odd sizes snap to even, the frame has a minimum, and it cannot leave the picture.
 */
function correction(
  edge: Edge,
  typed: number,
  got: Rect,
  src: Size,
  locked: boolean,
): string | undefined {
  const value = got[edge];
  if (Math.round(typed) === value) return undefined;
  const px = (n: number) => withUnit(n, "px");
  if ((edge === "width" || edge === "height") && typed < MIN_EDGE)
    return `${fieldName[edge]} raised to ${px(value)}, the smallest frame this tool makes.`;
  const max = edge === "width" || edge === "x" ? evenFloor(src.width) : evenFloor(src.height);
  if ((edge === "width" || edge === "height") && typed > max)
    return `${fieldName[edge]} limited to ${px(value)}, the full ${edge} of the picture.`;
  // A one-pixel change is the even-number snap, whichever direction it went.
  if (Math.abs(typed - value) <= 1)
    return `${fieldName[edge]} snapped to ${px(value)}: H.264 needs even numbers.`;
  if ((edge === "x" || edge === "y") && typed > value)
    return `${fieldName[edge]} set to ${px(value)} so the frame stays inside the picture.`;
  if (locked)
    return `${fieldName[edge]} set to ${px(value)} to keep the locked shape inside the picture.`;
  return `${fieldName[edge]} set to ${px(value)} to fit the picture.`;
}

const plainCropSpec: OptionsSpec<CropOptions> = {
  verb: "Crop",
  defaults: (info, preset) => {
    const src = sourceOf(info);
    const aspect = isRatio(preset.aspect) ? preset.aspect : "free";
    const ratio = ratioValue(aspect);
    return { ...(ratio ? largestRect(src, ratio) : fullRect(src)), aspect };
  },
  route: (_o, info, fileName) => (needsFfmpeg(info, fileName) ? "page" : "worker"),
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track to crop.";
    if (isFullFrame(cropRect(o, info.video), info.video))
      return "Drag the frame's edges or corners, or pick a shape, to choose what to keep.";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const r = cropRect(o, v);
    if (isFullFrame(r, v)) return undefined;
    const est = geometryEstimate(info, r);
    return `Output ${formatDimensions(r.width, r.height)}, about ${formatBytes(est.bytes)}. A crop re-encodes the picture to H.264 at high quality. ${est.audio}${est.container} Runs on this device.`;
  },
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress the cropped video" },
  result: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const r = cropRect(o, v);
    return {
      title: `Cropped to ${formatDimensions(r.width, r.height)}`,
      detail: `Shape ${shapeLabel(r, o.aspect)}, ${percent(keptShare(r, v))} of the picture kept. The preview now plays the result.`,
    };
  },
  Overlay({ value, onChange, info, disabled }) {
    const src = sourceOf(info);
    return (
      <CropFrame
        source={src}
        rect={cropRect(value, src)}
        ratio={ratioValue(value.aspect)}
        onChange={(r) => onChange(withRect(value, r))}
        disabled={disabled}
        label="Crop frame"
      />
    );
  },
  Below({ info, media, disabled }) {
    return (
      <PreviewScrubber file={media.file} video={media.video} info={info} disabled={disabled} />
    );
  },
  Panel({ value, onChange, info }) {
    const shapeId = useId();
    const [notice, setNotice] = useState<string>();
    const src = sourceOf(info);
    const r = cropRect(value, src);
    const ratio = ratioValue(value.aspect);
    const full = isFullFrame(r, src);
    const set = (edge: Edge, typed: number) => {
      const next = { ...r, [edge]: typed };
      // With a shape lock, typing a width or height moves the other to match.
      if (ratio && edge === "width") next.height = next.width / ratio;
      else if (ratio && edge === "height") next.width = next.height * ratio;
      if (ratio && (edge === "width" || edge === "height")) {
        const cap = largestRect(src, ratio);
        if (next.width > cap.width) {
          next.width = cap.width;
          next.height = cap.height;
        }
      }
      const got = normalizeRect(next, src);
      setNotice(correction(edge, typed, got, src, !!ratio));
      onChange(withRect(value, got));
    };
    const shapes = shapesFor(ratioIds, src, value.aspect);
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p id={shapeId} className="font-medium text-sm">
            Shape
          </p>
          <div className="mt-2">
            <ShapePicker
              name="aspect"
              aria-labelledby={shapeId}
              value={value.aspect}
              columns={3}
              options={shapes.map(shapeOption)}
              onChange={(aspect) => {
                setNotice(undefined);
                const lock = ratioValue(aspect);
                onChange({ ...withRect(value, lock ? refitToRatio(r, src, lock) : r), aspect });
              }}
            />
          </div>
          <p className="mt-2 text-fg-muted text-xs">
            A shape locks the frame; Free lets each edge move on its own.
            {shapes.length < ratioIds.length && " The shape this video already has is not listed."}
          </p>
        </div>
        <fieldset className="flex flex-col">
          <legend className="font-medium text-sm">Position and size</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(["x", "y", "width", "height"] as const).map((edge) => (
              <PxField
                key={edge}
                id={`crop-${edge}`}
                label={fieldName[edge]}
                value={r[edge]}
                onCommit={(n) => set(edge, n)}
              />
            ))}
          </div>
          <p className="mt-2 text-fg-muted text-xs" aria-live="polite">
            {notice ?? "Pixels of the original picture, snapped to even numbers for H.264."}
          </p>
        </fieldset>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="tabular text-sm" aria-live="polite">
            <span className="font-medium">{formatDimensions(r.width, r.height)}</span>
            <span className="text-fg-muted">
              {" "}
              · {full ? "whole picture" : `${percent(keptShare(r, src))} of the picture kept`}
            </span>
          </p>
          {!full && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => {
                setNotice(undefined);
                onChange({ ...withRect(value, fullRect(src)), aspect: "free" });
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>
    );
  },
};

/**
 * Crop, and the remove-black-bars page on the same engine (`bars` in the preset, ./crop/black-bars):
 * that page keeps the crop frame and the scrubber, and swaps the panel, the line and the verdict.
 */
export const cropSpec: OptionsSpec<BarsValue> = {
  ...plainCropSpec,
  defaults: (info, preset) => ({
    ...plainCropSpec.defaults(info, preset),
    ...(preset.bars === true ? { bars: true } : {}),
  }),
  blocked: (o, info, inputs, file) =>
    o.bars
      ? barsHooks.blocked?.(o, info, inputs, file)
      : plainCropSpec.blocked?.(o, info, inputs, file),
  summary: (o, info, inputs) =>
    o.bars ? barsHooks.summary?.(o, info, inputs) : plainCropSpec.summary?.(o, info, inputs),
  result: (o, info, output) =>
    o.bars ? barsHooks.result?.(o, info, output) : plainCropSpec.result?.(o, info, output),
  Panel(props) {
    const Bars = barsHooks.Panel;
    const Plain = plainCropSpec.Panel;
    return props.value.bars ? <Bars {...props} /> : <Plain {...props} />;
  },
};

/** Pixel field: free typing while focused; clamped and snapped on blur or Enter. */
function PxField({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (n: number) => void;
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
    if (text.trim() !== "" && Number.isFinite(n) && n !== value) onCommit(Math.max(0, n));
    else setText(shown);
  };
  return (
    <Field label={label} htmlFor={id} trailing="px">
      <NumberInput
        id={id}
        min={0}
        step={2}
        inputMode="numeric"
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </Field>
  );
}
