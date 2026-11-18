"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { PreviewScrubber } from "@/components/tool/crop/preview-scrubber";
import { FileName } from "@/components/tool/file-card";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { MarkOverlay } from "@/components/tool/watermark/mark-overlay";
import { PositionGrid } from "@/components/tool/watermark/position-grid";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatDimensions, formatTimecode } from "@/lib/format";
import { audioCopied, needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import type { MediaInfo } from "@/tools/engines/types";
import {
  effectiveRange,
  markRect,
  placeName,
  type Size,
  type WatermarkOptions,
} from "@/tools/engines/watermark/options";
import { rasterize, rasterKey, readImage, textAspect } from "@/tools/engines/watermark/raster";
import type { OptionsPanelProps, OptionsSpec } from "./types";

type O = WatermarkOptions;

const sourceOf = (info: MediaInfo): Size => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});
const pct = (share: number) => `${Math.round(share * 100)}%`;

/** Whether the sound is copied bit for bit, on whichever path this file takes. */
function soundCopied(info: MediaInfo, fileName: string): boolean {
  const a = info.audio?.[0]?.codec;
  if (!a) return true;
  if (needsFfmpeg(info, fileName)) return a === "aac" || a === "mp3";
  return audioCopied(info, compositeContainer(fileName));
}

function soundWords(info: MediaInfo, fileName: string) {
  if (!info.audio?.length) return "no sound";
  return soundCopied(info, fileName) ? "sound copied" : "sound in AAC";
}

const rangeWords = (o: O, info: MediaInfo) => {
  const r = effectiveRange(o, info.durationSec);
  return r ? `from ${formatTimecode(r.start)} to ${formatTimecode(r.end)}` : "for the whole video";
};

export const watermarkSpec: OptionsSpec<O> = {
  verb: "Add watermark",
  defaults: (_info, preset) => ({
    kind: preset.kind === "text" ? "text" : "image",
    text: "",
    textColor: "white",
    aspect: preset.kind === "text" ? 4 : 1,
    anchor: "br",
    fx: 1,
    fy: 1,
    size: 0.15,
    opacity: 0.7,
    margin: 0.03,
  }),
  // Always the page runner: it makes sure the mark PNG matches the options (the panel redraws it a
  // moment after each change), then hands the run to the worker or to ffmpeg.
  route: () => "page",
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track to put a watermark on.";
    if (o.kind === "image" && !o.image) return "Add a logo image first.";
    if (o.kind === "text" && !o.text.trim()) return "Type the watermark text first.";
    return undefined;
  },
  summary: (o, info) => {
    if (!info.video) return undefined;
    const r = markRect(o, sourceOf(info));
    const name = sourceName(info);
    const engine = needsFfmpeg(info, name)
      ? ` Uses the ffmpeg engine, a one-time download of ${ffmpegDownloadSize()}.`
      : "";
    return `${o.kind === "text" ? "Text" : "Logo"} ${placeName(o)}, ${formatDimensions(r.width, r.height)} at ${pct(o.opacity)} opacity, ${rangeWords(o, info)}. The picture is re-encoded to H.264 at high quality; ${soundWords(info, name)}.${engine} Runs on this device.`;
  },
  result: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const name = sourceName(info);
    return {
      title: `Watermark added: ${formatDimensions(v.width, v.height)}, ${soundWords(info, name)}`,
      detail: `${o.kind === "text" ? "Text" : "Logo"} ${placeName(o)}, ${pct(o.size)} of the width, ${pct(o.opacity)} opacity, ${rangeWords(o, info)}. The preview plays the result.`,
    };
  },
  Overlay({ value, onChange, info, media, disabled }) {
    return (
      <MarkOverlay
        value={value}
        onChange={onChange}
        source={sourceOf(info)}
        duration={info.durationSec}
        video={media.video}
        disabled={disabled}
      />
    );
  },
  Below({ value, onChange, info, media, disabled }) {
    if (!value.range)
      return (
        <PreviewScrubber file={media.file} video={media.video} info={info} disabled={disabled} />
      );
    return (
      <TrimTimeline
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={info.video?.fps ?? 30}
        value={value.range}
        onChange={(range) => onChange({ ...value, range })}
        disabled={disabled}
      />
    );
  },
  Panel: WatermarkPanel,
};

/** Keeps `mark` (the PNG the engine draws) in step with what is chosen and its size. */
function useMarkRaster(value: O, onChange: (o: O) => void, source: Size) {
  const latest = useRef(value);
  latest.current = value;
  const change = useRef(onChange);
  change.current = onChange;
  const key = rasterKey(value, source);
  const ready = value.kind === "image" ? !!value.image : value.text.trim() !== "";
  useEffect(() => {
    if (!ready || latest.current.markKey === key) return;
    let live = true;
    // Resizing by drag changes the key on every frame; draw once it settles.
    const t = setTimeout(() => {
      void rasterize(latest.current, source).then((r) => {
        if (!live || !r) return;
        const now = latest.current;
        if (rasterKey(now, source) !== key) return;
        change.current({
          ...now,
          mark: r.blob,
          markWidth: r.width,
          markHeight: r.height,
          markKey: key,
        });
      });
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, ready, source]);
}

function WatermarkPanel({ value, onChange, info, disabled }: OptionsPanelProps<O>) {
  const kindId = useId();
  const posId = useId();
  const sizeId = useId();
  const opacityId = useId();
  const colorId = useId();
  const source = sourceOf(info);
  const [sourceSize] = useState(source);
  useMarkRaster(value, onChange, sourceSize);
  const sizePreset = [0.1, 0.15, 0.25].find((s) => Math.abs(s - value.size) < 0.001);
  const opacityPreset = [0.4, 0.7, 1].find((s) => Math.abs(s - value.opacity) < 0.001);
  return (
    <div className="flex flex-col gap-6">
      <Field label="Watermark" labelId={kindId}>
        <Segmented
          name="watermark-kind"
          aria-labelledby={kindId}
          value={value.kind}
          onChange={(kind) =>
            onChange({
              ...value,
              kind,
              mark: undefined,
              markKey: undefined,
              aspect:
                kind === "text"
                  ? textAspect(value.text)
                  : value.image
                    ? value.image.width / value.image.height
                    : 1,
            })
          }
          options={[
            { value: "image", label: "Image" },
            { value: "text", label: "Text" },
          ]}
        />
      </Field>
      {value.kind === "image" ? (
        <LogoPicker value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <div className="flex flex-col gap-4">
          <Field
            label="Text"
            htmlFor="watermark-text"
            hint="A name, a handle or © and a year. Up to 100 characters."
          >
            <input
              id="watermark-text"
              type="text"
              maxLength={100}
              autoComplete="off"
              value={value.text}
              placeholder="© 2026 Your name"
              onChange={(e) =>
                onChange({ ...value, text: e.target.value, aspect: textAspect(e.target.value) })
              }
              className="h-10 pointer-coarse:h-11 w-full rounded-md border border-border bg-bg-raised px-3 text-fg text-sm placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            />
          </Field>
          <Field label="Colour" labelId={colorId}>
            <Segmented
              name="watermark-color"
              aria-labelledby={colorId}
              value={value.textColor}
              onChange={(textColor) => onChange({ ...value, textColor })}
              options={[
                { value: "white", label: "White" },
                { value: "black", label: "Black" },
              ]}
            />
          </Field>
        </div>
      )}
      <Field
        label="Position"
        labelId={posId}
        hint={
          value.anchor === "custom"
            ? "Placed by dragging. Pick a square to snap it to an edge or corner."
            : "Or drag the mark on the preview to place it anywhere."
        }
      >
        <PositionGrid
          value={value.anchor}
          labelledBy={posId}
          onChange={(anchor) => onChange({ ...value, anchor })}
        />
      </Field>
      <Field label="Size" labelId={sizeId} trailing={`${pct(value.size)} of the width`}>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Segmented
              name="watermark-size"
              aria-labelledby={sizeId}
              value={sizePreset === undefined ? "" : String(sizePreset)}
              onChange={(v) => onChange({ ...value, size: Number(v) })}
              options={[
                { value: "0.1", label: "Small" },
                { value: "0.15", label: "Medium" },
                { value: "0.25", label: "Large" },
              ]}
            />
          </div>
          <PercentField
            id="watermark-size-pct"
            label="Size in percent of the width"
            share={value.size}
            min={3}
            max={90}
            onCommit={(size) => onChange({ ...value, size })}
          />
        </div>
      </Field>
      <Field label="Opacity" labelId={opacityId}>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Segmented
              name="watermark-opacity"
              aria-labelledby={opacityId}
              value={opacityPreset === undefined ? "" : String(opacityPreset)}
              onChange={(v) => onChange({ ...value, opacity: Number(v) })}
              options={[
                { value: "0.4", label: "Faint" },
                { value: "0.7", label: "Clear" },
                { value: "1", label: "Solid" },
              ]}
            />
          </div>
          <PercentField
            id="watermark-opacity-pct"
            label="Opacity in percent"
            share={value.opacity}
            min={5}
            max={100}
            onCommit={(opacity) => onChange({ ...value, opacity })}
          />
        </div>
      </Field>
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          More options
        </summary>
        <div className="mt-2 flex flex-col gap-4">
          <Field
            label="Distance from the edge"
            htmlFor="watermark-margin"
            trailing="% of the shorter side"
            hint="Used by the nine positions; a dragged mark stays where you put it."
          >
            <NumberInput
              id="watermark-margin"
              min={0}
              max={25}
              step={1}
              value={Math.round(value.margin * 100)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n))
                  onChange({ ...value, margin: Math.min(25, Math.max(0, n)) / 100 });
              }}
            />
          </Field>
          <Checkbox
            label="Only part of the video"
            hint="Choose when it shows on the timeline under the preview."
            checked={value.range !== undefined}
            onChange={(e) =>
              onChange({
                ...value,
                range: e.target.checked
                  ? { start: 0, end: Math.min(info.durationSec, Math.max(1, info.durationSec / 2)) }
                  : undefined,
              })
            }
          />
        </div>
      </details>
    </div>
  );
}

/** A percentage beside a preset control: free typing while focused, clamped on blur or Enter. */
function PercentField({
  id,
  label,
  share,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  share: number;
  min: number;
  max: number;
  onCommit: (share: number) => void;
}) {
  const shown = String(Math.round(share * 100));
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    const n = Number(text);
    if (text.trim() !== "" && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)) / 100);
    else setText(shown);
  };
  return (
    <div className="relative w-20 shrink-0">
      <NumberInput
        id={id}
        aria-label={label}
        min={min}
        max={max}
        step={1}
        className="h-11 pr-7"
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span
        aria-hidden
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-fg-muted text-sm"
      >
        %
      </span>
    </div>
  );
}

const LOGO_ACCEPT = "image/png,image/svg+xml,image/webp,image/jpeg,.png,.svg,.webp,.jpg,.jpeg";

/** The logo input: a drop target with a file button, then the chosen file with a Remove button. */
function LogoPicker({
  value,
  onChange,
  disabled,
}: {
  value: O;
  onChange: (o: O) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string>();
  const read = async (file: File | undefined) => {
    if (!file) return;
    if (
      !/^image\/(png|svg\+xml|webp|jpeg)$/.test(file.type) &&
      !/\.(png|svg|webp|jpe?g)$/i.test(file.name)
    ) {
      setError(`${file.name} is not a PNG, SVG, WebP or JPEG image.`);
      return;
    }
    try {
      const { width, height } = await readImage(file);
      setError(undefined);
      onChange({
        ...value,
        kind: "image",
        image: { name: file.name, blob: file, width, height },
        aspect: width / height,
        mark: undefined,
        markKey: undefined,
      });
    } catch {
      setError(`${file.name} could not be read as an image. Try a PNG export of the logo.`);
    }
  };
  const img = value.image;
  if (img)
    return (
      <div className="flex items-center gap-3 rounded-md bg-bg-subtle px-4 py-3 text-sm">
        <ImageIcon size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <FileName name={img.name} />
          <p className="tabular mt-0.5 text-fg-muted text-xs">
            {formatDimensions(Math.round(img.width), Math.round(img.height))}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({ ...value, image: undefined, mark: undefined, markKey: undefined })
          }
          className={cn(buttonVariants({ variant: "quiet", size: "md" }), "min-h-11 px-3")}
        >
          Remove
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the file button inside is the keyboard path */}
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-md border px-4 py-5 text-center text-sm transition-colors duration-(--duration-instant)",
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
          void read(e.dataTransfer.files[0]);
        }}
      >
        <p className="font-medium">Logo image</p>
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-bg px-4 font-medium has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"
        >
          Choose the logo
          <input
            id={inputId}
            type="file"
            accept={LOGO_ACCEPT}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => void read(e.target.files?.[0])}
          />
        </label>
        <p className="text-fg-muted text-xs">
          PNG or SVG with a transparent background works best.
        </p>
      </div>
      {error && (
        <p className="text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
