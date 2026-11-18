"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { UnitField } from "@/components/tool/regions/percent-field";
import { FreezeTimeline } from "@/components/tool/timeline/freeze-timeline";
import { usePlayhead } from "@/components/tool/timeline/use-playhead";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import {
  formatBytes,
  formatDimensions,
  formatDuration,
  formatTimecode,
  withUnit,
} from "@/lib/format";
import { lastFrameTime, snapToFrame } from "@/tools/engines/frame-extract/math";
import {
  DEFAULT_HOLD,
  type FreezeOptions,
  gridTimes,
  type Hold,
  MAX_HOLD,
  MAX_HOLDS,
  MIN_HOLD,
  outputLength,
  planHolds,
} from "@/tools/engines/freeze-frame/options";
import type { MediaInfo } from "@/tools/engines/types";
import { pictureEstimate } from "@/tools/engines/video-filter/plan";
import { PLAY_SHORTCUT } from "../shortcuts";
import { nativeOnly } from "./native-only";
import { pictureSize } from "./picture-size";
import type { OptionsSpec } from "./types";

const lengths = [
  { value: "1", label: "1 s" },
  { value: "2", label: "2 s" },
  { value: "3", label: "3 s" },
  { value: "5", label: "5 s" },
] as const;

const fpsOf = (info: MediaInfo) => (info.video?.fps && info.video.fps > 0 ? info.video.fps : 30);
const snap = (info: MediaInfo, t: number) => snapToFrame(t, fpsOf(info), info.durationSec);
const plan = (o: FreezeOptions, info: MediaInfo) =>
  planHolds(o.holds, gridTimes(info.durationSec, fpsOf(info)), info.durationSec);
const secs = (n: number) => withUnit(Number(n.toFixed(2)), "s");

/** Holds in time order, so the list, the timeline and the result read the same way. */
const sorted = (holds: Hold[]) => [...holds].sort((a, b) => a.at - b.at);

/** One hold in the list: the frame and length (a button that shows it), and remove. */
function HoldRow({
  hold,
  index,
  selected,
  onShow,
  onRemove,
  removable,
}: {
  hold: Hold;
  index: number;
  selected: boolean;
  onShow: () => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onShow}
        aria-current={selected || undefined}
        className={cn(
          "tabular -ml-2 flex min-h-11 flex-1 items-center rounded-md px-2 text-left text-sm hover:bg-bg-subtle focus-visible:outline-2 focus-visible:outline-ring",
          selected ? "font-medium text-fg" : "text-fg-muted",
        )}
        aria-label={`Hold ${index + 1}: frame at ${formatTimecode(hold.at)}, ${secs(hold.seconds)}. Show it in the preview`}
      >
        Frame at {formatTimecode(hold.at)} · {secs(hold.seconds)}
      </button>
      {removable && (
        <Button
          variant="ghost"
          size="md"
          className="size-11 shrink-0 px-0"
          onClick={onRemove}
          aria-label={`Remove hold ${index + 1}`}
        >
          <X size={20} strokeWidth={1.5} aria-hidden />
        </Button>
      )}
    </li>
  );
}

/** The hold the length controls edit: the one on the playhead's frame, else the nearest. */
function selectedHold(holds: Hold[], here: number): number {
  let best = 0;
  for (let i = 1; i < holds.length; i++)
    if (Math.abs((holds[i]?.at ?? 0) - here) < Math.abs((holds[best]?.at ?? 0) - here)) best = i;
  return best;
}

export const freezeFrameSpec: OptionsSpec<FreezeOptions> = {
  verb: "Freeze",
  previewResult: true,
  batch: false,
  nextStep: { slug: "trim-video", label: "Trim the result" },
  shortcuts: [
    { keys: ", .", label: "Step one frame in the preview" },
    { keys: "← →", label: "Move a focused hold one frame" },
    { keys: "Shift ← →", label: "Move it one second" },
    { keys: "Delete", label: "Remove a focused hold" },
    PLAY_SHORTCUT,
  ],
  defaults: (info, preset) => {
    const at =
      preset.at === "end"
        ? lastFrameTime(info.durationSec, fpsOf(info))
        : snap(info, info.durationSec / 2);
    return {
      holds: [{ at, seconds: typeof preset.seconds === "number" ? preset.seconds : DEFAULT_HOLD }],
      mode: preset.mode === "over" ? "over" : "pause",
    };
  },
  blocked: (o, info) => {
    if (!info.video) return "This file has no picture to freeze.";
    const native = nativeOnly(info);
    if (native) return native;
    if (o.holds.length === 0) return "Add a hold first: choose a frame and press Add hold.";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || o.holds.length === 0) return undefined;
    const planned = plan(o, info);
    const out = outputLength(planned, info.durationSec, o.mode);
    const size = pictureSize(info);
    const est = pictureEstimate(info, size, v.fps, out);
    const length =
      o.mode === "pause"
        ? `${formatDuration(info.durationSec)} → ${formatDuration(out)}`
        : formatDuration(out);
    const dims =
      size.width === v.width && size.height === v.height
        ? formatDimensions(size.width, size.height)
        : `${formatDimensions(v.width, v.height)} → ${formatDimensions(size.width, size.height)}`;
    const sound = !info.audio?.length
      ? "no sound"
      : o.mode === "pause"
        ? `silence in the ${o.holds.length === 1 ? "hold" : "holds"}, AAC`
        : "sound copied";
    return `${length} · ${dims} · ≈ ${formatBytes(est.bytes)} · H.264, ${sound}`;
  },
  result: (o, info) => {
    const n = plan(o, info).length;
    return { title: n === 1 ? "Frame frozen" : `${n} frames frozen`, change: false };
  },
  Below({ value, onChange, info, media, disabled }) {
    const holds = sorted(value.holds);
    return (
      <FreezeTimeline
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={fpsOf(info)}
        holds={holds}
        over={value.mode === "over"}
        disabled={disabled}
        onChange={(i, at) =>
          onChange({ ...value, holds: holds.map((h, k) => (k === i ? { ...h, at } : h)) })
        }
        onRemove={(i) => onChange({ ...value, holds: holds.filter((_, k) => k !== i) })}
      />
    );
  },
  Panel({ value, onChange, info, media, disabled }) {
    const modeId = useId();
    const lengthId = useId();
    const playhead = usePlayhead(media.video);
    const holds = sorted(value.holds);
    const here = snap(info, playhead);
    const last = lastFrameTime(info.durationSec, fpsOf(info));
    const taken = (t: number) => holds.some((h) => Math.abs(h.at - t) < 1e-6);
    const add = (at: number) =>
      onChange({ ...value, holds: sorted([...holds, { at, seconds: DEFAULT_HOLD }]) });
    const seek = (t: number) => {
      const el = media.video.current;
      if (!el) return;
      el.pause();
      el.currentTime = t;
    };
    const full = holds.length >= MAX_HOLDS;
    const sel = selectedHold(holds, here);
    const current = holds[sel];
    const setSeconds = (seconds: number) =>
      onChange({ ...value, holds: holds.map((h, k) => (k === sel ? { ...h, seconds } : h)) });
    const preset =
      lengths.find((l) => current && Math.abs(Number(l.value) - current.seconds) < 1e-6)?.value ??
      "";
    const why = [
      full ? `Up to ${MAX_HOLDS} holds.` : "",
      !full && taken(here)
        ? "A hold is already on this frame; move the playhead to add another."
        : "",
      !full && value.mode === "pause" && taken(last) && !taken(here)
        ? "The last frame is already held."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <ol className="flex flex-col" aria-label="Holds">
            {holds.map((h, i) => (
              <HoldRow
                key={`${h.at}-${i.toString()}`}
                hold={h}
                index={i}
                selected={i === sel}
                removable={holds.length > 1}
                onShow={() => seek(h.at)}
                onRemove={() => onChange({ ...value, holds: holds.filter((_, k) => k !== i) })}
              />
            ))}
          </ol>
          <div className={value.mode === "pause" ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
            <Button size="md" disabled={disabled || full || taken(here)} onClick={() => add(here)}>
              <span className="tabular">Add hold at {formatTimecode(here)}</span>
            </Button>
            {/* Over the picture, a hold on the last frame would cover nothing. */}
            {value.mode === "pause" && (
              <Button
                size="md"
                disabled={disabled || full || taken(last)}
                onClick={() => {
                  add(last);
                  seek(last);
                }}
              >
                Hold the last frame
              </Button>
            )}
          </div>
          {why && <p className="text-fg-muted text-xs">{why}</p>}
        </div>
        {current && (
          <Field label={`Hold at ${formatTimecode(current.at)} lasts`} labelId={lengthId}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Segmented
                  name="freeze-length"
                  aria-labelledby={lengthId}
                  value={preset as (typeof lengths)[number]["value"]}
                  onChange={(v) => setSeconds(Number(v))}
                  options={[...lengths]}
                />
              </div>
              <UnitField
                id={`${lengthId}-n`}
                label={`Hold at ${formatTimecode(current.at)}, length in seconds`}
                value={current.seconds}
                min={MIN_HOLD}
                max={MAX_HOLD}
                step={0.1}
                decimals={2}
                unit="s"
                onCommit={(n) => {
                  if (Math.abs(n - current.seconds) > 1e-9) setSeconds(n);
                }}
              />
            </div>
          </Field>
        )}
        <Field
          label="During the hold"
          labelId={modeId}
          hint={
            value.mode === "pause"
              ? "The video stops, in silence, then carries on. It gets longer by the holds."
              : "The picture stops while the sound plays on. The length stays the same."
          }
        >
          <Segmented
            name="freeze-mode"
            aria-labelledby={modeId}
            value={value.mode}
            onChange={(mode) => onChange({ ...value, mode })}
            options={[
              { value: "pause", label: "Video pauses" },
              { value: "over", label: "Sound plays on" },
            ]}
          />
        </Field>
      </div>
    );
  },
};
