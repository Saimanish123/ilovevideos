"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef } from "react";
import { FrameScrubber } from "@/components/tool/timeline/frame-scrubber";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, formatTimecode } from "@/lib/format";
import {
  DEFAULT_QUALITY,
  type ImageFormat,
  imageFormats,
  imageLabel,
  isLossy,
  qualityPresets,
  snapToFrame,
} from "@/tools/engines/frame-extract/math";
import type { FrameExtractOptions } from "@/tools/engines/frame-extract/options";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { between, z } from "./remember-schema";
import { TimeInput } from "./trim";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type QualityChoice = `${(typeof qualityPresets)[number]["value"]}`;
const asQuality = (q: number): QualityChoice =>
  (qualityPresets.some((p) => p.value === q)
    ? String(q)
    : String(DEFAULT_QUALITY)) as QualityChoice;

export const frameExtractSpec: OptionsSpec<FrameExtractOptions> = {
  verb: "Extract frame",
  shortcuts: [
    { keys: "← →", label: "One frame back or forward" },
    { keys: "Shift ← →", label: "One second back or forward" },
    PLAY_SHORTCUT,
    { keys: "T", label: "Take the frame the preview is on" },
  ],
  result: (o, info) => {
    const v = info.video;
    return {
      title: `Frame at ${formatTimecode(o.time)}${v ? `: ${formatDimensions(v.width, v.height)}` : ""} ${imageLabel[o.format]}`,
      detail: isLossy(o.format)
        ? `${imageLabel[o.format]} at quality ${o.quality}, at the video's full size.`
        : "Every pixel exactly as decoded, at the video's full size.",
    };
  },
  remember: {
    schema: z.object({ format: z.enum(["png", "jpg", "webp"]), quality: between(1, 100) }),
  },
  defaults: (_info, preset) => ({
    time: typeof preset.time === "number" ? preset.time : 0,
    format: (preset.format as ImageFormat | undefined) ?? "png",
    quality: typeof preset.quality === "number" ? preset.quality : DEFAULT_QUALITY,
  }),
  blocked: (_o, info) =>
    info.video
      ? undefined
      : unfixable("This file has no video track to take a frame from. Choose a video file."),
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const size = formatDimensions(v.width, v.height);
    const how = isLossy(o.format)
      ? `${imageLabel[o.format]} at quality ${o.quality}.`
      : "PNG is lossless: every pixel exactly as decoded.";
    return `${size} ${imageLabel[o.format]} of the frame at ${formatTimecode(o.time)}. ${how}`;
  },
  Below: FrameBelow,
  Panel({ value, onChange, info, media }) {
    const fps = info.video?.fps ?? 30;
    const setTime = (t: number) => {
      const time = snapToFrame(t, fps, info.durationSec);
      onChange({ ...value, time });
      const el = media.video.current;
      if (el) {
        if (!el.paused) el.pause();
        el.currentTime = time;
      }
    };
    return (
      <div className="flex flex-col gap-6">
        <Field
          label="Time"
          htmlFor="time"
          trailing="s"
          hint="Drag the playhead on the filmstrip, step with the arrow keys, or type exact seconds."
        >
          <TimeInput id="time" value={value.time} onCommit={setTime} />
        </Field>
        <Field
          label="Format"
          labelId="format-label"
          hint="PNG keeps every pixel and is the safe default. JPG and WebP are smaller and lossy; WebP is smaller still at the same quality."
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
          <Field
            label="Quality"
            labelId="quality-label"
            hint="High keeps fine detail and gradients. Low is for thumbnails and chat, where size matters more."
          >
            <Segmented<QualityChoice>
              name="quality"
              aria-labelledby="quality-label"
              value={asQuality(value.quality)}
              onChange={(q) => onChange({ ...value, quality: Number(q) })}
              options={qualityPresets.map((p) => ({
                value: String(p.value) as QualityChoice,
                label: `${p.label} ${p.value}`,
              }))}
            />
          </Field>
        )}
      </div>
    );
  },
} satisfies OptionsSpec<FrameExtractOptions> & {
  Below: React.ComponentType<OptionsPanelProps<FrameExtractOptions>>;
};

/**
 * The filmstrip playhead, plus stepping from anywhere in the workspace: arrows one frame, Shift one
 * second (from the moment on screen when the preview is playing), and "Take this frame" (T) for the
 * moment a playing preview is on. The preview always shows the frame that will be saved.
 */
function FrameBelow({
  value,
  onChange,
  info,
  media,
  disabled,
}: OptionsPanelProps<FrameExtractOptions>) {
  const root = useRef<HTMLDivElement>(null);
  const fps = info.video?.fps ?? 30;
  const setTime = (t: number) => {
    const time = snapToFrame(t, fps, info.durationSec);
    onChange({ ...value, time });
    const el = media.video.current;
    if (el) {
      if (!el.paused) el.pause();
      el.currentTime = time;
    }
  };
  // Stepping continues from the frame on screen: where the preview is (playing, or just moved by a
  // key or the bar), or the chosen frame before the preview is there.
  const from = () => media.video.current?.currentTime ?? value.time;
  const take = () => setTime(media.video.current?.currentTime ?? value.time);
  // The preview always shows the frame that will be saved: a seek made elsewhere while paused (the
  // playback bar, the player keys, a double tap) chooses that frame too.
  const latest = useRef({ value, onChange, fps, duration: info.durationSec, disabled });
  latest.current = { value, onChange, fps, duration: info.durationSec, disabled };
  useEffect(() => {
    // Capture on the document: media events do not bubble, and the preview may attach after this
    // panel mounts (ADR-0030), so listening on the element itself could miss it.
    const onSeeked = (e: Event) => {
      const el = media.video.current;
      const l = latest.current;
      if (!el || e.target !== el || l.disabled || !el.paused) return;
      const time = snapToFrame(el.currentTime, l.fps, l.duration);
      if (Math.abs(time - l.value.time) > 1e-6) l.onChange({ ...l.value, time });
    };
    document.addEventListener("seeked", onSeeked, true);
    return () => document.removeEventListener("seeked", onSeeked, true);
  }, [media.video]);
  useWorkspaceKeys(
    root,
    [
      { key: "ArrowLeft", shift: false, run: () => setTime(from() - 1 / fps) },
      { key: "ArrowRight", shift: false, run: () => setTime(from() + 1 / fps) },
      { key: "ArrowLeft", shift: true, run: () => setTime(from() - 1) },
      { key: "ArrowRight", shift: true, run: () => setTime(from() + 1) },
      { key: "t", run: take },
    ],
    !disabled,
  );
  return (
    <div ref={root} className="flex flex-col gap-3">
      <FrameScrubber
        disabled={disabled}
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={fps}
        value={value.time}
        onChange={(time) => onChange({ ...value, time })}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="md"
          className="min-h-11"
          disabled={disabled}
          onClick={take}
          aria-keyshortcuts="T"
        >
          <Camera size={16} strokeWidth={1.5} aria-hidden />
          Take this frame
        </Button>
        <p className="text-fg-muted text-xs">
          Play the preview and take the moment it is on, or step with the arrow keys.
        </p>
      </div>
    </div>
  );
}
