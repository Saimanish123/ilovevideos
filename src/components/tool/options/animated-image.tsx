"use client";

import { useEffect, useRef } from "react";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { formatBytes, formatCount, formatDimensions, withUnit } from "@/lib/format";
import { animatedPath } from "@/tools/engines/animated-image/capability";
import {
  type AnimatedFormat,
  type AnimatedQuality,
  animatedFpsChoices,
  DEFAULT_FPS,
  estimateAnimatedBytes,
  FORMAT_NAME,
} from "@/tools/engines/animated-image/math";
import type { AnimatedImageOptions as EngineOptions } from "@/tools/engines/animated-image/options";
import type { MediaInfo } from "@/tools/engines/types";
import {
  DEFAULT_MAX_SECONDS,
  defaultRange,
  frameCount,
  gifDimensions,
  type WidthPreset,
  widthPresets,
} from "@/tools/engines/video-to-gif/math";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { TimeInput } from "./trim";
import type { OptionsPanelProps, OptionsSpec } from "./types";

/**
 * UI-only fields (the engine's schema drops them): `sampled`, bytes per pixel of one frame of this
 * video encoded as the engine encodes a whole frame, keyed by width and quality; `can`, whether this
 * browser can make the format (asked once per file).
 */
type Options = EngineOptions & { sampled?: Record<string, number>; can?: boolean };

const fpsChoices = animatedFpsChoices.map(String) as `${(typeof animatedFpsChoices)[number]}`[];
type FpsChoice = (typeof fpsChoices)[number];
const asFps = (n: number, format: AnimatedFormat): FpsChoice =>
  (fpsChoices as string[]).includes(String(n))
    ? (String(n) as FpsChoice)
    : (String(DEFAULT_FPS[format]) as FpsChoice);

const qualityChoices: { value: AnimatedQuality; label: string }[] = [
  { value: "small", label: "Smaller" },
  { value: "balanced", label: "Balanced" },
  { value: "high", label: "Sharper" },
];

const sampleKey = (o: Options, width: number) =>
  `${width}:${o.format === "apng" ? "lossless" : o.quality}`;

function estimate(o: Options, info: MediaInfo) {
  const v = info.video;
  const dims = gifDimensions(v?.width ?? 0, v?.height ?? 0, o.width);
  const frames = frameCount(o.start, o.end, o.fps);
  const sampled = o.sampled?.[sampleKey(o, dims.width)];
  return {
    dims,
    frames,
    bytes: estimateAnimatedBytes(o.format, o.quality, dims.width, dims.height, frames, sampled),
  };
}

export const animatedImageSpec: OptionsSpec<Options> = {
  verb: "Make animation",
  shortcuts: [
    { keys: "I", label: "Start at the playhead" },
    { keys: "O", label: "End at the playhead" },
    PLAY_SHORTCUT,
    { keys: "← →", label: "Move a focused handle one frame" },
    { keys: "Shift ← →", label: "Move a focused handle one second" },
  ],
  defaults: (info, preset) => {
    const format = (preset.format as AnimatedFormat | undefined) ?? "webp";
    return {
      format,
      ...defaultRange(info.durationSec),
      fps: typeof preset.fps === "number" ? preset.fps : DEFAULT_FPS[format],
      width: (preset.width as WidthPreset | undefined) ?? 480,
      quality: (preset.quality as AnimatedQuality | undefined) ?? "balanced",
      loop: typeof preset.loop === "boolean" ? preset.loop : true,
    };
  },
  blocked: (o, info) => {
    const name = FORMAT_NAME[o.format];
    if (!info.video) return `This file has no video track to turn into an animated ${name}.`;
    if (info.video.decodable === false)
      return {
        reason: `This browser cannot decode this video's ${info.video.codec.toUpperCase()} picture. Convert it to MP4 first.`,
        action: { slug: "video-converter", label: "Convert to MP4" },
      };
    if (Math.round((o.end - o.start) * o.fps) < 1)
      return "The range is shorter than one frame at this frame rate. Widen it or raise the frame rate.";
    if (o.can === undefined) return `Checking whether this browser can make ${name}`;
    if (!o.can)
      return o.format === "avif"
        ? "This browser has no AV1 encoder, which an animated AVIF needs. Try current Chrome, Edge or Safari on a Mac, or make an animated WebP."
        : `This browser cannot encode ${name} frames. Try current Chrome, Edge, Firefox or Safari.`;
    return undefined;
  },
  summary: (_o, info) => {
    if (!info.video) return undefined;
    // Size, frames and dimensions are the estimate block just above; this line adds only what it lacks.
    return "No sound · on this device";
  },
  result: (o) => ({ title: `Animated ${FORMAT_NAME[o.format]}`, before: false }),
  Below: AnimatedBelow,
  Panel({ value, onChange, info }) {
    const v = info.video;
    const srcWidth = v?.width ?? 0;
    const srcFps = v?.fps ?? 30;
    const frame = 1 / srcFps;
    const snap = (t: number) => Math.round(t / frame) * frame;
    const widthOptions = widthPresets
      .filter((w) => w === "original" || srcWidth === 0 || w < srcWidth)
      .map((w) => ({
        value: String(w),
        label:
          w === "original"
            ? `Keep ${v ? formatDimensions(v.width, v.height) : "original"}`
            : withUnit(w, "px wide"),
      }));
    const lossy = value.format !== "apng";
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
          label="Frame rate"
          labelId="fps-label"
          trailing="fps"
          hint={
            value.format === "avif"
              ? "AV1 stores motion between frames, so a higher rate costs little."
              : "Every step up adds frames and size in proportion."
          }
        >
          <Segmented<FpsChoice>
            name="fps"
            aria-labelledby="fps-label"
            value={asFps(value.fps, value.format)}
            onChange={(f) => onChange({ ...value, fps: Number(f) })}
            options={fpsChoices.map((f) => ({ value: f, label: f }))}
          />
        </Field>
        <Field
          label="Width"
          htmlFor="width"
          hint={`Size grows with the square of the width. ${withUnit(480, "px")} suits chat and most web pages.`}
        >
          <Select
            id="width"
            value={String(value.width)}
            onValueChange={(w) =>
              onChange({
                ...value,
                width: w === "original" ? "original" : (Number(w) as WidthPreset),
              })
            }
            options={widthOptions}
          />
        </Field>
        {lossy && (
          <Field
            label="Quality"
            labelId="quality-label"
            hint="Sharper keeps fine detail and grain at a larger size."
          >
            <Segmented<AnimatedQuality>
              name="quality"
              aria-labelledby="quality-label"
              value={value.quality}
              onChange={(quality) => onChange({ ...value, quality })}
              options={qualityChoices}
            />
          </Field>
        )}
        <Checkbox
          label="Loop forever"
          hint="Off plays it once and stops on the last frame."
          checked={value.loop}
          onChange={(e) => onChange({ ...value, loop: e.target.checked })}
        />
        <Estimate value={value} info={info} />
      </div>
    );
  },
} satisfies OptionsSpec<Options> & {
  Below: React.ComponentType<OptionsPanelProps<Options>>;
};

function Estimate({ value, info }: { value: Options; info: MediaInfo }) {
  if (!info.video) return null;
  const { dims, frames, bytes } = estimate(value, info);
  const len = withUnit(Math.max(0, value.end - value.start).toFixed(1), "s");
  return (
    <div aria-live="polite" data-testid="animation-estimate">
      <p className="tabular text-h2">About {formatBytes(bytes)}</p>
      <p className="tabular mt-1 text-fg-muted text-sm">
        {formatCount(frames, "frame")}, {len} at {withUnit(value.fps, "fps")},{" "}
        {formatDimensions(dims.width, dims.height)}
      </p>
    </div>
  );
}

/**
 * The range on the timeline, with the preview playing it muted and on repeat (once, when Loop is
 * off), as the animation will; it starts by itself unless the user asks for reduced motion. Also asks
 * the browser once whether it can make this format, and measures one frame of this video at the
 * output size for the estimate.
 */
function AnimatedBelow({ value, onChange, info, media, disabled }: OptionsPanelProps<Options>) {
  const root = useRef<HTMLDivElement>(null);
  const fps = info.video?.fps ?? 30;
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
            end: t >= value.end ? Math.min(info.durationSec, t + DEFAULT_MAX_SECONDS) : value.end,
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

  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const dims = gifDimensions(info.video?.width ?? 0, info.video?.height ?? 0, value.width);

  // Can this browser make the format at this size? Asked again when the size or rate changes.
  useEffect(() => {
    let live = true;
    void animatedPath(value.format, dims.width, dims.height, value.fps).then((path) => {
      if (!live) return;
      const { value: v, onChange: set } = latest.current;
      if (v.can !== (path !== undefined)) set({ ...v, can: path !== undefined });
    });
    return () => {
      live = false;
    };
  }, [value.format, dims.width, dims.height, value.fps]);

  // Muted like the animation will be; played on its own once, when the preview is ready.
  const started = useRef(false);
  const start = value.start;
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const go = () => {
      const el = media.video.current;
      if (!el) {
        if (tries++ < 120) raf = requestAnimationFrame(go);
        return;
      }
      el.muted = true;
      if (started.current) return;
      started.current = true;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const play = (v: HTMLVideoElement) => {
        v.currentTime = start;
        void v.play().catch(() => undefined);
      };
      if (el.readyState >= 1) play(el);
      else el.addEventListener("loadedmetadata", () => play(el), { once: true });
    };
    go();
    return () => cancelAnimationFrame(raf);
  }, [media.video, start]);
  useEffect(
    () => () => {
      const el = media.video.current;
      if (el) el.muted = false;
    },
    [media.video],
  );

  // One frame of this video at the output size, encoded as the engine encodes a whole frame, says
  // how this content compresses. AVIF's estimate is the encoder's bitrate and needs no sample.
  const key = sampleKey(value, dims.width);
  const quality = value.quality;
  const format = value.format;
  useEffect(() => {
    if (format === "avif" || dims.width <= 0) return;
    if (latest.current.value.sampled?.[key] !== undefined) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const el = media.video.current;
      if (!el || el.readyState < 2 || cancelled) return;
      const perPixel = await sampleFrame(el, format, quality, dims.width, dims.height);
      if (cancelled || !(perPixel > 0)) return;
      const { value: v, onChange: set } = latest.current;
      set({ ...v, sampled: { ...v.sampled, [key]: perPixel } });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, format, quality, dims.width, dims.height, media.video]);

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
        repeat={value.loop}
      />
      <p className="text-fg-muted text-xs">
        {info.durationSec > DEFAULT_MAX_SECONDS
          ? `The range starts as the first ${withUnit(DEFAULT_MAX_SECONDS, "s")}. Drag the handles, or press I and O at the playhead, to pick any part.`
          : "The preview plays the range muted and on repeat, as the animation will. Drag the handles, or press I and O at the playhead."}
      </p>
    </div>
  );
}

/** Bytes per pixel of the frame on screen as one whole WebP or APNG frame; 0 when it cannot tell. */
async function sampleFrame(
  el: HTMLVideoElement,
  format: AnimatedFormat,
  quality: AnimatedQuality,
  width: number,
  height: number,
): Promise<number> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  if (!ctx) return 0;
  ctx.drawImage(el, 0, 0, width, height);
  const pixels = width * height;
  try {
    if (format === "webp") {
      const { WEBP_QUALITY } = await import("@/tools/engines/animated-image/math");
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/webp", WEBP_QUALITY[quality]),
      );
      // Safari writes PNG here; its WebP frames come from the VP8 encoder at a set bitrate.
      return blob?.type === "image/webp" ? blob.size / pixels : 0;
    }
    const { deflate, filterRows, rgbaToRgb } = await import("@/tools/engines/animated-image/apng");
    const rgb = rgbaToRgb(ctx.getImageData(0, 0, width, height).data);
    const z = await deflate(filterRows(rgb, width, 3, { x: 0, y: 0, w: width, h: height }));
    return z.length / pixels;
  } catch {
    return 0;
  }
}
