"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/cn";
import { formatTimecode } from "@/lib/format";
import { snapToFrame } from "@/tools/engines/frame-extract/math";
import { startDrag, TimelineTrack, useSeek, useTimeAt } from "./timeline-track";

/** Drawn size of a key frame mark, px (`size-3.5`). */
const MARK = 14;

/**
 * Timeline for key frames (zoom and pan): the shared filmstrip track with one mark per key frame.
 * A mark is a slider: pressing or dragging it moves the preview there, so the picture above shows
 * that key frame's view; arrows move it one frame, Shift+arrows one second, Delete removes it
 * (while more than `minKeys` remain). Marks cannot pass each other. The mark under the playhead is
 * filled; the others are outlined. Drawn in the light end of the gray ramp (the stage is dark).
 */
export function KeyframeTimeline({
  file,
  video,
  duration,
  fps,
  times,
  current,
  onMove,
  onRemove,
  minKeys = 1,
  label = "Key frame",
  describe,
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  fps: number;
  /** Key frame times, ascending, on the frame grid. */
  times: number[];
  /** Index of the key frame at the playhead, if any. */
  current?: number;
  onMove: (index: number, t: number) => void;
  onRemove: (index: number) => void;
  minKeys?: number;
  label?: string;
  /** Extra words for a mark's spoken value, e.g. "1.5× zoom". */
  describe?: (index: number) => string;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const snap = useCallback((t: number) => snapToFrame(t, fps, duration), [fps, duration]);
  const seek = useSeek(video);
  const timeAt = useTimeAt(trackRef, duration, snap);

  /** Where mark `i` may sit for a wanted time: on a frame, at least a frame from its neighbours. */
  const place = (i: number, t: number) => {
    const lo = i > 0 ? (times[i - 1] ?? 0) + frame : 0;
    const hi = i < times.length - 1 ? (times[i + 1] ?? duration) - frame : duration;
    return snap(Math.min(hi, Math.max(lo, t)));
  };

  const move = (i: number, t: number) => {
    const next = place(i, t);
    const el = video.current;
    if (el && !el.paused) el.pause();
    if (next !== times[i]) onMove(i, next);
    seek(next);
  };

  const drag = (i: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    // Compared with the last time sent during this drag, not the one captured at pointer-down,
    // so dragging away and back lands on the frame under the pointer and the preview follows.
    let last = times[i] ?? 0;
    seek(last);
    startDrag(e, (x) => {
      const next = place(i, timeAt(x));
      const el = video.current;
      if (el && !el.paused) el.pause();
      if (next !== last) {
        last = next;
        onMove(i, next);
      }
      seek(next);
    });
  };

  const key = (i: number) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const cur = times[i] ?? 0;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (times.length <= minKeys) return;
      e.preventDefault();
      onRemove(i);
      return;
    }
    let next: number | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - (e.shiftKey ? 1 : frame);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + (e.shiftKey ? 1 : frame);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = duration;
    if (next === undefined) return;
    e.preventDefault();
    move(i, next);
  };

  const pct = (t: number) => (duration > 0 ? Math.min(100, (t / duration) * 100) : 0);
  /**
   * Marks sit on the same full-width scale as the playhead and a tap on the track. Only the drawn
   * diamond of a mark at the very start or end moves inward by half its size, inside its own hit
   * area, so it shows whole instead of half off the strip.
   */
  const at = (t: number) => `${pct(t)}%`;
  const nudge = (t: number) => (pct(t) <= 0 ? MARK / 2 : pct(t) >= 100 ? -MARK / 2 : 0);

  return (
    <div className="select-none">
      <div className="tabular flex justify-between text-fg-muted text-xs">
        <span>{formatTimecode(0)}</span>
        <span className="text-fg">
          {times.length} {times.length === 1 ? "key frame" : "key frames"}
        </span>
        <span>{formatTimecode(duration)}</span>
      </div>
      <TimelineTrack
        file={file}
        video={video}
        duration={duration}
        disabled={disabled}
        trackRef={trackRef}
        timeAt={timeAt}
        strip={times.slice(1).map((t, i) => (
          <div
            key={`s-${t}`}
            className="pointer-events-none absolute top-1/2 h-0.5 -translate-y-1/2 bg-gray-50/60"
            style={{
              left: at(times[i] ?? 0),
              width: `${pct(t) - pct(times[i] ?? 0)}%`,
            }}
            aria-hidden
          />
        ))}
      >
        {times.map((t, i) => (
          <div
            key={`k-${i.toString()}`}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-label={`${label} ${i + 1}`}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 1000) / 1000}
            aria-valuenow={Math.round(t * 1000) / 1000}
            aria-valuetext={`${formatTimecode(t)}${describe ? `, ${describe(i)}` : ""}`}
            aria-keyshortcuts="Delete"
            onPointerDown={drag(i)}
            onKeyDown={key(i)}
            className="group absolute inset-y-0 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center outline-none"
            style={{ left: at(t) }}
          >
            <span
              className={cn(
                "size-3.5 rotate-45 rounded-sm ring-1 group-focus-visible:stage-focus",
                i === current ? "bg-gray-50 ring-gray-900" : "bg-gray-900 ring-gray-50",
              )}
              style={nudge(t) ? { translate: `${nudge(t)}px 0` } : undefined}
            />
          </div>
        ))}
      </TimelineTrack>
    </div>
  );
}
