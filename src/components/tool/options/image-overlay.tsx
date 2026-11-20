"use client";

import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FileName } from "@/components/tool/file-card";
import { BoxEditor } from "@/components/tool/regions/box-editor";
import { LayerTimeline } from "@/components/tool/regions/layer-timeline";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { usePlayhead } from "@/components/tool/regions/use-playhead";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatDimensions } from "@/lib/format";
import { encodedSize } from "@/tools/engines/crop/math";
import { audioCopied, needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import {
  IMAGE_ACCEPT,
  type ImageLayer,
  type ImageOverlayOptions,
  layerRange,
  layerRect,
  MAX_LAYERS,
  newPlacement,
  nextLayerId,
  placeFromRect,
  restack,
  showsAt,
} from "@/tools/engines/image-overlay/options";
import { readLayerImage } from "@/tools/engines/image-overlay/read";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = ImageOverlayOptions;

const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});
const frameSecOf = (info: MediaInfo) =>
  1 / (info.video?.fps && info.video.fps > 0 ? info.video.fps : 30);

/** True when this browser plays animated layers only as their first frame (no `ImageDecoder`). */
const firstFrameOnly = () => typeof ImageDecoder === "undefined";

/** The size the file is written at (H.264 drops an odd last column or row). */
const outSize = (info: MediaInfo) => {
  const e = encodedSize({ width: info.video?.width ?? 0, height: info.video?.height ?? 0 });
  return formatDimensions(e.width, e.height);
};

function soundWords(info: MediaInfo, fileName: string) {
  if (!info.audio?.length) return "no sound";
  return audioCopied(info, compositeContainer(fileName)) ? "sound copied" : "sound in AAC";
}

const imageCount = (n: number) => `${n} ${n === 1 ? "image" : "images"}`;

export const imageOverlaySpec: OptionsSpec<O> = {
  verb: "Add to video",
  defaults: () => ({ layers: [] }),
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  shortcuts: [
    { keys: "Arrows", label: "Move the selected image" },
    { keys: "+ −", label: "Resize it" },
    { keys: "[ ]", label: "Turn it" },
    { keys: "Delete", label: "Remove it" },
  ],
  blocked: (o, info, _inputs, file) => {
    if (!info.video)
      return unfixable("This file has no video track to put an image on. Choose a video file.");
    if (needsFfmpeg(info, file?.name ?? sourceName(info)))
      return {
        reason:
          info.video.decodable === false
            ? "This browser cannot decode this video's picture, so images cannot be drawn over it."
            : "This tool cannot open this format. Convert it to MP4 first, then come back.",
        action: { slug: "video-converter", label: "Convert to MP4" },
        fixable: false,
      };
    if (o.layers.length === 0) return "Add an image first.";
    return undefined;
  },
  summary: (o, info) =>
    `${imageCount(o.layers.length)} on the picture · H.264 ${outSize(info)} · ${soundWords(info, sourceName(info))}`,
  result: (o, info) => {
    if (!info.video) return undefined;
    const n = imageCount(o.layers.length);
    return {
      title: `${n[0]?.toUpperCase()}${n.slice(1)} added`,
      detail: "The preview plays the result.",
    };
  },
  Overlay: ImageOverlayEditor,
  Below: ImageBelow,
  Panel: ImagePanel,
};

/** Object URLs for the layers' images, made once per image and revoked when it goes. */
function useLayerUrls(layers: ImageLayer[]) {
  const cache = useRef(new Map<Blob, string>());
  const [, bump] = useState(0);
  useEffect(() => {
    const live = new Set(layers.map((l) => l.blob));
    let changed = false;
    for (const l of layers)
      if (!cache.current.has(l.blob)) {
        cache.current.set(l.blob, URL.createObjectURL(l.blob));
        changed = true;
      }
    for (const [blob, url] of cache.current)
      if (!live.has(blob)) {
        URL.revokeObjectURL(url);
        cache.current.delete(blob);
      }
    if (changed) bump((n) => n + 1);
  }, [layers]);
  useEffect(() => {
    const map = cache.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);
  return (blob: Blob) => cache.current.get(blob);
}

const update = (o: O, id: number, patch: Partial<ImageLayer>): O => ({
  ...o,
  layers: o.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
});

const nameOf = (o: O, id: number | undefined) => {
  const i = o.layers.findIndex((l) => l.id === id);
  return i < 0 ? undefined : `Image ${i + 1}`;
};

function ImageOverlayEditor(props: OptionsPanelProps<O>) {
  return props.info.video ? <ImageOverlayEditorOn {...props} /> : null;
}

function ImageOverlayEditorOn({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const w = info.video?.width ?? 0;
  const h = info.video?.height ?? 0;
  const source = useMemo(() => ({ width: w, height: h }), [w, h]);
  const now = usePlayhead(media.video);
  const url = useLayerUrls(value.layers);
  const boxes = value.layers.map((l, i) => ({
    id: l.id,
    rect: layerRect(l, source),
    rotation: l.rotation,
    label: `Image ${i + 1}`,
    hidden: !showsAt(l, now),
    src: url(l.blob),
    opacity: l.opacity,
  }));
  return (
    <BoxEditor
      boxes={boxes}
      selected={value.selected}
      source={source}
      disabled={disabled}
      noun="image"
      resize="aspect"
      rotatable
      help="Drag an image to move it, a corner handle to resize it, or the round handle above it to turn it. Arrow keys move it, Shift moves further, plus and minus resize it, the square brackets turn it, Delete removes it."
      onSelect={(selected) => onChange({ ...value, selected })}
      onChange={(id, { rect, rotation }) =>
        onChange({
          ...update(value, id, { ...placeFromRect(rect, source), rotation: rotation ?? 0 }),
          selected: id,
        })
      }
      onDelete={(id) => {
        const layers = value.layers.filter((l) => l.id !== id);
        onChange({ ...value, layers, selected: layers[layers.length - 1]?.id });
      }}
    />
  );
}

function ImageBelow({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  if (!info.video) return null;
  const l = value.layers.find((x) => x.id === value.selected);
  return (
    <LayerTimeline
      file={media.file}
      video={media.video}
      duration={info.durationSec}
      fps={info.video?.fps ?? 30}
      name={nameOf(value, value.selected)}
      range={l ? layerRange(l, info.durationSec) : undefined}
      onRange={(range) => {
        if (!l) return;
        const end = range.end >= info.durationSec - frameSecOf(info) / 2 ? undefined : range.end;
        onChange(update(value, l.id, { start: range.start, end }));
      }}
      disabled={disabled}
    />
  );
}

const SIZES = [
  { value: "0.15", label: "Small" },
  { value: "0.3", label: "Medium" },
  { value: "0.5", label: "Large" },
];
const OPACITIES = [
  { value: "0.5", label: "Half" },
  { value: "0.8", label: "Light" },
  { value: "1", label: "Solid" },
];

function ImagePanel(props: OptionsPanelProps<O>) {
  return props.info.video ? <ImagePanelOn {...props} /> : null;
}

function ImagePanelOn({ value, onChange, info, disabled }: OptionsPanelProps<O>) {
  const listId = useId();
  const sizeId = useId();
  const sizePctId = useId();
  const turnId = useId();
  const opacityId = useId();
  const opacityPctId = useId();
  const inputId = useId();
  const source = sizeOf(info);
  const [error, setError] = useState<string>();
  const [over, setOver] = useState(false);
  const sel = value.layers.find((l) => l.id === value.selected);
  const selName = nameOf(value, value.selected);
  const full = value.layers.length >= MAX_LAYERS;
  const stillFrames = firstFrameOnly();
  // The latest options, for picks that finish reading after other changes.
  const latest = useRef(value);
  latest.current = value;

  const add = async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    let next = latest.current;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (next.layers.length >= MAX_LAYERS) {
        errors.push(`Up to ${MAX_LAYERS} images; ${file.name} was not added.`);
        break;
      }
      try {
        const img = await readLayerImage(file, source);
        const id = nextLayerId(next);
        const layer: ImageLayer = { id, ...img, ...newPlacement(next.layers.length) };
        next = { ...next, layers: [...next.layers, layer], selected: id };
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `${file.name} could not be read.`);
      }
    }
    setError(errors.length ? errors.join(" ") : undefined);
    onChange({ ...latest.current, layers: next.layers, selected: next.selected });
  };

  const sizePreset = sel ? SIZES.find((s) => Math.abs(Number(s.value) - sel.w) < 0.001) : undefined;
  const opacityPreset = sel
    ? OPACITIES.find((s) => Math.abs(Number(s.value) - sel.opacity) < 0.001)
    : undefined;
  // Topmost first: the list reads like the stack seen from the front.
  const ordered = value.layers.map((l, i) => ({ l, i })).reverse();

  const picker = (
    <label
      htmlFor={inputId}
      aria-disabled={full || disabled || undefined}
      className={cn(
        buttonVariants({ variant: "secondary", size: "md" }),
        "min-h-11 w-fit has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
        full || disabled ? "pointer-events-none opacity-50" : "cursor-pointer",
      )}
    >
      <ImagePlus size={16} strokeWidth={1.5} aria-hidden />
      {value.layers.length === 0 ? "Choose an image" : "Choose another image"}
      <input
        id={inputId}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={disabled || full}
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Images"
        labelId={listId}
        hint={full ? `Up to ${MAX_LAYERS} images; remove one to add another.` : undefined}
      >
        <div className="flex flex-col gap-2">
          {value.layers.length > 0 && (
            <ul aria-labelledby={listId} className="flex flex-col gap-2">
              {ordered.map(({ l, i }, row) => {
                const on = l.id === value.selected;
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "flex items-center gap-1 rounded-md border bg-bg-subtle p-1",
                      on ? "border-fg" : "border-transparent",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={disabled}
                      onClick={() => onChange({ ...value, selected: l.id })}
                      className={cn(
                        buttonVariants({ variant: "quiet", size: "md" }),
                        "h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 overflow-hidden px-2 py-1 text-left font-normal",
                      )}
                    >
                      <span className="tabular shrink-0 text-fg-muted">{i + 1}</span>
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <FileName name={l.name} />
                        <span className="tabular block truncate text-fg-muted text-xs">
                          {formatDimensions(Math.round(l.width), Math.round(l.height))}
                          {l.animated
                            ? stillFrames
                              ? " · animated, first frame only here"
                              : " · animated"
                            : ""}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move image ${i + 1} up the stack`}
                      disabled={disabled || row === 0}
                      onClick={() => onChange({ ...value, layers: restack(value, l.id, 1) })}
                      className={cn(
                        buttonVariants({ variant: "quiet", size: "md" }),
                        "size-11 px-0",
                      )}
                    >
                      <ArrowUp size={16} strokeWidth={1.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move image ${i + 1} down the stack`}
                      disabled={disabled || row === ordered.length - 1}
                      onClick={() => onChange({ ...value, layers: restack(value, l.id, -1) })}
                      className={cn(
                        buttonVariants({ variant: "quiet", size: "md" }),
                        "size-11 px-0",
                      )}
                    >
                      <ArrowDown size={16} strokeWidth={1.5} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {value.layers.length > 0 ? (
            picker
          ) : (
            // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the file button inside is the keyboard path
            <div
              className={cn(
                "flex flex-col items-center gap-2 rounded-md border px-4 py-4 text-center text-sm transition-colors duration-(--duration-instant)",
                over
                  ? "border-fg border-solid bg-bg-raised"
                  : "border-border-strong border-dashed bg-bg-subtle",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                if (!disabled && !full) void add(e.dataTransfer.files);
              }}
            >
              {picker}
              <p className="text-fg-muted text-xs">
                PNG, WebP, GIF, JPEG or SVG. Transparent PNGs and animated GIFs work as stickers.
              </p>
            </div>
          )}
          {error && (
            <p className="text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      </Field>
      {sel && (
        <>
          <Field label={`${selName} size`} labelId={sizeId} trailing="of the width">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Segmented
                  name="layer-size"
                  aria-labelledby={sizeId}
                  value={sizePreset?.value ?? ""}
                  onChange={(v) => onChange(update(value, sel.id, { w: Number(v) }))}
                  options={SIZES}
                />
              </div>
              <UnitField
                id={sizePctId}
                label="Width in percent of the picture's width"
                value={sel.w * 100}
                min={1}
                max={300}
                unit="%"
                onCommit={(n) => onChange(update(value, sel.id, { w: n / 100 }))}
              />
            </div>
          </Field>
          <div>
            <Button
              variant="quiet"
              className="min-h-11 px-3"
              disabled={disabled}
              onClick={() => {
                const layers = value.layers.filter((l) => l.id !== sel.id);
                onChange({ ...value, layers, selected: layers[layers.length - 1]?.id });
              }}
            >
              <Trash2 size={16} strokeWidth={1.5} aria-hidden />
              Remove {selName?.toLowerCase()}
            </Button>
          </div>
          <MoreOptions>
            <Field
              label="Turn"
              htmlFor={turnId}
              hint="Or drag the round handle above the image. It snaps level near 0° and 90°."
            >
              <UnitField
                id={turnId}
                label="Turn in degrees"
                value={sel.rotation}
                min={-180}
                max={180}
                unit="°"
                onCommit={(n) => onChange(update(value, sel.id, { rotation: n }))}
              />
            </Field>
            <Field label="Opacity" labelId={opacityId}>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Segmented
                    name="layer-opacity"
                    aria-labelledby={opacityId}
                    value={opacityPreset?.value ?? ""}
                    onChange={(v) => onChange(update(value, sel.id, { opacity: Number(v) }))}
                    options={OPACITIES}
                  />
                </div>
                <UnitField
                  id={opacityPctId}
                  label="Opacity in percent"
                  value={sel.opacity * 100}
                  min={5}
                  max={100}
                  unit="%"
                  onCommit={(n) => onChange(update(value, sel.id, { opacity: n / 100 }))}
                />
              </div>
            </Field>
          </MoreOptions>
        </>
      )}
    </div>
  );
}
