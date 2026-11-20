"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { MarkOverlay } from "@/components/tool/watermark/mark-overlay";
import { PositionGrid } from "@/components/tool/watermark/position-grid";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, formatTimecode, withUnit } from "@/lib/format";
import { audioCopied, encodedSoundWords, needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import {
  fontPx,
  type TextOverlayOptions,
  textRange,
  textSizes,
} from "@/tools/engines/text-overlay/options";
import { rasterizeText, textKey } from "@/tools/engines/text-overlay/raster";
import type { MediaInfo } from "@/tools/engines/types";
import { placeName, type Size, type WatermarkOptions } from "@/tools/engines/watermark/options";
import { pictureSize } from "./picture-size";
import { between, z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = TextOverlayOptions;

const sourceOf = (info: MediaInfo): Size => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

function soundWords(info: MediaInfo, fileName: string) {
  const a = info.audio?.[0]?.codec;
  if (!a) return "no sound";
  const copied = needsFfmpeg(info, fileName)
    ? a === "aac" || a === "mp3"
    : audioCopied(info, compositeContainer(fileName));
  if (copied) return "sound copied";
  // ffmpeg.wasm writes AAC; the native path follows this browser's encoders.
  return needsFfmpeg(info, fileName)
    ? "sound in AAC"
    : encodedSoundWords(compositeContainer(fileName), soundEncodersNow());
}

const when = (o: O, info: MediaInfo) => {
  const r = textRange(o, info.durationSec);
  const whole = r.start <= 0 && r.end >= info.durationSec;
  const span = whole
    ? "for the whole video"
    : `from ${formatTimecode(r.start)} to ${formatTimecode(r.end)}`;
  return o.fade > 0 ? `${span}, fading in and out over ${withUnit(o.fade, "s")}` : span;
};

/** The block's size before the text is drawn: roughly, from the font size and the longest line. */
function estimate(o: O, video: Size): Size {
  const px = fontPx(o, video);
  const lines = o.text.split("\n").filter((l) => l.trim());
  const longest = Math.max(4, ...lines.map((l) => l.trim().length));
  return {
    width: Math.min(video.width, Math.round(longest * px * 0.55 + px)),
    height: Math.min(video.height, Math.round(Math.max(1, lines.length) * px * 1.25 + px * 0.6)),
  };
}

/** The text as the watermark's placement frame sees it (a mark with a width share and a shape). */
function asMark(o: O, video: Size): WatermarkOptions {
  const block =
    o.markWidth && o.markHeight ? { width: o.markWidth, height: o.markHeight } : estimate(o, video);
  return {
    kind: "text",
    text: o.text,
    textColor: o.color,
    aspect: block.width / Math.max(1, block.height),
    anchor: o.anchor,
    fx: o.fx,
    fy: o.fy,
    size: Math.min(1, block.width / Math.max(1, video.width)),
    opacity: 1,
    margin: o.margin,
    range: o.range,
    mark: o.mark,
    markWidth: o.markWidth,
    markHeight: o.markHeight,
    markKey: o.markKey,
  };
}

export const textOverlaySpec: OptionsSpec<O> = {
  verb: "Add text",
  remember: {
    schema: z.object({
      size: between(0.02, 0.3),
      style: z.enum(["shadow", "outline", "box"]),
      color: z.enum(["white", "black"]),
      anchor: z.enum(["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br", "custom"]),
      fx: between(0, 1),
      fy: between(0, 1),
      margin: between(0, 0.25),
      fade: between(0, 3),
    }),
  },
  defaults: (_info, preset) => ({
    text: typeof preset.text === "string" ? preset.text : "",
    size: textSizes.medium,
    style: "shadow",
    color: "white",
    anchor: "bc",
    fx: 0.5,
    fy: 1,
    margin: 0.06,
    fade: 0.5,
  }),
  // Always the page runner: it makes sure the text PNG matches the options, then hands the run to
  // the worker or, for containers only ffmpeg reads, to ffmpeg.
  route: () => "page",
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  shortcuts: [
    { keys: "← → ↑ ↓", label: "Move the text (focus it on the picture)" },
    { keys: "+ −", label: "Make the text larger or smaller" },
  ],
  blocked: (o, info) => {
    if (!info.video)
      return unfixable("This file has no video track to put text on. Choose a video file.");
    if (!o.text.trim()) return "Type the text first.";
    return undefined;
  },
  summary: (o, info) => {
    if (!info.video) return undefined;
    const name = sourceName(info);
    const engine = needsFfmpeg(info, name)
      ? ` Needs a one-time download of ${ffmpegDownloadSize()}.`
      : "";
    return `Text ${placeName(o)}, ${when(o, info)}. The picture is re-encoded to H.264 at high quality; ${soundWords(info, name)}.${engine}`;
  },
  result: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    return {
      title: `Text added: ${formatDimensions(pictureSize(info).width, pictureSize(info).height)}, ${soundWords(info, sourceName(info))}`,
      detail: `Text ${placeName(o)}, ${when(o, info)}. The preview plays the result.`,
    };
  },
  Overlay({ value, onChange, info, media, disabled }) {
    const source = sourceOf(info);
    const mark = asMark(value, source);
    return (
      <MarkOverlay
        name="text"
        value={mark}
        onChange={(next) =>
          onChange({
            ...value,
            anchor: next.anchor,
            fx: next.fx,
            fy: next.fy,
            // The frame's corner handle changes the width share; the text scales with it.
            size: Math.min(
              0.3,
              Math.max(0.02, value.size * (next.size / Math.max(1e-6, mark.size))),
            ),
          })
        }
        source={source}
        duration={info.durationSec}
        video={media.video}
        disabled={disabled}
      />
    );
  },
  Below({ value, onChange, info, media, disabled }) {
    const r = textRange(value, info.durationSec);
    return (
      <div className="flex flex-col gap-2">
        <TrimTimeline
          file={media.file}
          video={media.video}
          duration={info.durationSec}
          fps={info.video?.fps ?? 30}
          value={r}
          onChange={(range) =>
            onChange({
              ...value,
              range: range.start <= 0 && range.end >= info.durationSec ? undefined : range,
            })
          }
          disabled={disabled}
        />
        <p className="text-fg-muted text-xs">
          Drag the handles to choose when the text shows. Drag the text on the picture to place it.
        </p>
      </div>
    );
  },
  Panel: TextPanel,
};

/** Keeps `mark` (the PNG the engine draws) in step with the text and its size, a moment after each change. */
function useTextRaster(value: O, onChange: (o: O) => void, source: Size) {
  const latest = useRef(value);
  latest.current = value;
  const change = useRef(onChange);
  change.current = onChange;
  const key = textKey(value, source);
  const ready = value.text.trim() !== "";
  useEffect(() => {
    if (!ready || latest.current.markKey === key) return;
    let live = true;
    const t = setTimeout(() => {
      void rasterizeText(latest.current, source).then((r) => {
        if (!live || !r || textKey(latest.current, source) !== key) return;
        change.current({
          ...latest.current,
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

const sizeEntries = Object.entries(textSizes) as [keyof typeof textSizes, number][];

function TextPanel({ value, onChange, info, disabled }: OptionsPanelProps<O>) {
  const sizeId = useId();
  const styleId = useId();
  const colorId = useId();
  const posId = useId();
  const fadeId = useId();
  const [source] = useState(() => sourceOf(info));
  useTextRaster(value, onChange, source);
  const sizePreset = sizeEntries.find(([, s]) => Math.abs(s - value.size) < 1e-6)?.[0];
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Text"
        htmlFor="overlay-text"
        hint="A title, a name, a caption. New lines start new lines."
      >
        <textarea
          id="overlay-text"
          rows={2}
          maxLength={300}
          value={value.text}
          disabled={disabled}
          placeholder="Your title"
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 text-fg text-sm pointer-coarse:text-body placeholder:text-fg-muted transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50"
        />
      </Field>
      <Field
        label="Size"
        labelId={sizeId}
        trailing={`${withUnit(fontPx(value, source), "px")} letters`}
      >
        <Segmented<string>
          name="overlay-size"
          aria-labelledby={sizeId}
          value={sizePreset ?? ""}
          onChange={(k) => onChange({ ...value, size: textSizes[k as keyof typeof textSizes] })}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
          ]}
        />
      </Field>
      <Field
        label="Style"
        labelId={styleId}
        hint="Shadow for clean footage; outline or a box over busy footage."
      >
        <Segmented<O["style"]>
          name="overlay-style"
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
      <Field label="Colour" labelId={colorId}>
        <Segmented<O["color"]>
          name="overlay-color"
          aria-labelledby={colorId}
          value={value.color}
          onChange={(color) => onChange({ ...value, color })}
          options={[
            { value: "white", label: "White" },
            { value: "black", label: "Black" },
          ]}
        />
      </Field>
      <Field
        label="Position"
        labelId={posId}
        hint={
          value.anchor === "custom"
            ? "Placed by dragging. Pick a square to snap it to an edge or corner."
            : "Or drag the text on the preview to place it anywhere."
        }
      >
        <PositionGrid
          value={value.anchor}
          labelledBy={posId}
          onChange={(anchor) => onChange({ ...value, anchor })}
        />
      </Field>
      <Field label="Appear" labelId={fadeId}>
        <Segmented<string>
          name="overlay-fade"
          aria-labelledby={fadeId}
          value={value.fade > 0 ? "fade" : "cut"}
          onChange={(v) => onChange({ ...value, fade: v === "fade" ? 0.5 : 0 })}
          options={[
            { value: "fade", label: "Fade in and out" },
            { value: "cut", label: "At once" },
          ]}
        />
      </Field>
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          More options
        </summary>
        <div className="mt-2 flex flex-col gap-4">
          <Field
            label="Distance from the edge"
            htmlFor="overlay-margin"
            trailing="% of the shorter side"
            hint="Used by the nine positions; dragged text stays where you put it."
          >
            <NumberInput
              id="overlay-margin"
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
          <Field
            label="Fade length"
            htmlFor="overlay-fade-len"
            trailing="s"
            hint="0 makes the text appear and go at once."
          >
            <NumberInput
              id="overlay-fade-len"
              min={0}
              max={3}
              step={0.1}
              value={value.fade}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onChange({ ...value, fade: Math.min(3, Math.max(0, n)) });
              }}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
