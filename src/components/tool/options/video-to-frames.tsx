"use client";

import { useEffect, useId, useState } from "react";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { baseName, formatBytes, formatDimensions, formatTimecode, withUnit } from "@/lib/format";
import {
  DEFAULT_QUALITY,
  type ImageFormat,
  imageFormats,
  imageLabel,
  imageMime,
  isLossy,
  qualityPresets,
} from "@/tools/engines/frame-extract/math";
import type { MediaInfo } from "@/tools/engines/types";
import {
  imageCount,
  MAX_IMAGES,
  markTimes,
  outputSize,
  rangeOf,
  type VideoToFramesOptions,
} from "@/tools/engines/video-to-frames/plan";
import { between, z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = VideoToFramesOptions;

const presets = [
  { id: "s1", label: "Every second", every: "seconds", step: 1 },
  { id: "s5", label: "Every 5 s", every: "seconds", step: 5 },
  { id: "f10", label: "Every 10th frame", every: "frames", step: 10 },
  { id: "f1", label: "Every frame", every: "frames", step: 1 },
] as const;
type PresetId = (typeof presets)[number]["id"];

const WIDTHS = [1920, 1280, 640] as const;

/** "every second", "every 2.5 s", "every 10th frame", "every frame". */
function cadence(o: O): string {
  if (o.every === "seconds")
    return o.step === 1 ? "every second" : `every ${withUnit(o.step, "s")}`;
  const n = Math.round(o.step);
  if (n === 1) return "every frame";
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "st"
      : n % 10 === 2 && n % 100 !== 12
        ? "nd"
        : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
  return `every ${n}${suffix} frame`;
}

const count = (o: O, info: MediaInfo) => imageCount(o, info.durationSec, info.video?.fps ?? 30);
const sizeOf = (o: O, info: MediaInfo) =>
  outputSize(info.video ?? { width: 0, height: 0 }, o.maxWidth);

export const videoToFramesSpec: OptionsSpec<O> = {
  verb: "Extract images",
  remember: {
    schema: z.object({
      every: z.enum(["seconds", "frames"]),
      step: z.number().check(z.positive(), z.maximum(3600)),
      format: z.enum(["png", "jpg", "webp"]),
      quality: between(1, 100),
    }),
  },
  defaults: (_info, preset) => ({
    every: preset.every === "frames" ? "frames" : "seconds",
    step: typeof preset.step === "number" ? preset.step : 1,
    format: (preset.format as ImageFormat | undefined) ?? "jpg",
    quality: DEFAULT_QUALITY,
  }),
  shortcuts: [
    { keys: "← →", label: "Move the focused handle one frame" },
    { keys: "Shift ← →", label: "Move it one second" },
  ],
  blocked: (o, info) => {
    if (!info.video)
      return unfixable("This file has no video track to take frames from. Choose a video file.");
    const n = count(o, info);
    if (n === 0) return "The chosen range holds no frame. Widen the range on the timeline.";
    if (n > MAX_IMAGES)
      return `That is ${n.toLocaleString("en")} images; one run writes at most ${MAX_IMAGES.toLocaleString("en")}. Choose a longer interval or a shorter range.`;
    return undefined;
  },
  summary: (o, info) => {
    const n = count(o, info);
    const { start, end } = rangeOf(o, info.durationSec);
    const s = sizeOf(o, info);
    const q = isLossy(o.format) ? ` at quality ${o.quality}` : ", lossless";
    return `${withUnit(n.toLocaleString("en"), n === 1 ? "image" : "images")}, ${cadence(o)} from ${formatTimecode(start)} to ${formatTimecode(end)}: ${formatDimensions(s.width, s.height)} ${imageLabel[o.format]}${q}, numbered in order.`;
  },
  result: (o, info, out) => {
    const s = sizeOf(o, info);
    return {
      title: `${withUnit(out.files.toLocaleString("en"), out.files === 1 ? "image" : "images")}: ${formatDimensions(s.width, s.height)} ${imageLabel[o.format]}`,
      detail: `Taken ${cadence(o)} and numbered in time order, so they sort correctly in any folder or editor.`,
    };
  },
  zipName: (_o, fileName) => `${baseName(fileName)}-frames.zip`,
  Below: FramesBelow,
  Panel: FramesPanel,
};

function FramesBelow({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const fps = info.video?.fps ?? 30;
  const range = rangeOf(value, info.durationSec);
  const marks = markTimes(value, info.durationSec, fps);
  return (
    <div className="flex flex-col gap-2">
      <TrimTimeline
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={fps}
        value={range}
        onChange={(r) =>
          onChange({
            ...value,
            range: r.start <= 0 && r.end >= info.durationSec ? undefined : r,
          })
        }
        keyframes={marks}
        disabled={disabled}
      />
      <p className="text-fg-muted text-xs">
        {marks.length > 0 && marks.length <= 300
          ? "Each tick is a frame that becomes an image. Drag the handles to take only part of the video."
          : "Drag the handles to take only part of the video."}
      </p>
    </div>
  );
}

/**
 * Measures one image: the frame at the start of the range, drawn from the preview and encoded as
 * the chosen format, so the total is a real number rather than a guess.
 */
function useImageBytes(
  ref: React.RefObject<HTMLVideoElement | null>,
  format: ImageFormat,
  quality: number,
  size: { width: number; height: number },
  at: number,
): number | undefined {
  const [bytes, setBytes] = useState<number>();
  useEffect(() => {
    // The preview element is attached in the same commit, so it is there when this runs.
    const video = ref.current;
    if (!video || size.width <= 0) return;
    let live = true;
    const measure = () => {
      if (video.readyState < 2) return;
      const c = document.createElement("canvas");
      c.width = size.width;
      c.height = size.height;
      c.getContext("2d")?.drawImage(video, 0, 0, size.width, size.height);
      c.toBlob(
        (b) => {
          if (live && b && b.type === imageMime[format]) setBytes(b.size);
        },
        imageMime[format],
        isLossy(format) ? quality / 100 : undefined,
      );
    };
    const t = setTimeout(measure, 250);
    video.addEventListener("loadeddata", measure, { once: true });
    return () => {
      live = false;
      clearTimeout(t);
      video.removeEventListener("loadeddata", measure);
    };
  }, [ref, format, quality, size.width, size.height, at]);
  return bytes;
}

function FramesPanel({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const takeId = useId();
  const formatId = useId();
  const qualityId = useId();
  const sizeId = useId();
  const unitId = useId();
  const v = info.video;
  const size = sizeOf(value, info);
  const n = count(value, info);
  const range = rangeOf(value, info.durationSec);
  const one = useImageBytes(media.video, value.format, value.quality, size, range.start);
  const preset = presets.find(
    (p) => p.every === value.every && Math.abs(p.step - value.step) < 1e-9,
  )?.id;
  const widths = WIDTHS.filter((w) => v && w < v.width);
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Take a frame"
        labelId={takeId}
        trailing={
          one && n > 0
            ? `≈ ${formatBytes(one * n)} in total`
            : withUnit(n.toLocaleString("en"), "images")
        }
        hint={
          v
            ? `The video plays ${Number(v.fps.toFixed(2))} frames a second. Ticks on the timeline mark the ones that become images.`
            : undefined
        }
      >
        <Segmented<PresetId | "">
          name="frames-every"
          aria-labelledby={takeId}
          columns={2}
          value={preset ?? ""}
          onChange={(id) => {
            const p = presets.find((x) => x.id === id);
            if (p) onChange({ ...value, every: p.every, step: p.step });
          }}
          options={presets.map((p) => ({ value: p.id, label: p.label }))}
        />
      </Field>
      <Field
        label="Format"
        labelId={formatId}
        hint="JPG keeps a long sequence small. PNG is lossless, for editing or training data. WebP is smaller than JPG."
      >
        <Segmented<ImageFormat>
          name="frames-format"
          aria-labelledby={formatId}
          value={value.format}
          onChange={(format) => onChange({ ...value, format })}
          options={imageFormats.map((f) => ({ value: f, label: imageLabel[f] }))}
        />
      </Field>
      {isLossy(value.format) && (
        <Field label="Quality" labelId={qualityId}>
          <Segmented<string>
            name="frames-quality"
            aria-labelledby={qualityId}
            value={
              qualityPresets.some((q) => q.value === value.quality) ? String(value.quality) : ""
            }
            onChange={(q) => onChange({ ...value, quality: Number(q) })}
            options={qualityPresets.map((q) => ({
              value: String(q.value),
              label: `${q.label} ${q.value}`,
            }))}
          />
        </Field>
      )}
      {widths.length > 0 && (
        <Field
          label="Size"
          labelId={sizeId}
          hint="Smaller images for thumbnails or datasets; the shape stays the video's. Never enlarged."
        >
          <Segmented<string>
            name="frames-size"
            aria-labelledby={sizeId}
            value={value.maxWidth ? String(value.maxWidth) : "full"}
            onChange={(w) => onChange({ ...value, maxWidth: w === "full" ? undefined : Number(w) })}
            options={[
              { value: "full", label: v ? `${v.width} (full)` : "Full" },
              ...widths.map((w) => ({ value: String(w), label: String(w) })),
            ]}
          />
        </Field>
      )}
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          Custom interval
        </summary>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <Field label="Every" htmlFor="frames-step">
            <NumberInput
              id="frames-step"
              min={value.every === "seconds" ? 0.1 : 1}
              step={value.every === "seconds" ? 0.1 : 1}
              value={value.step}
              disabled={disabled}
              onChange={(e) => {
                const x = Number(e.target.value);
                if (!Number.isFinite(x) || x <= 0) return;
                onChange({
                  ...value,
                  step: value.every === "frames" ? Math.max(1, Math.round(x)) : Math.max(0.1, x),
                });
              }}
            />
          </Field>
          <div>
            <span id={unitId} className="sr-only">
              Unit
            </span>
            <Segmented<O["every"]>
              name="frames-unit"
              aria-labelledby={unitId}
              value={value.every}
              onChange={(every) =>
                onChange({
                  ...value,
                  every,
                  step: every === "frames" ? Math.max(1, Math.round(value.step)) : value.step,
                })
              }
              options={[
                { value: "seconds", label: "seconds" },
                { value: "frames", label: "frames" },
              ]}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
