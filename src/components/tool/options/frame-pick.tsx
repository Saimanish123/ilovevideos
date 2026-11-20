"use client";

import { useRef } from "react";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatCount, formatDimensions } from "@/lib/format";
import {
  DEFAULT_QUALITY,
  type ImageFormat,
  imageFormats,
  imageLabel,
  isLossy,
  qualityPresets,
} from "@/tools/engines/frame-extract/math";
import { type FramePickOptions, MAX_SCORED } from "@/tools/engines/frame-pick/options";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { between, z } from "./remember-schema";
import { TimeInput } from "./trim";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

/** The range a new file opens with: the whole clip up to this long. */
const DEFAULT_RANGE = 10;

type QualityChoice = `${(typeof qualityPresets)[number]["value"]}`;

/** Frames the run will score: every frame of the range, or an even sample of MAX_SCORED. */
function framesScored(o: FramePickOptions, info: MediaInfo): number {
  const fps = info.video?.fps ?? 30;
  return Math.min(MAX_SCORED, Math.max(1, Math.round((o.end - o.start) * fps)));
}

export const framePickSpec: OptionsSpec<FramePickOptions> = {
  verb: "Find sharpest frame",
  shortcuts: [
    { keys: "I", label: "Start the range at the playhead" },
    { keys: "O", label: "End the range at the playhead" },
    PLAY_SHORTCUT,
    { keys: "← →", label: "Move a focused handle one frame" },
  ],
  remember: {
    schema: z.object({
      mode: z.enum(["sharpest", "thumbnail"]),
      format: z.enum(["png", "jpg", "webp"]),
      quality: between(1, 100),
    }),
  },
  defaults: (info, preset) => ({
    mode: "sharpest",
    start: 0,
    end: Math.min(info.durationSec > 0 ? info.durationSec : DEFAULT_RANGE, DEFAULT_RANGE),
    format: (preset.format as ImageFormat | undefined) ?? "png",
    quality: typeof preset.quality === "number" ? preset.quality : DEFAULT_QUALITY,
  }),
  blocked: (o, info) => {
    if (!info.video)
      return unfixable("This file has no video track to take a frame from. Choose a video file.");
    if (info.video.decodable === false)
      return {
        reason: "This browser cannot decode this video's picture. Convert it to MP4 first.",
        action: { slug: "video-converter", label: "Convert to MP4" },
        fixable: false,
      };
    if (o.end - o.start < 1 / (info.video.fps || 30))
      return "The range is shorter than one frame. Widen it.";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const n = framesScored(o, info);
    const all = n < Math.round((o.end - o.start) * (v.fps || 30)) ? " (an even sample)" : "";
    return `${formatCount(n, "frame")} scored${all} · best saved as ${imageLabel[o.format]} ${formatDimensions(v.width, v.height)}`;
  },
  result: () => ({ title: "Sharpest frame found", before: false }),
  nextStep: {
    slug: "extract-frame-from-video",
    label: "Pick a frame by hand instead",
    with: "source",
  },
  Below: PickBelow,
  Panel({ value, onChange, info }) {
    const v = info.video;
    const frame = 1 / (v?.fps || 30);
    const snap = (t: number) => Math.round(t / frame) * frame;
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" htmlFor="start" trailing="s">
            <TimeInput
              id="start"
              value={value.start}
              onCommit={(t) =>
                onChange({ ...value, start: snap(Math.min(Math.max(0, t), value.end - frame)) })
              }
            />
          </Field>
          <Field label="End" htmlFor="end" trailing="s">
            <TimeInput
              id="end"
              value={value.end}
              onCommit={(t) =>
                onChange({
                  ...value,
                  end: snap(Math.max(Math.min(info.durationSec, t), value.start + frame)),
                })
              }
            />
          </Field>
        </div>
        <Field
          label="Format"
          labelId="format-label"
          hint="PNG keeps every pixel; JPG and WebP are smaller."
        >
          <Segmented<ImageFormat>
            name="format"
            aria-labelledby="format-label"
            value={value.format}
            onChange={(format) => onChange({ ...value, format })}
            options={imageFormats.map((f) => ({ value: f, label: imageLabel[f] }))}
          />
        </Field>
        {isLossy(value.format) && (
          <Field label="Quality" labelId="quality-label">
            <Segmented<QualityChoice>
              name="quality"
              aria-labelledby="quality-label"
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
      </div>
    );
  },
} satisfies OptionsSpec<FramePickOptions> & {
  Below: React.ComponentType<OptionsPanelProps<FramePickOptions>>;
};

function PickBelow({
  value,
  onChange,
  info,
  media,
  disabled,
}: OptionsPanelProps<FramePickOptions>) {
  const root = useRef<HTMLDivElement>(null);
  const fps = info.video?.fps || 30;
  const frame = 1 / fps;
  const snap = (t: number) =>
    Math.min(info.durationSec, Math.max(0, Math.round(t / frame) * frame));
  const playhead = () => media.video.current?.currentTime ?? 0;
  useWorkspaceKeys(
    root,
    [
      {
        key: "i",
        run: () => {
          const t = snap(playhead());
          onChange({
            ...value,
            start: Math.min(t, value.end - frame),
            end: t >= value.end ? Math.min(info.durationSec, t + 2) : value.end,
          });
        },
      },
      {
        key: "o",
        run: () => {
          const t = snap(playhead());
          onChange({
            ...value,
            end: Math.max(t, value.start + frame),
            start: t <= value.start ? 0 : value.start,
          });
        },
      },
    ],
    !disabled,
  );
  return (
    <div ref={root} className="flex flex-col gap-2">
      <TrimTimeline
        disabled={disabled}
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={fps}
        value={{ start: value.start, end: value.end }}
        onChange={(r) => onChange({ ...value, start: r.start, end: r.end })}
      />
    </div>
  );
}
