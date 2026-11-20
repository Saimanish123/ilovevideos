"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId } from "react";
import { useClipCandidates } from "@/components/tool/clips/use-clip-candidates";
import { CropFrame } from "@/components/tool/crop/crop-frame";
import { ClipsTimeline } from "@/components/tool/timeline/clips-timeline";
import { useFrameTime, usePlayhead } from "@/components/tool/timeline/use-playhead";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { framePlatforms } from "@/content/platforms/frames";
import {
  baseName,
  formatBytes,
  formatDimensions,
  formatDuration,
  formatTimecode,
  withUnit,
} from "@/lib/format";
import {
  addCut,
  type ClipsOptions,
  clipBitrate,
  clipsFromCuts,
  cropWindow,
  isVertical,
  LENGTHS,
  moveCut,
  outputFrame,
  proposeCuts,
  removeCut,
  SHORTS_MAX_SEC,
} from "@/tools/engines/clips/plan";
import { snapToFrame } from "@/tools/engines/frame-extract/math";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT } from "../shortcuts";
import { nativeOnly } from "./native-only";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

/**
 * Page-side state on top of the engine's options: the clips are still the automatic proposal, and
 * what the proposal was made from (for the status line).
 */
type ClipsValue = ClipsOptions & {
  auto?: boolean;
  /** Times of the candidates the proposal used, by kind, to say where each boundary landed. */
  found?: { pauses: number[]; scenes: number[] };
};

const fpsOf = (info: MediaInfo) => (info.video?.fps && info.video.fps > 0 ? info.video.fps : 30);
const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 2,
  height: info.video?.height ?? 2,
});
const shorts = framePlatforms["youtube-shorts"];

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

const lengthLabel = (s: number) =>
  s >= 60 && s % 60 === 0 ? withUnit(s / 60, "min") : withUnit(s, "s");

/** Index of the clip that plays at `t`. */
const clipAt = (o: ClipsOptions, t: number) =>
  Math.max(
    0,
    o.clips.findIndex((c) => t >= c.start - 1e-6 && t < c.end - 1e-6),
  );

const chosen = (o: ClipsOptions) => o.clips.filter((c) => c.include);

function estimateBytes(o: ClipsOptions, info: MediaInfo) {
  const kbps = (info.video ? clipBitrate(info.video, o.reframe, fpsOf(info)) : 0) + 192_000;
  return (chosen(o).reduce((s, c) => s + (c.end - c.start), 0) * kbps) / 8;
}

/**
 * Re-proposes the clips while they are still automatic: when the pauses and scene changes are
 * known, and when the length changes. A boundary the user moved stays.
 */
function useProposal(
  value: ClipsValue,
  onChange: (v: ClipsValue) => void,
  file: File,
  info: MediaInfo,
) {
  const c = useClipCandidates(file, info);
  const ready = c.status === "done";
  const key = `${ready}-${value.maxSec}-${value.auto}`;
  // Re-proposes only when `key` changes (analysis done, length, auto); the rest is read as it is then.
  useEffect(() => {
    if (value.auto === false) return;
    const next = clipsFromCuts(
      proposeCuts(info.durationSec, value.maxSec, ready ? c.candidates : []),
      info.durationSec,
    );
    const same =
      next.length === value.clips.length &&
      next.every((x, i) => Math.abs(x.start - (value.clips[i]?.start ?? -1)) < 1e-6);
    const found = ready
      ? {
          pauses: c.candidates.filter((x) => x.kind === "pause").map((x) => x.t),
          scenes: c.candidates.filter((x) => x.kind === "scene").map((x) => x.t),
        }
      : undefined;
    if (!same || (found && !value.found))
      onChange({
        ...value,
        clips: same ? value.clips : next,
        auto: true,
        ...(found ? { found } : {}),
      });
  }, [key]);
  return c;
}

export const clipsSpec: OptionsSpec<ClipsValue> = {
  verb: "Cut clips",
  previewResult: true,
  // Parts of the source on their own timeline (ADR-0134).
  compare: false,
  batch: false,
  zipName: (_o, fileName) => `${baseName(fileName)}-clips.zip`,
  nextStep: { slug: "compress-video", label: "Compress a clip" },
  shortcuts: [
    { keys: "← →", label: "Move a focused boundary one frame" },
    { keys: "Shift ← →", label: "Move it one second" },
    { keys: "Delete", label: "Join the clips on both sides of a focused boundary" },
    PLAY_SHORTCUT,
  ],
  defaults: (info, preset) => {
    const maxSec = typeof preset.maxSec === "number" ? preset.maxSec : 60;
    return {
      clips: clipsFromCuts(proposeCuts(info.durationSec, maxSec, []), info.durationSec),
      maxSec,
      reframe: info.video && isVertical(info.video) ? "none" : "crop",
      auto: true,
    };
  },
  blocked: (o, info) => {
    if (!info.video)
      return unfixable("This file has no picture to cut into clips. Choose a video file.");
    const native = nativeOnly(info);
    if (native) return native;
    if (chosen(o).length === 0) return "Every clip is skipped. Tick at least one.";
    return undefined;
  },
  summary: (o, info) => {
    const n = chosen(o).length;
    const frame = outputFrame(sizeOf(info), o.reframe);
    const long = chosen(o).filter((c) => c.end - c.start > o.maxSec + 1e-3).length;
    const vertical = o.reframe !== "none" && !(info.video && isVertical(info.video));
    // Where the boundaries actually are: on a scene change, in a pause, or at the length cap.
    const cuts = o.clips.slice(1).map((c) => c.start);
    const on = (list: number[] | undefined, t: number) =>
      !!list?.some((x) => Math.abs(x - t) < 1e-6);
    const scenes = cuts.filter((t) => on(o.found?.scenes, t)).length;
    const pauses = cuts.filter((t) => !on(o.found?.scenes, t) && on(o.found?.pauses, t)).length;
    const capped = cuts.length - scenes - pauses;
    const where =
      o.auto === false
        ? "boundaries by hand"
        : cuts.length === 0
          ? undefined
          : `cuts: ${[
              scenes ? `${scenes} at ${scenes === 1 ? "a scene change" : "scene changes"}` : "",
              pauses ? `${pauses} in ${pauses === 1 ? "a pause" : "pauses"}` : "",
              capped ? `${capped} at the length limit` : "",
            ]
              .filter(Boolean)
              .join(", ")}`;
    return [
      `${plural(n, "clip")}${long ? ` (${long} over ${lengthLabel(o.maxSec)})` : ""}`,
      where,
      `${formatDimensions(frame.width, frame.height)}${vertical ? ", 9:16" : ""}`,
      `≈\u00a0${formatBytes(estimateBytes(o, info))} ZIP`,
      `H.264${info.audio?.length ? ", AAC" : ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
  },
  result: (_o, _info, { files }) => ({
    title: `${plural(files, "clip")} cut`,
    change: false,
    before: false,
  }),
  Overlay({ value, onChange, info, media, disabled }) {
    const t = useFrameTime(media.video);
    const src = sizeOf(info);
    if (value.reframe !== "crop" || isVertical(src)) return null;
    const i = clipAt(value, t);
    const clip = value.clips[i];
    if (!clip) return null;
    const w = cropWindow(src, clip.focus);
    return (
      <CropFrame
        source={src}
        rect={{
          x: Math.round(w.x),
          y: Math.round(w.y),
          width: Math.round(w.width),
          height: Math.round(w.height),
        }}
        ratio={9 / 16}
        mode="move"
        disabled={disabled}
        label={`Vertical frame for clip ${i + 1}`}
        onChange={(r) => {
          const focus = Math.min(1, Math.max(0, (r.x + r.width / 2) / src.width));
          onChange({ ...value, clips: value.clips.map((c, k) => (k === i ? { ...c, focus } : c)) });
        }}
      />
    );
  },
  Below({ value, onChange, info, media, disabled, progress }) {
    const c = useProposal(value, onChange, media.file, info);
    const ticks = c.candidates.map((x) => x.t);
    return (
      <div className="flex flex-col gap-2">
        <ClipsTimeline
          file={media.file}
          video={media.video}
          duration={info.durationSec}
          fps={fpsOf(info)}
          clips={value.clips}
          maxSec={value.maxSec}
          ticks={ticks}
          activeClip={progress?.item?.index}
          disabled={disabled}
          onMove={(i, t) => onChange({ ...value, clips: moveCut(value.clips, i, t), auto: false })}
          onRemove={(i) => onChange({ ...value, clips: removeCut(value.clips, i), auto: false })}
        />
        <p className="tabular min-h-4 text-fg-muted text-xs" aria-live="polite">
          {c.status === "measuring"
            ? `Looking for pauses and scene changes · ${Math.round(c.ratio * 100)}%`
            : c.noSound
              ? "No sound to listen to: boundaries come from scene changes and the length."
              : c.soundFailed
                ? "The sound could not be measured here: boundaries come from scene changes and the length."
                : ""}
        </p>
      </div>
    );
  },
  Panel({ value, onChange, info, media, disabled }) {
    const lengthId = useId();
    const frameId = useId();
    const playhead = usePlayhead(media.video);
    const here = snapToFrame(playhead, fpsOf(info), info.durationSec);
    const vertical = info.video ? isVertical(info.video) : false;
    const seek = (t: number) => {
      const el = media.video.current;
      if (!el) return;
      el.pause();
      el.currentTime = t;
    };
    const canSplit = value.clips.some((x) => here > x.start + 1 && here < x.end - 1);
    const list = (
      <ol className="flex flex-col" aria-label="Clips">
        {value.clips.map((x, i) => {
          const range = `${formatTimecode(x.start)}–${formatTimecode(x.end)}`;
          const long = x.end - x.start > value.maxSec + 1e-3;
          return (
            <li key={`${x.start}`} className="flex items-center justify-between gap-2">
              <Checkbox
                label={`Clip ${i + 1}`}
                checked={x.include}
                onChange={(e) =>
                  onChange({
                    ...value,
                    clips: value.clips.map((y, k) =>
                      k === i ? { ...y, include: e.target.checked } : y,
                    ),
                  })
                }
              />
              <button
                type="button"
                onClick={() => seek(x.start)}
                aria-label={`Show clip ${i + 1}, ${range}, in the preview`}
                className="tabular flex min-h-11 items-center rounded-md px-2 text-fg-muted text-sm hover:bg-bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
              >
                {range} · {formatDuration(x.end - x.start)}
                {long ? `, over ${lengthLabel(value.maxSec)}` : ""}
              </button>
            </li>
          );
        })}
      </ol>
    );
    return (
      <div className="flex flex-col gap-6">
        <Field
          label="Longest clip"
          labelId={lengthId}
          hint={`${shorts.name} takes up to ${lengthLabel(SHORTS_MAX_SEC)}.`}
        >
          <Segmented
            name="clips-length"
            aria-labelledby={lengthId}
            value={String(value.maxSec)}
            onChange={(v) => onChange({ ...value, maxSec: Number(v), auto: true })}
            options={LENGTHS.map((s) => ({ value: String(s), label: lengthLabel(s) }))}
          />
        </Field>
        {!vertical && (
          <Field
            label="Vertical 9:16 frame"
            labelId={frameId}
            hint={
              value.reframe === "crop"
                ? "Drag the frame on the picture to choose what each clip shows."
                : value.reframe === "blur"
                  ? "The whole picture across the middle, a blurred copy behind it."
                  : "No reframing: the picture keeps its shape and platforms add bars."
            }
          >
            <Segmented
              name="clips-frame"
              aria-labelledby={frameId}
              value={value.reframe}
              onChange={(reframe) => onChange({ ...value, reframe })}
              options={[
                { value: "crop", label: "Crop" },
                { value: "blur", label: "Blurred bars" },
                { value: "none", label: "Keep shape" },
              ]}
            />
          </Field>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">Clips</span>
            <Button
              size="md"
              disabled={disabled || !canSplit}
              onClick={() => onChange({ ...value, clips: addCut(value.clips, here), auto: false })}
            >
              <span className="tabular">Split at {formatTimecode(here)}</span>
            </Button>
          </div>
          {!canSplit && (
            <p className="text-fg-muted text-xs">
              Move the playhead into a clip, at least a second from its ends, to split it there.
            </p>
          )}
          {value.clips.length > 6 ? (
            // The More options disclosure's look, with the count as its label.
            <details className="group text-sm">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                All {value.clips.length} clips
                <ChevronDown
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden
                  className="transition-transform duration-(--duration-fast) ease-(--ease-in-out) group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              {list}
            </details>
          ) : (
            list
          )}
        </div>
      </div>
    );
  },
};
