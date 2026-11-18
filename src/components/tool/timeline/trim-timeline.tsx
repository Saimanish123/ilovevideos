"use client";

import { useCallback, useId, useRef } from "react";
import { formatTimecode } from "@/lib/format";
import { startDrag, TimelineTrack, useSeek, useTimeAt } from "./timeline-track";

export interface TrimRange {
  start: number;
  end: number;
}

/** Most key frame ticks drawn; beyond this they merge into a gray bar and say nothing (as on split). */
const MAX_TICKS = 300;

/**
 * Timeline for choosing a time range: filmstrip of frames, two draggable handles, a playhead that
 * follows the preview and a draggable selection body. Handles are sliders for keyboard users:
 * arrows move one frame, Shift+arrows one second, Home/End jump. Pointer tracking is 1:1, no
 * animation (design system §6.3). Snaps to frame boundaries so the cut is frame-accurate.
 * Controls are drawn in the light end of the gray ramp because the track is the always-dark stage.
 * The track itself (filmstrip, playhead, scrub) is shared with the split timeline. With `keyframes`
 * the strip shows a tick per key frame (where a lossless cut can start), and `actualStart` marks
 * where the cut really starts when it snaps back from the Start handle.
 */
export function TrimTimeline({
  file,
  video,
  duration,
  fps,
  value,
  onChange,
  disabled = false,
  keyframes,
  actualStart,
  repeat = false,
  showLength = true,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  fps: number;
  value: TrimRange;
  onChange: (next: TrimRange) => void;
  disabled?: boolean;
  /** Key frame times, drawn as ticks along the bottom of the strip. */
  keyframes?: number[];
  /** Where a lossless cut really starts, when it is before `value.start`: a line and a lighter band. */
  actualStart?: number;
  /** Play the selection on repeat (TimelineTrack `repeat`). */
  repeat?: boolean;
  /** The "0:42 selected" readout between the times; off when the page shows its own. */
  showLength?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const frameDur = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const snap = useCallback(
    (t: number) => Math.min(duration, Math.max(0, Math.round(t / frameDur) * frameDur)),
    [duration, frameDur],
  );
  const minGap = frameDur;
  const seek = useSeek(video);
  const timeAt = useTimeAt(trackRef, duration, snap);

  const drag = (mode: "start" | "end" | "body") => (e: React.PointerEvent) => {
    if (disabled) return;
    const origin = timeAt(e.clientX);
    const initial = value;
    startDrag(e, (clientX) => {
      const t = timeAt(clientX);
      if (mode === "start") {
        const start = Math.min(t, initial.end - minGap);
        onChange({ start, end: initial.end });
        seek(start);
      } else if (mode === "end") {
        const end = Math.max(t, initial.start + minGap);
        onChange({ start: initial.start, end });
        seek(end);
      } else {
        const len = initial.end - initial.start;
        const start = snap(Math.min(Math.max(0, initial.start + (t - origin)), duration - len));
        onChange({ start, end: start + len });
        seek(start);
      }
    });
  };

  const key = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 1 : frameDur;
    const cur = which === "start" ? value.start : value.end;
    let next: number | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
    else if (e.key === "Home") next = which === "start" ? 0 : value.start + minGap;
    else if (e.key === "End") next = which === "end" ? duration : value.end - minGap;
    if (next === undefined) return;
    e.preventDefault();
    if (which === "start") {
      const start = snap(Math.min(Math.max(0, next), value.end - minGap));
      onChange({ ...value, start });
      seek(start);
    } else {
      const end = snap(Math.max(Math.min(duration, next), value.start + minGap));
      onChange({ ...value, end });
      seek(end);
    }
  };

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const ticks = keyframes && keyframes.length <= MAX_TICKS ? keyframes : [];
  const snapped =
    actualStart !== undefined && value.start - actualStart >= 0.005 ? actualStart : undefined;

  return (
    <div className="select-none">
      <div className="tabular flex justify-between text-fg-muted text-xs">
        <span>{formatTimecode(value.start)}</span>
        {showLength && (
          <span className="text-fg">{formatTimecode(value.end - value.start)} selected</span>
        )}
        <span>{formatTimecode(value.end)}</span>
      </div>
      {/* Outer track is not clipped so the 44px handles keep their full hit area at the edges. */}
      <TimelineTrack
        file={file}
        video={video}
        duration={duration}
        disabled={disabled}
        trackRef={trackRef}
        loop={value}
        repeat={repeat}
        timeAt={timeAt}
        strip={
          <>
            {ticks.map((k) => (
              <div
                key={`k-${k}`}
                data-testid="keyframe-tick"
                // Light with a dark edge, so a tick reads on any frame of the filmstrip.
                className="pointer-events-none absolute bottom-0 h-2 w-0.5 -translate-x-1/2 bg-gray-50 ring-1 ring-gray-950"
                style={{ left: `${pct(k)}%` }}
                aria-hidden
              />
            ))}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-overlay"
              style={{ width: `${pct(snapped ?? value.start)}%` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 bg-overlay"
              style={{ width: `${pct(duration - value.end)}%` }}
              aria-hidden
            />
            {snapped !== undefined && (
              // A lossless cut keeps the stretch from the key frame before Start: it is left undimmed,
              // and a dashed line marks the key frame where the file really starts.
              <div
                data-testid="actual-start"
                className="pointer-events-none absolute inset-y-0 w-0 border-gray-50 border-l border-dashed"
                style={{ left: `${pct(snapped)}%` }}
                aria-hidden
              />
            )}
            <div
              className="absolute inset-y-0 cursor-grab touch-none border-gray-50 border-y active:cursor-grabbing"
              style={{ left: `${pct(value.start)}%`, width: `${pct(value.end - value.start)}%` }}
              onPointerDown={drag("body")}
              aria-hidden
            />
          </>
        }
      >
        <Handle
          left={pct(value.start)}
          label="Start"
          id={`${id}-start`}
          value={value.start}
          min={0}
          max={value.end - minGap}
          disabled={disabled}
          onPointerDown={drag("start")}
          onKeyDown={key("start")}
        />
        <Handle
          left={pct(value.end)}
          label="End"
          id={`${id}-end`}
          value={value.end}
          min={value.start + minGap}
          max={duration}
          disabled={disabled}
          onPointerDown={drag("end")}
          onKeyDown={key("end")}
        />
      </TimelineTrack>
    </div>
  );
}

/** 44px hit area; the focus ring is drawn on the visible 12px bar, not the hit box. */
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
