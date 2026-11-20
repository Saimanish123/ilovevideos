"use client";

import { useId } from "react";
import { CropFrame } from "@/components/tool/crop/crop-frame";
import { geometryEstimate } from "@/components/tool/crop/estimate";
import { PadPreview } from "@/components/tool/crop/pad-preview";
import { PreviewScrubber } from "@/components/tool/crop/preview-scrubber";
import { ShapePicker } from "@/components/tool/crop/shape-picker";
import { shapeOption, shapesFor } from "@/components/tool/crop/shapes";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import {
  capFor,
  type FrameProfile,
  getFramePlatform,
  keepsOwnResolution,
  sizeLabel,
} from "@/content/platforms/frames";
import { formatBytes, formatDimensions, formatDuration } from "@/lib/format";
import {
  type AspectRatioId,
  type AspectRatioOptions,
  aspectNoop,
  aspectNumber,
  aspectPlan,
  aspectRatioIds,
  capOf,
  fillRect,
} from "@/tools/engines/aspect-ratio/options";
import { anchorOf, hasRatio, keptShare, largestRect } from "@/tools/engines/crop/math";
import { needsFfmpeg, outputSize } from "@/tools/engines/crop/plan";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { isRatio } from "./idle/aspect-ratio";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

/** Longer use notes under the picker, for the selected shape. Common practice, not platform limits. */
const shapeUse: Record<AspectRatioId, string> = {
  "16:9": "Widescreen: YouTube, TVs, laptops and presentations.",
  "9:16": "Full-screen vertical: TikTok, Reels, Shorts and Stories.",
  "1:1": "Square: feed posts and profile grids.",
  "4:5": "Tall portrait: the tallest shape the Instagram feed shows in full.",
  "4:3": "Classic TV and iPad shape; older projectors and slides.",
};

const sourceOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

/** The first shape that actually changes the picture: landscape and square go vertical, portrait goes wide. */
function defaultRatio(info: MediaInfo): AspectRatioId {
  const { width, height } = sourceOf(info);
  if (height > 0 && width / height < 0.95) return "16:9";
  return "9:16";
}

const barsWhere = (src: { width: number; height: number }, ratio: number) =>
  ratio < src.width / src.height ? "above and below" : "at the sides";

/** Shapes a platform page offers: its own, plus any second shape its help page names (Shorts: square). */
const platformShapes = (p: FrameProfile): AspectRatioId[] => [p.ratio, ...(p.alsoRatios ?? [])];

/** Options for a platform at a shape: the size cap turned to that shape, and its length limit. */
function platformTarget(p: FrameProfile, ratio: AspectRatioId) {
  const cap = capFor(p, ratio);
  return { ratio, maxWidth: cap.width, maxHeight: cap.height, platform: p.id };
}

/** How the frame is reached, in words: "whole picture kept, black bars above and below". */
function howText(o: AspectRatioOptions, info: MediaInfo): string {
  const v = sourceOf(info);
  const plan = aspectPlan(o, v);
  if (hasRatio(v, aspectNumber(o.ratio))) {
    const size = outputSize(plan);
    return `shape kept, scaled down from ${formatDimensions(v.width, v.height)} to ${formatDimensions(size.width, size.height)}`;
  }
  return plan.kind === "crop"
    ? `filled by cropping, ${Math.round(keptShare(plan.rect, v) * 100)}% of the picture kept`
    : `whole picture kept, ${o.background === "blur" ? "blurred" : o.background} bars ${barsWhere(v, aspectNumber(o.ratio))}`;
}

/**
 * Below the platform's minimum edge: what that means and what to do about it. Nothing is enlarged
 * here, because scaling up adds no detail; a larger source is the fix.
 */
const smallNote = (p: FrameProfile, size: { width: number; height: number }) =>
  `${p.name} asks for at least ${p.minEdge} pixels on the short side and this result has ${Math.min(size.width, size.height)}, so it plays enlarged and soft on a phone. Start from a larger recording, at least ${p.minEdge} pixels across once in the new shape.`;

const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

function FitFields({
  value,
  onChange,
  blurFirst = false,
}: Pick<OptionsPanelProps<AspectRatioOptions>, "value" | "onChange"> & {
  /** Offer Blurred first (the page whose job is a blurred background). */
  blurFirst?: boolean;
}) {
  const bars = [
    { value: "black" as const, label: "Black" },
    { value: "white" as const, label: "White" },
    { value: "blur" as const, label: "Blurred" },
  ];
  const fitId = useId();
  const barsId = useId();
  return (
    <>
      <Field
        label="Fit"
        labelId={fitId}
        hint={
          value.fit === "pad"
            ? "Keeps the whole picture and fills the empty space with bars."
            : "Fills the frame and cuts what does not fit. Drag the window on the preview to choose what stays."
        }
      >
        <Segmented
          name="fit"
          aria-labelledby={fitId}
          value={value.fit}
          options={[
            { value: "pad", label: "Add bars" },
            { value: "crop", label: "Crop to fill" },
          ]}
          onChange={(fit) => onChange({ ...value, fit })}
        />
      </Field>
      {value.fit === "pad" && (
        <Field
          label="Bars"
          labelId={barsId}
          hint={
            value.background === "blur"
              ? "The picture itself, enlarged, blurred and dimmed behind the sharp one."
              : undefined
          }
        >
          <Segmented
            name="background"
            aria-labelledby={barsId}
            value={value.background}
            options={blurFirst ? [bars[2], bars[0], bars[1]].flatMap((b) => (b ? [b] : [])) : bars}
            onChange={(background) => onChange({ ...value, background })}
          />
        </Field>
      )}
    </>
  );
}

/** Ready state on a resize-for-platform page: the target first, then fit, then the platform's own checks. */
function PlatformPanel({
  p,
  value,
  onChange,
  info,
}: { p: FrameProfile } & Pick<
  OptionsPanelProps<AspectRatioOptions>,
  "value" | "onChange" | "info"
>) {
  const targetId = useId();
  const lengthId = useId();
  const shapes = platformShapes(p);
  const src = sourceOf(info);
  const cap = capOf(value) ?? p.cap;
  const size = outputSize(aspectPlan(value, src));
  const notes: string[] = [];
  if (!keepsOwnResolution(p) && size.width < cap.width)
    notes.push(
      `The result is ${formatDimensions(size.width, size.height)}, smaller than ${formatDimensions(cap.width, cap.height)}: the source has fewer pixels at this shape, and nothing is enlarged.`,
    );
  if (p.minEdge && Math.min(size.width, size.height) < p.minEdge) notes.push(smallNote(p, size));
  if (p.minFps && info.video && info.video.fps > 0 && info.video.fps < p.minFps - 0.5)
    notes.push(
      `${p.name} asks for at least ${p.minFps} fps; this clip is ${Math.round(info.video.fps)} fps, and the frame rate is kept.`,
    );
  if (p.safeZone)
    notes.push(
      `${p.name} draws its buttons and caption over the bottom ${Math.round(p.safeZone.bottom * 100)}% and top ${Math.round(p.safeZone.top * 100)}% of the frame; keep faces and text between them.`,
    );
  const long = p.maxSec !== undefined && info.durationSec > p.maxSec + 0.05;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p id={targetId} className="font-medium text-sm">
          Target
        </p>
        {shapes.length > 1 ? (
          <div className="mt-2">
            <ShapePicker
              name="ratio"
              aria-labelledby={targetId}
              value={value.ratio}
              columns={shapes.length}
              options={shapes.map(shapeOption)}
              onChange={(ratio) =>
                onChange({ ...value, ...platformTarget(p, ratio), anchorX: 0.5, anchorY: 0.5 })
              }
            />
          </div>
        ) : null}
        <p className="tabular mt-2 text-body">
          {p.name} · {value.ratio} · {sizeLabel(p, value.ratio)}
        </p>
        <p className="mt-1 text-fg-muted text-xs">{p.capNote}</p>
      </div>
      {/* A source that already has the shape is only scaled: there is nothing to fit. */}
      {!hasRatio(src, aspectNumber(value.ratio)) && <FitFields value={value} onChange={onChange} />}
      {long && p.maxSec !== undefined && (
        <Field
          label="Length"
          labelId={lengthId}
          hint={`${p.name} are up to ${formatDuration(p.maxSec)}; a longer upload is published as a regular video.`}
        >
          <Segmented
            name="length"
            aria-labelledby={lengthId}
            value={value.maxSec === undefined ? "all" : "cut"}
            options={[
              { value: "cut", label: `First ${formatDuration(p.maxSec)}` },
              { value: "all", label: `All ${formatDuration(info.durationSec)}` },
            ]}
            onChange={(v) => onChange({ ...value, maxSec: v === "cut" ? p.maxSec : undefined })}
          />
        </Field>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-fg-muted text-xs">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A page that names its shape without a platform (vertical-video-to-horizontal) locks it: the shape
 * picker is hidden and a source that already has the page's orientation is settled. UI only; the
 * engine's schema drops the key.
 */
type AspectValue = AspectRatioOptions & { locked?: true };

/** "horizontal" for shapes wider than tall, "vertical" for taller, "square" otherwise. */
const orientation = (w: number, h: number) =>
  w > h * 1.02 ? "horizontal" : h > w * 1.02 ? "vertical" : "square";

export const aspectRatioSpec: OptionsSpec<AspectValue> = {
  verb: "Change aspect ratio",
  defaults: (info, preset) => {
    const p = getFramePlatform(preset.platform);
    if (p) {
      const ratio =
        isRatio(preset.ratio) && platformShapes(p).includes(preset.ratio) ? preset.ratio : p.ratio;
      const src = sourceOf(info);
      // Fill when little is lost (a phone clip into 9:16), bars when a crop would cut a lot (landscape into 9:16).
      const kept = keptShare(largestRect(src, aspectNumber(ratio)), src);
      return {
        ...platformTarget(p, ratio),
        fit: kept >= 0.75 ? "crop" : "pad",
        anchorX: 0.5,
        anchorY: 0.5,
        background: "black",
        maxSec: p.maxSec !== undefined && info.durationSec > p.maxSec + 0.05 ? p.maxSec : undefined,
      };
    }
    return {
      ratio: isRatio(preset.ratio) ? preset.ratio : defaultRatio(info),
      ...(isRatio(preset.ratio) ? { locked: true as const } : {}),
      fit: preset.fit === "crop" || preset.fit === "pad" ? preset.fit : "pad",
      anchorX: 0.5,
      anchorY: 0.5,
      background:
        preset.background === "white" || preset.background === "blur" ? preset.background : "black",
    };
  },
  route: (_o, info, fileName) => (needsFfmpeg(info, fileName) ? "page" : "worker"),
  blocked: (o, info) => {
    if (!info.video)
      return unfixable("This file has no video track to reshape. Choose a video file.");
    if (o.locked) {
      const v = info.video;
      const target = aspectNumber(o.ratio);
      const want = target > 1 ? "horizontal" : target < 1 ? "vertical" : "square";
      if (orientation(v.width, v.height) === want)
        return {
          reason: `Already ${want}: this video is ${formatDimensions(v.width, v.height)}. For another shape, change its aspect ratio.`,
          settled: true,
          action: { slug: "change-video-aspect-ratio", label: "Change aspect ratio" },
        };
    }
    if (aspectNoop(o, info.video, info.durationSec)) {
      const p = getFramePlatform(o.platform);
      // On a platform page the job is already done (settled: success, no primary button); on the
      // generic page the user picked the shape the video has, so they need another one.
      return p
        ? {
            reason: `This video is already ${o.ratio} at ${formatDimensions(info.video.width, info.video.height)}, within what ${p.name} takes. Post it as it is.`,
            settled: true,
          }
        : `This video is already ${o.ratio}. Pick a different shape.`;
    }
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || aspectNoop(o, v, info.durationSec)) return undefined;
    const plan = aspectPlan(o, v);
    const size = outputSize(plan);
    const kept = plan.end !== undefined ? Math.min(plan.end, info.durationSec) : info.durationSec;
    const est = geometryEstimate(
      { ...info, durationSec: kept },
      size,
      soundEncodersNow(),
      kept < info.durationSec,
    );
    const trim =
      plan.end !== undefined && info.durationSec > plan.end
        ? ` Only the first ${formatDuration(plan.end)} of ${formatDuration(info.durationSec)} is kept.`
        : "";
    const how = hasRatio(v, aspectNumber(o.ratio))
      ? sentence(howText(o, info))
      : plan.kind === "crop"
        ? `The picture fills the frame and ${Math.round((1 - keptShare(plan.rect, v)) * 100)}% of it is cut off`
        : `The whole picture is kept, with ${o.background === "blur" ? "blurred" : o.background} bars ${barsWhere(v, aspectNumber(o.ratio))}`;
    return `Output ${formatDimensions(size.width, size.height)}, about ${formatBytes(est.bytes)}. ${how}; the video is re-encoded to H.264.${trim} ${est.audio}${est.container}`;
  },
  previewResult: true,
  // The frame changes shape: side by side, never a wipe across two framings (ADR-0135).
  compare: () => ({ what: "picture", layout: "side-by-side" }),
  nextStep: { slug: "compress-video", label: "Compress video" },
  result: (o, info, output) => {
    const v = info.video;
    if (!v) return undefined;
    const size = outputSize(aspectPlan(o, v));
    const p = getFramePlatform(o.platform);
    const cut =
      o.maxSec !== undefined && info.durationSec > o.maxSec
        ? ` The first ${formatDuration(o.maxSec)} was kept.`
        : "";
    return {
      title: p
        ? `Resized for ${p.name}: ${formatDimensions(size.width, size.height)}`
        : `Now ${o.ratio}: ${formatDimensions(size.width, size.height)}`,
      detail: `${sentence(howText(o, info))}.${cut}${p?.minEdge && Math.min(size.width, size.height) < p.minEdge ? ` ${smallNote(p, size)}` : ""} The preview now plays the result.`,
      // Bars and a new frame are meant to change the size; a "+47%" would read as a failure.
      change: false,
      // Under 8 MB (the smallest compress target on this site) compressing is not the next step.
      next: output.bytes < 8_000_000 ? null : undefined,
    };
  },
  Overlay({ value, onChange, info, disabled, media }) {
    const src = sourceOf(info);
    if (hasRatio(src, aspectNumber(value.ratio))) return null;
    if (value.fit === "pad") {
      return (
        <PadPreview
          source={src}
          ratio={aspectNumber(value.ratio)}
          color={value.background}
          video={media.video}
        />
      );
    }
    return (
      <CropFrame
        source={src}
        rect={fillRect(value, src)}
        ratio={aspectNumber(value.ratio)}
        mode="move"
        onChange={(r) => {
          const a = anchorOf(r, src);
          onChange({ ...value, anchorX: a.x, anchorY: a.y });
        }}
        disabled={disabled}
        label="Kept window"
      />
    );
  },
  Below({ info, media, disabled }) {
    return (
      <PreviewScrubber file={media.file} video={media.video} info={info} disabled={disabled} />
    );
  },
  Panel({ value, onChange, info, preset }) {
    const shapeId = useId();
    const p = getFramePlatform(preset.platform);
    if (p) return <PlatformPanel p={p} value={value} onChange={onChange} info={info} />;
    if (value.locked) {
      return (
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-medium text-sm">Target</p>
            <p className="tabular mt-2 text-body" data-testid="locked-target">
              {value.ratio} · {shapeUse[value.ratio]}
            </p>
          </div>
          <FitFields value={value} onChange={onChange} blurFirst />
        </div>
      );
    }
    const shapes = shapesFor(aspectRatioIds, sourceOf(info), value.ratio);
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p id={shapeId} className="font-medium text-sm">
            New shape
          </p>
          <div className="mt-2">
            <ShapePicker
              name="ratio"
              aria-labelledby={shapeId}
              value={value.ratio}
              options={shapes.map(shapeOption)}
              onChange={(ratio) => onChange({ ...value, ratio, anchorX: 0.5, anchorY: 0.5 })}
            />
          </div>
          <p className="mt-2 text-fg-muted text-xs">
            {shapeUse[value.ratio]}
            {shapes.length < aspectRatioIds.length &&
              " The shape this video already has is not listed."}
          </p>
        </div>
        <FitFields value={value} onChange={onChange} />
      </div>
    );
  },
};
