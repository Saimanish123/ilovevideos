"use client";

import { useCallback, useId, useRef } from "react";
import { formatTimecode } from "@/lib/format";
import { startDrag, TimelineTrack, useSeek, useTimeAt } from "../timeline/timeline-track";

export interface LayerRange {
  start: number;
  end: number;
}

/**
 * The selected region's or layer's time on the video: the filmstrip, a playhead that follows the
 * preview, the range it shows for (two handles; the rest of the strip dimmed) and its key frames
 * as marks along the bottom. Playback is never held inside the range, so the whole video can be
 * watched with the effect in place. Tap the strip to scrub; tap a mark to go to that key frame.
 * Handles are sliders for the keyboard (arrows one frame, Shift one second, Home and End), marks
 * are buttons. Pointer tracking is 1:1, no animation (design system §6.3); drawn in the light end
 * of the gray ramp because the strip is the always-dark stage. Without a selection it is a plain
 * scrubber, so the picture can still be moved through.
 */
export function LayerTimeline({
  file,
  video,
  duration,
  fps,
  name,
  range,
  onRange,
  marks = [],
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  fps: number;
  /** "Region 2"; undefined when nothing is selected. */
  name?: string;
  range?: LayerRange;
  onRange?: (next: LayerRange) => void;
  /** Key frame times. */
  marks?: number[];
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const frameDur = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const snap = useCallback(
    (t: number) => Math.min(duration, Math.max(0, Math.round(t / frameDur) * frameDur)),
    [duration, frameDur],
  );
  const seek = useSeek(video);
  const timeAt = useTimeAt(trackRef, duration, snap);
  const pct = (t: number) =>
    duration > 0 ? (Math.min(duration, Math.max(0, t)) / duration) * 100 : 0;

  const drag = (which: "start" | "end") => (e: React.PointerEvent) => {
    if (disabled || !range || !onRange) return;
    const initial = range;
    startDrag(e, (clientX) => {
      const t = timeAt(clientX);
      if (which === "start") {
        const start = Math.min(t, initial.end - frameDur);
        onRange({ start: Math.max(0, start), end: initial.end });
        seek(Math.max(0, start));
      } else {
        const end = Math.max(t, initial.start + frameDur);
        onRange({ start: initial.start, end: Math.min(duration, end) });
        seek(Math.min(duration, end) - frameDur / 2);
      }
    });
  };

  const key = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    if (disabled || !range || !onRange) return;
    const step = e.shiftKey ? 1 : frameDur;
    const cur = which === "start" ? range.start : range.end;
    let next: number | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
    else if (e.key === "Home") next = which === "start" ? 0 : range.start + frameDur;
    else if (e.key === "End") next = which === "end" ? duration : range.end - frameDur;
    if (next === undefined) return;
    e.preventDefault();
    if (which === "start") {
      const start = snap(Math.min(Math.max(0, next), range.end - frameDur));
      onRange({ ...range, start });
      seek(start);
    } else {
      const end = snap(Math.max(Math.min(duration, next), range.start + frameDur));
      onRange({ ...range, end });
      seek(end - frameDur / 2);
    }
  };

  return (
    <div className="select-none">
      <div className="tabular flex justify-between gap-3 text-fg-muted text-xs">
        {range && name ? (
          <>
            <span>
              {name}: {formatTimecode(range.start)} to {formatTimecode(range.end)}
            </span>
            {marks.length > 1 && <span>{marks.length} key frames</span>}
          </>
        ) : (
          <span>Choose the moment to show on the picture</span>
        )}
      </div>
      <TimelineTrack
        file={file}
        video={video}
        duration={duration}
        disabled={disabled}
        trackRef={trackRef}
        timeAt={timeAt}
        strip={
          range && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-overlay"
                style={{ width: `${pct(range.start)}%` }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-overlay"
                style={{ width: `${100 - pct(range.end)}%` }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-y-0 border-gray-50 border-y"
                style={{
                  left: `${pct(range.start)}%`,
                  width: `${pct(range.end) - pct(range.start)}%`,
                }}
                aria-hidden
              />
            </>
          )
        }
      >
        {range && onRange && (
          <>
            <Handle
              left={pct(range.start)}
              label={`${name ?? ""} start`.trim()}
              id={`${id}-start`}
              value={range.start}
              min={0}
              max={range.end - frameDur}
              disabled={disabled}
              onPointerDown={drag("start")}
              onKeyDown={key("start")}
            />
            <Handle
              left={pct(range.end)}
              label={`${name ?? ""} end`.trim()}
              id={`${id}-end`}
              value={range.end}
              min={range.start + frameDur}
              max={duration}
              disabled={disabled}
              onPointerDown={drag("end")}
              onKeyDown={key("end")}
            />
          </>
        )}
      </TimelineTrack>
      {marks.length > 0 && (
        // Key frames in a lane of their own under the strip, so each mark is a full 44px target
        // and never sits under a range handle.
        <fieldset className="relative m-0 h-11 border-0 p-0" aria-label="Key frames">
          {marks.map((t) => (
            <button
              key={`m-${t}`}
              type="button"
              disabled={disabled}
              aria-label={`Key frame at ${formatTimecode(t)}`}
              onClick={() => seek(t)}
              className="group -translate-x-1/2 absolute top-0 flex size-11 items-start justify-center outline-none"
              style={{ left: `${pct(t)}%` }}
            >
              <span className="mt-1.5 size-2.5 rotate-45 rounded-sm bg-fg group-focus-visible:outline-2 group-focus-visible:outline-ring group-focus-visible:outline-offset-2" />
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** 44px hit area; the focus ring is drawn on the visible bar, not the hit box. */
function Handle({
  left,
  label,
  id,
  value,
  min,
  max,
  disabled,
  onPointerDown,
  onKeyDown,
}: {
  left: number;
  label: string;
  id: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div
      id={id}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-valuemin={Math.round(min * 1000) / 1000}
      aria-valuemax={Math.round(max * 1000) / 1000}
      aria-valuenow={Math.round(value * 1000) / 1000}
      aria-valuetext={formatTimecode(value)}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center outline-none"
      style={{ left: `${left}%` }}
    >
      <span className="flex h-full w-3 items-center justify-center rounded-sm bg-gray-50 group-focus-visible:stage-focus">
        <span className="h-4 w-0.5 rounded-full bg-gray-900" />
      </span>
    </div>
  );
}
