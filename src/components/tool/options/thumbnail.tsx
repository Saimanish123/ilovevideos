"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CropFrame } from "@/components/tool/crop/crop-frame";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { FrameScrubber } from "@/components/tool/timeline/frame-scrubber";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatDimensions, formatTimecode } from "@/lib/format";
import { largestRect, type Rect, refitToRatio, type Size } from "@/tools/engines/crop/math";
import {
  DEFAULT_QUALITY,
  type ImageFormat,
  imageLabel,
  isLossy,
  qualityPresets,
  snapToFrame,
} from "@/tools/engines/frame-extract/math";
import type { FramePickOptions } from "@/tools/engines/frame-pick/options";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT } from "../shortcuts";
import type { OptionsPanelProps, OptionsSpec } from "./types";

/**
 * The thumbnail maker (frame-pick engine under the `thumbnail` id, ADR-0098). The picture carries a
 * crop frame of the output shape; under it, suggested frames and a frame scrubber. UI-only fields:
 * `shape`, `size` (an id from SIZES or "crop"), `picked` (the user chose a frame).
 */
type Shape = "16:9" | "9:16" | "1:1";
type O = FramePickOptions & { shape: Shape; size: string; picked?: boolean };

const RATIO: Record<Shape, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 };
/** Output sizes per shape (common screen sizes; no platform's limits are implied). */
const SIZES: Record<Shape, [number, number][]> = {
  "16:9": [
    [1280, 720],
    [1920, 1080],
    [3840, 2160],
  ],
  "9:16": [
    [1080, 1920],
    [720, 1280],
  ],
  "1:1": [
    [1080, 1080],
    [720, 720],
  ],
};
const sizeId = ([w, h]: [number, number]) => `${w}x${h}`;

/** The largest preset no bigger than the crop (nothing enlarged), or the crop's own size when every preset is bigger. */
function fittingSize(shape: Shape, crop: { width: number; height: number }): string {
  const fit = SIZES[shape].filter(([w, h]) => w <= crop.width && h <= crop.height);
  const best = fit.sort((a, b) => b[0] - a[0])[0];
  return best ? sizeId(best) : "crop";
}
const sourceOf = (info: MediaInfo): Size => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

/** Output size for these options: a preset, or the crop's own size. */
function outSize(o: O): { width: number; height: number } {
  const crop = o.crop ?? { width: 0, height: 0 };
  if (o.size === "crop") return { width: Math.round(crop.width), height: Math.round(crop.height) };
  const [w, h] = o.size.split("x").map(Number);
  return { width: w ?? 0, height: h ?? 0 };
}

const withOut = (o: O): O => {
  const s = outSize(o);
  return { ...o, outWidth: s.width, outHeight: s.height };
};

type QualityChoice = `${(typeof qualityPresets)[number]["value"]}`;

export const thumbnailSpec: OptionsSpec<O> = {
  verb: "Make thumbnail",
  shortcuts: [
    { keys: "← →", label: "One frame back or forward" },
    { keys: "Shift ← →", label: "One second back or forward" },
    PLAY_SHORTCUT,
  ],
  defaults: (info) => {
    const src = sourceOf(info);
    const shape: Shape = src.height > src.width ? "9:16" : "16:9";
    const crop = largestRect(src, RATIO[shape]);
    const size = fittingSize(shape, crop);
    return withOut({
      mode: "thumbnail",
      start: 0,
      end: 0,
      time: snapToFrame(info.durationSec * 0.1, info.video?.fps ?? 30, info.durationSec),
      crop,
      shape,
      size,
      format: "jpg",
      quality: DEFAULT_QUALITY,
    });
  },
  blocked: (_o, info) => {
    if (!info.video) return "This file has no picture to make a thumbnail from.";
    if (info.video.decodable === false)
      return {
        reason: "This browser cannot decode this video's picture. Convert it to MP4 first.",
        action: { slug: "video-converter", label: "Convert to MP4" },
      };
    return undefined;
  },
  summary: (o) => {
    const out = outSize(o);
    const crop = o.crop;
    if (!crop) return undefined;
    const k = out.width / crop.width;
    const cw = Math.round(crop.width);
    const ch = Math.round(crop.height);
    const scale =
      k > 1.05
        ? `enlarged ${k.toFixed(1)}× from ${formatDimensions(cw, ch)}, so soft`
        : `from ${formatDimensions(cw, ch)}`;
    return `${imageLabel[o.format]} ${formatDimensions(out.width, out.height)} · ${scale} · on this device`;
  },
  result: () => {
    return {
      title: "Thumbnail made",
      before: false,
      next: {
        slug: "change-video-thumbnail",
        label: "Store a frame inside the video file",
        with: "source",
      },
    };
  },
  Overlay({ value, onChange, info, disabled }) {
    const src = sourceOf(info);
    return (
      <CropFrame
        source={src}
        rect={value.crop ?? largestRect(src, RATIO[value.shape])}
        ratio={RATIO[value.shape]}
        onChange={(r: Rect) => onChange(withOut({ ...value, crop: r }))}
        disabled={disabled}
        label="Thumbnail frame"
      />
    );
  },
  Below: ThumbnailBelow,
  Panel({ value, onChange, info }) {
    const src = sourceOf(info);
    const sizes = SIZES[value.shape];
    const crop = value.crop;
    const options = [
      ...sizes.map((s) => ({ value: sizeId(s), label: formatDimensions(s[0], s[1]) })),
      {
        value: "crop",
        label: crop
          ? `Crop size, ${formatDimensions(Math.round(crop.width), Math.round(crop.height))}`
          : "Crop size",
      },
    ];
    return (
      <div className="flex flex-col gap-6">
        <Field
          label="Shape"
          labelId="shape-label"
          hint="Drag the frame on the picture to choose what is in it."
        >
          <Segmented<Shape>
            name="shape"
            aria-labelledby="shape-label"
            value={value.shape}
            onChange={(shape) => {
              // The new shape is fitted around the centre of the user's frame, not reset to the middle.
              const crop = value.crop
                ? refitToRatio(value.crop, src, RATIO[shape])
                : largestRect(src, RATIO[shape]);
              onChange(
                withOut({
                  ...value,
                  shape,
                  crop,
                  size: value.size === "crop" ? "crop" : fittingSize(shape, crop),
                }),
              );
            }}
            options={[
              { value: "16:9", label: "16:9" },
              { value: "9:16", label: "9:16" },
              { value: "1:1", label: "1:1" },
            ]}
          />
        </Field>
        <Field
          label="Size"
          htmlFor="thumb-size"
          hint="Larger than the crop is enlarged and looks soft."
        >
          <Select
            id="thumb-size"
            value={value.size}
            onValueChange={(size) => onChange(withOut({ ...value, size }))}
            options={options}
          />
        </Field>
        <MoreOptions>
          <Field
            label="Format"
            labelId="thumb-format"
            hint="JPG suits photos and is what most sites take."
          >
            <Segmented<ImageFormat>
              name="thumb-format"
              aria-labelledby="thumb-format"
              value={value.format}
              onChange={(format) => onChange({ ...value, format })}
              options={(["jpg", "png", "webp"] as const).map((f) => ({
                value: f,
                label: imageLabel[f],
              }))}
            />
          </Field>
          {isLossy(value.format) && (
            <Field label="Quality" labelId="thumb-quality">
              <Segmented<QualityChoice>
                name="thumb-quality"
                aria-labelledby="thumb-quality"
                value={
                  (qualityPresets.some((p) => p.value === value.quality)
                    ? String(value.quality)
                    : String(DEFAULT_QUALITY)) as QualityChoice
                }
                onChange={(q) => onChange({ ...value, quality: Number(q) })}
                options={qualityPresets.map((p) => ({
                  value: `${p.value}` as QualityChoice,
                  label: p.label,
                }))}
              />
            </Field>
          )}
        </MoreOptions>
      </div>
    );
  },
} satisfies OptionsSpec<O> & { Below: React.ComponentType<OptionsPanelProps<O>> };

interface Suggestion {
  t: number;
  url: string;
}

/** Suggested frames (scored on the page from 30 samples) and a scrubber for any frame. */
function ThumbnailBelow({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const labelId = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[] | "reading" | "failed">("reading");
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const fps = info.video?.fps || 30;
  const seek = (t: number) => {
    const el = media.video.current;
    if (el) el.currentTime = t;
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [{ CanvasSink }, { openInput }, score] = await Promise.all([
          import("mediabunny"),
          import("@/tools/engines/mediabunny/shared"),
          import("@/tools/engines/frame-pick/score"),
        ]);
        const input = openInput(media.file);
        const track = await input.getPrimaryVideoTrack();
        if (!track || !live) return;
        const src = sourceOf(info);
        const w = 320;
        const h = Math.max(2, Math.round((w * src.height) / Math.max(1, src.width) / 2) * 2);
        const sink = new CanvasSink(track, { width: w, height: h, fit: "fill", poolSize: 2 });
        const t0 = info.startSec ?? 0;
        const first = await track.getFirstTimestamp();
        const times = score.suggestionTimes(info.durationSec, 30);
        const found: (import("@/tools/engines/frame-pick/score").Candidate & { url: string })[] =
          [];
        for await (const wrapped of sink.canvasesAtTimestamps(
          times.map((t) => Math.max(t + t0, first)),
        )) {
          if (!live) return;
          if (!wrapped) continue;
          const canvas = wrapped.canvas as HTMLCanvasElement;
          const c2d = canvas.getContext("2d");
          if (!c2d) continue;
          const { data } = c2d.getImageData(0, 0, w, h);
          found.push({
            t: wrapped.timestamp - t0,
            sharpness: score.sharpness(data, w, h),
            exposure: score.exposure(data, w, h),
            sig: score.signature(data, w, h),
            url: canvas.toDataURL("image/jpeg", 0.7),
          });
        }
        input.dispose();
        const picked = score.suggest(found, 6);
        if (!live) return;
        setSuggestions(
          picked.map((p) => ({ t: p.t, url: found.find((f) => f.t === p.t)?.url ?? "" })),
        );
        // With no choice made yet, start on the best-scored suggestion.
        const best = [...picked].sort((a, b) => b.score - a.score)[0];
        const { value: v, onChange: set } = latest.current;
        if (best && !v.picked) {
          set({ ...v, time: snapToFrame(best.t, fps, info.durationSec) });
          seek(best.t);
        }
      } catch {
        if (live) setSuggestions("failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [media.file]);

  const choose = (t: number) => {
    onChange({ ...value, time: snapToFrame(t, fps, info.durationSec), picked: true });
    seek(t);
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium text-sm" id={labelId}>
          Suggested frames
        </p>
        {suggestions === "reading" ? (
          // Six still slots hold the grid's height while frames are scored, so nothing below moves.
          <div aria-live="polite" className="mt-2">
            <span className="sr-only">Looking for sharp, well-lit frames</span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-hidden>
              {["a", "b", "c", "d", "e", "f"].map((k) => (
                <div key={k} className="aspect-video rounded-md bg-bg-subtle" />
              ))}
            </div>
          </div>
        ) : suggestions === "failed" ? (
          <p className="mt-2 text-fg-muted text-xs">
            No suggestions for this file; scrub to a frame below.
          </p>
        ) : (
          <ul
            aria-labelledby={labelId}
            className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6"
            data-testid="suggestions"
          >
            {/* Empty cells keep the six-slot height reserved while reading, so the filmstrip below never jumps. */}
            {suggestions.map((s) => {
              const current = Math.abs((value.time ?? 0) - s.t) < 1 / fps;
              return (
                <li key={s.t}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => choose(s.t)}
                    aria-pressed={current}
                    aria-label={`Frame at ${formatTimecode(s.t)}`}
                    className={cn(
                      buttonVariants({ variant: "quiet", size: "tile" }),
                      "flex min-h-11 w-full border",
                      current ? "border-fg" : "border-border",
                    )}
                  >
                    <img src={s.url} alt="" className="block aspect-video w-full object-cover" />
                  </button>
                </li>
              );
            })}
            {Array.from({ length: Math.max(0, 6 - suggestions.length) }, (_, k) => (
              <li key={`pad-${k.toString()}`} aria-hidden className="aspect-video" />
            ))}
          </ul>
        )}
      </div>
      <FrameScrubber
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={fps}
        value={value.time ?? 0}
        disabled={disabled}
        onChange={(t) => onChange({ ...value, time: t, picked: true })}
      />
    </div>
  );
}
