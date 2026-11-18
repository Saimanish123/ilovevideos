"use client";

import { useCallback, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { formatTimecode, withUnit } from "@/lib/format";

const seconds = (s: number) => withUnit(Number(s.toFixed(2)), "s");

import { startDrag, TimelineTrack, useSeek, useTimeAt } from "./timeline-track";

export interface FadeRange {
  /** Seconds of fade at the start. */
  fadeIn: number;
  /** Seconds of fade at the end. */
  fadeOut: number;
}

/**
 * Timeline for a fade in and a fade out: the filmstrip with a ramp drawn over each end (dark or
 * light, the fade's colour), and two handles, one where the fade in ends and one where the fade out
 * begins. Handles are sliders for keyboard users: arrows move a tenth of a second, Shift one second,
 * Home/End jump to none and the longest. Pointer tracking is 1:1, no animation (design system §6.3).
 */
export function FadeTimeline({
  file,
  video,
  duration,
  value,
  onChange,
  max,
  color,
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  value: FadeRange;
  onChange: (next: FadeRange) => void;
  /** Longest fade either end. */
  max: number;
  color: "black" | "white";
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const snap = useCallback(
    (t: number) => Math.min(duration, Math.max(0, Math.round(t * 20) / 20)),
    [duration],
  );
  const seek = useSeek(video);
  const timeAt = useTimeAt(trackRef, duration, snap);
  // Each fade keeps at least a twentieth of a second of picture between them.
  const room = (other: number) => Math.max(0, Math.min(max, duration - other - 0.05));
  const setIn = (s: number) => {
    const fadeIn = Math.max(0, Math.min(room(value.fadeOut), s));
    onChange({ ...value, fadeIn });
    seek(fadeIn);
  };
  const setOut = (s: number) => {
    const fadeOut = Math.max(0, Math.min(room(value.fadeIn), s));
    onChange({ ...value, fadeOut });
    seek(Math.max(0, duration - fadeOut));
  };

  const drag = (which: "in" | "out") => (e: React.PointerEvent) => {
    if (disabled) return;
    startDrag(e, (clientX) => {
      const t = timeAt(clientX);
      if (which === "in") setIn(t);
      else setOut(duration - t);
    });
  };
  // Both handles are positions on the timeline: the fade in's end and the fade out's start. Right
  // and Up move a handle right; Home and End go to its leftmost and rightmost positions.
  const key = (which: "in" | "out") => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 1 : 0.1;
    const pos = which === "in" ? value.fadeIn : duration - value.fadeOut;
    const lo = which === "in" ? 0 : duration - room(value.fadeIn);
    const hi = which === "in" ? room(value.fadeOut) : duration;
    let next: number | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = pos + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = pos - step;
    else if (e.key === "Home") next = lo;
    else if (e.key === "End") next = hi;
    if (next === undefined) return;
    e.preventDefault();
    const r = Math.round(Math.max(lo, Math.min(hi, next)) * 100) / 100;
    if (which === "in") setIn(r);
    else setOut(Math.round((duration - r) * 100) / 100);
  };

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const ramp = color === "black" ? "from-gray-1000" : "from-gray-0";
  return (
    <div className="select-none">
      <div className="tabular flex justify-between text-fg-muted text-xs">
        <span>
          Fade in <span className="text-fg">{seconds(value.fadeIn)}</span>
        </span>
        <span>
          Fade out <span className="text-fg">{seconds(value.fadeOut)}</span>
        </span>
      </div>
      <TimelineTrack
        file={file}
        video={video}
        duration={duration}
        disabled={disabled}
        trackRef={trackRef}
        timeAt={timeAt}
        strip={
          <>
            <div
              data-testid="fade-in-ramp"
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 bg-linear-to-r to-transparent",
                ramp,
              )}
              style={{ width: `${pct(value.fadeIn)}%` }}
              aria-hidden
            />
            <div
              data-testid="fade-out-ramp"
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 bg-linear-to-l to-transparent",
                ramp,
              )}
              style={{ width: `${pct(value.fadeOut)}%` }}
              aria-hidden
            />
          </>
        }
      >
        <Handle
          left={pct(value.fadeIn)}
          label="Fade in ends"
          id={`${id}-in`}
          value={value.fadeIn}
          min={0}
          max={room(value.fadeOut)}
          valueText={`fade in to ${formatTimecode(value.fadeIn)}, ${seconds(value.fadeIn)}`}
          disabled={disabled}
          onPointerDown={drag("in")}
          onKeyDown={key("in")}
        />
        <Handle
          left={pct(duration - value.fadeOut)}
          label="Fade out starts"
          id={`${id}-out`}
          value={duration - value.fadeOut}
          min={duration - room(value.fadeIn)}
          max={duration}
          valueText={`fade out from ${formatTimecode(duration - value.fadeOut)}, ${seconds(value.fadeOut)}`}
          disabled={disabled}
          onPointerDown={drag("out")}
          onKeyDown={key("out")}
        />
      </TimelineTrack>
    </div>
  );
}

/** 44px hit area; the focus ring is drawn on the visible bar. The value is the handle's time. */
function Handle({
  left,
  label,
  id,
  value,
  min,
  max,
  valueText,
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
  valueText: string;
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
      aria-valuemin={Math.round(min * 100) / 100}
      aria-valuemax={Math.round(max * 100) / 100}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={valueText}
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
