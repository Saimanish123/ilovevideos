"use client";

import { useEffect, useRef } from "react";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { formatBytes, formatCount, formatDimensions, withUnit } from "@/lib/format";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { MediaInfo } from "@/tools/engines/types";
import {
  DEFAULT_FPS,
  DEFAULT_MAX_SECONDS,
  defaultRange,
  estimateGifBytes,
  frameCount,
  type GifQuality,
  gifDimensions,
  type WidthPreset,
  widthPresets,
} from "@/tools/engines/video-to-gif/math";
import type { VideoToGifOptions as EngineOptions } from "@/tools/engines/video-to-gif/options";

/**
 * `sampled`: bytes per pixel measured on one frame of this video at each output width (GifBelow),
 * so the size shown before a run follows the content. UI only; the engine's schema drops it.
 */
type VideoToGifOptions = EngineOptions & { sampled?: Record<number, number> };

import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { z } from "./remember-schema";
import { TimeInput } from "./trim";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

const fpsChoices = ["5", "10", "12", "15", "20", "30"] as const;
type FpsChoice = (typeof fpsChoices)[number];

const asFps = (n: number): FpsChoice =>
  (fpsChoices as readonly string[]).includes(String(n)) ? (String(n) as FpsChoice) : "12";

/** Above this a GIF is heavy to post or load; the page says so and shows what would bring it under. */
const LARGE = 10_000_000;

/** Output dimensions, frame count and estimated bytes for these options (the same math the engine uses). */
function estimate(o: VideoToGifOptions, info: MediaInfo) {
  const v = info.video;
  const dims = gifDimensions(v?.width ?? 0, v?.height ?? 0, o.width);
  const frames = frameCount(o.start, o.end, o.fps);
  const sampled = o.sampled?.[dims.width];
  return {
    dims,
    frames,
    bytes: estimateGifBytes(dims.width, dims.height, frames, o.quality, sampled),
  };
}

/**
 * For a GIF over LARGE: the widest preset and the longest range (at this width) that land under
 * it, from the same estimate. Undefined parts have no answer (already the smallest width).
 */
function lighter(o: VideoToGifOptions, info: MediaInfo): string | undefined {
  const v = info.video;
  if (!v) return undefined;
  const len = Math.max(0, o.end - o.start);
  const width = widthPresets
    .filter((w): w is Exclude<WidthPreset, "original"> => w !== "original" && w < v.width)
    .find((w) => estimate({ ...o, width: w }, info).bytes < LARGE);
  const { bytes } = estimate(o, info);
  // Size grows with the frame count, so the range that fits scales with the share that fits.
  const seconds = Math.floor(len * (LARGE / bytes) * 10) / 10;
  const parts = [
    width !== undefined && widthCut(o, width, info),
    seconds >= 0.5 && `a range of ${withUnit(seconds.toFixed(1), "s")} at this width`,
  ].filter(Boolean);
  return parts.length ? `Under ${formatBytes(LARGE)} with ${parts.join(", or ")}.` : undefined;
}
const widthCut = (o: VideoToGifOptions, width: WidthPreset, info: MediaInfo) =>
  `${withUnit(width, "px")} wide (about ${formatBytes(estimate({ ...o, width }, info).bytes)})`;

export const videoToGifSpec: OptionsSpec<VideoToGifOptions> = {
  verb: "Make GIF",
  shortcuts: [
    { keys: "I", label: "Start the GIF at the playhead" },
    { keys: "O", label: "End the GIF at the playhead" },
    PLAY_SHORTCUT,
    { keys: "← →", label: "Move a focused handle one frame" },
    { keys: "Shift ← →", label: "Move a focused handle one second" },
  ],
  result: (o, info, { bytes }) => {
    const { dims, frames } = estimate(o, info);
    const facts = `${formatDimensions(dims.width, dims.height)}, ${formatCount(frames, "frame")}`;
    if (bytes > LARGE)
      return {
        title: `A large GIF: ${formatBytes(bytes)}`,
        detail: `${facts}. ${lighter(o, info) ?? "A shorter range or a lower frame rate makes it lighter."} Change settings to try it; the size updates before you run it again.`,
        missed: true,
        next: null,
      };
    return {
      title: `${formatBytes(bytes)} GIF, ${facts}`,
      detail: o.loop
        ? "It loops forever, as it plays here."
        : "It plays once and stops on the last frame.",
    };
  },
  remember: {
    schema: z.object({
      fps: z.int().check(z.minimum(5), z.maximum(30)),
      width: z.union([
        z.literal("original"),
        z.literal(720),
        z.literal(480),
        z.literal(360),
        z.literal(240),
      ]),
      quality: z.enum(["fast", "best"]),
      loop: z.boolean(),
    }),
  },
  defaults: (info, preset) => ({
    ...defaultRange(info.durationSec),
    fps: typeof preset.fps === "number" ? preset.fps : DEFAULT_FPS,
    width: (preset.width as WidthPreset | undefined) ?? 480,
    quality: (preset.quality as GifQuality | undefined) ?? "fast",
    loop: typeof preset.loop === "boolean" ? preset.loop : true,
  }),
  // "best" needs ffmpeg, which runs on the page thread like the converter's ffmpeg path.
  route: (o) => (o.quality === "best" ? "page" : "worker"),
  blocked: (o, info) => {
    if (!info.video)
      return unfixable("This file has no video track to turn into a GIF. Choose a video file.");
    if (Math.round((o.end - o.start) * o.fps) < 1)
      return "The range is shorter than one frame at this frame rate. Widen it or raise the frame rate.";
    return undefined;
  },
  // The estimate itself is the panel's last line, in large type; this line says what would make a
  // large GIF lighter.
  summary: (o, info) => {
    if (!info.video) return undefined;
    if (estimate(o, info).bytes > LARGE) {
      const tip = lighter(o, info);
      return `Over ${formatBytes(LARGE)} is heavy for a GIF.${tip ? ` ${tip}` : ""}`;
    }
    return undefined;
  },
  Below: GifBelow,
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
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Start"
            htmlFor="start"
            trailing="s"
            hint="Drag the handles on the timeline, or type exact seconds."
          >
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
          hint={`${withUnit(12, "fps")} looks smooth for most clips. Every step up adds frames and size in proportion.`}
        >
          <Segmented<FpsChoice>
            name="fps"
            aria-labelledby="fps-label"
            value={asFps(value.fps)}
            onChange={(f) => onChange({ ...value, fps: Number(f) })}
            options={fpsChoices.map((f) => ({ value: f, label: f }))}
          />
        </Field>
        <Field
          label="Width"
          htmlFor="width"
          hint={`Chat apps show GIFs small. ${withUnit(480, "px")} is plenty for most; size grows with the square of the width.`}
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
        <Field
          label="Quality"
          labelId="quality-label"
          hint={`Best builds one palette from the whole clip first, for smoother gradients. Needs a one-time download of ${ffmpegDownloadSize()}.`}
        >
          <Segmented<GifQuality>
            name="quality"
            aria-labelledby="quality-label"
            value={value.quality}
            onChange={(quality) => onChange({ ...value, quality })}
            options={[
              { value: "fast", label: "Fast" },
              { value: "best", label: "Best" },
            ]}
          />
        </Field>
        <Checkbox
          label="Loop forever"
          hint="Off plays the GIF once and stops on the last frame, as the preview does."
          checked={value.loop}
          onChange={(e) => onChange({ ...value, loop: e.target.checked })}
        />
        <Estimate value={value} info={info} />
      </div>
    );
  },
} satisfies OptionsSpec<VideoToGifOptions> & {
  Below: React.ComponentType<OptionsPanelProps<VideoToGifOptions>>;
};

/** The live estimate in large type, directly above the summary line and the button. */
function Estimate({ value, info }: { value: VideoToGifOptions; info: MediaInfo }) {
  if (!info.video) return null;
  const { dims, frames, bytes } = estimate(value, info);
  const len = withUnit(Math.max(0, value.end - value.start).toFixed(1), "s");
  return (
    <div aria-live="polite" data-testid="gif-estimate">
      <p className="tabular text-h2">About {formatBytes(bytes)}</p>
      <p className="tabular mt-1 text-fg-muted text-sm">
        {formatCount(frames, "frame")}, {len} at {withUnit(value.fps, "fps")},{" "}
        {formatDimensions(dims.width, dims.height)}
      </p>
    </div>
  );
}

/**
 * The range on the timeline, with the preview playing it the way the GIF will: muted and on repeat
 * (once, when Loop is off). It starts playing by itself unless the user asks for reduced motion.
 */
function GifBelow({
  value,
  onChange,
  info,
  media,
  disabled,
}: OptionsPanelProps<VideoToGifOptions>) {
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

  // Muted like the GIF will be; played on its own once, when the preview is ready.
  const started = useRef(false);
  const start = value.start;
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let el: HTMLVideoElement | null = null;
    const go = () => {
      el = media.video.current;
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
      const v = el;
      if (v.readyState >= 1) play(v);
      else v.addEventListener("loadedmetadata", () => play(v), { once: true });
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
  // One frame of this video, drawn at the GIF's size and encoded the way the fast path encodes,
  // tells how this content compresses (a flat screen recording and a noisy sky differ tenfold).
  // Measured once per output width, a moment after the preview has a picture.
  const dims = gifDimensions(info.video?.width ?? 0, info.video?.height ?? 0, value.width);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    if (dims.width <= 0 || latest.current.value.sampled?.[dims.width] !== undefined) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const el = media.video.current;
      if (!el || el.readyState < 2 || cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(el, 0, 0, dims.width, dims.height);
      const { sampleGifBytesPerPixel } = await import("@/tools/engines/video-to-gif/sample-size");
      const rgba = ctx.getImageData(0, 0, dims.width, dims.height).data;
      const perPixel = sampleGifBytesPerPixel(rgba, dims.width, dims.height);
      if (cancelled || !(perPixel > 0)) return;
      const { value: v, onChange: set } = latest.current;
      set({ ...v, sampled: { ...v.sampled, [dims.width]: perPixel } });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dims.width, dims.height, media.video]);

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
          ? `GIFs are short by nature, so the range starts as the first ${withUnit(DEFAULT_MAX_SECONDS, "s")}. Drag the handles, or press I and O at the playhead, to pick any part.`
          : "The preview plays the range muted and on repeat, as the GIF will. Drag the handles, or press I and O at the playhead."}
      </p>
    </div>
  );
}
