"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/cn";
import { formatTimecode } from "@/lib/format";
import { snapToFrame } from "@/tools/engines/frame-extract/math";
import { startDrag, TimelineTrack, useSeek, useTimeAt } from "./timeline-track";

/** Clip numbers are drawn on the strip up to this many clips. */
const MAX_LABELS = 16;

export interface TimelineClip {
  start: number;
  end: number;
  include: boolean;
}

/**
 * Timeline for cutting a long video into clips: the shared filmstrip track, one marker per boundary
 * between clips, skipped clips dimmed, and the proposed cut points (pauses, scene changes) as small
 * ticks. A marker is a slider: arrows move it one frame, Shift+arrows one second, Delete joins the
 * two clips; dragging snaps to frames and moves the preview with it. Clips longer than the length
 * cap are outlined so they can be found. Drawn in the light end of the gray ramp (the stage is dark).
 */
export function ClipsTimeline({
  file,
  video,
  duration,
  fps,
  clips,
  maxSec,
  ticks = [],
  onMove,
  onRemove,
  activeClip,
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  fps: number;
  clips: TimelineClip[];
  maxSec: number;
  /** Proposed cut points, for orientation. */
  ticks?: number[];
  onMove: (boundary: number, t: number) => void;
  onRemove: (boundary: number) => void;
  /** Clip being written while processing. */
  activeClip?: number;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const snap = useCallback((t: number) => snapToFrame(t, fps, duration), [fps, duration]);
  const seek = useSeek(video);
  const timeAt = useTimeAt(trackRef, duration, snap);
  const cuts = clips.slice(1).map((c) => c.start);

  const move = (i: number, t: number) => {
    const next = snap(t);
    const el = video.current;
    if (el && !el.paused) el.pause();
    onMove(i, next);
    seek(next);
  };

  const drag = (i: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    startDrag(e, (x) => move(i, timeAt(x)));
  };

  const key = (i: number) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const cur = cuts[i] ?? 0;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove(i);
      return;
    }
    const dir =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? -1
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? 1
          : 0;
    if (!dir) return;
    e.preventDefault();
    move(i, cur + dir * (e.shiftKey ? 1 : frame));
  };

  const pct = (t: number) => (duration > 0 ? Math.min(100, (t / duration) * 100) : 0);

  return (
    <div className="select-none">
      <div className="tabular flex justify-between text-fg-muted text-xs">
        <span>{formatTimecode(0)}</span>
        <span>{formatTimecode(duration)}</span>
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
            {clips.map((c, i) => {
              const marked = c.end - c.start > maxSec + 1e-3 || activeClip === i;
              return (
                <div
                  key={`c-${c.start}`}
                  className={cn(
                    "pointer-events-none absolute inset-y-0",
                    !c.include && "bg-gray-1000/70",
                  )}
                  style={{ left: `${pct(c.start)}%`, width: `${pct(c.end) - pct(c.start)}%` }}
                  aria-hidden
                >
                  {/* A bar along the top: the clip being written, or one over the length cap. */}
                  {marked && <div className="absolute inset-x-0 top-0 h-1 bg-gray-50" />}
                </div>
              );
            })}
            {ticks.map((t) => (
              <div
                key={`t-${t}`}
                className="pointer-events-none absolute bottom-0 h-1.5 w-px bg-gray-400"
                style={{ left: `${pct(t)}%` }}
                aria-hidden
              />
            ))}
            {clips.length <= MAX_LABELS &&
              clips.map((c, i) => (
                <span
                  key={`l-${c.start}`}
                  className={cn(
                    "tabular pointer-events-none absolute top-1 -translate-x-1/2 rounded-sm bg-overlay px-1 text-xs",
                    c.include ? "text-gray-50" : "text-gray-400 line-through",
                  )}
                  style={{ left: `${pct((c.start + c.end) / 2)}%` }}
                  aria-hidden
                >
                  {i + 1}
                </span>
              ))}
          </>
        }
      >
        {cuts.map((t, i) => (
          <div
            key={`m-${i.toString()}`}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-label={`Boundary ${i + 1}`}
            aria-valuemin={Math.round((clips[i]?.start ?? 0) * 1000) / 1000}
            aria-valuemax={Math.round((clips[i + 1]?.end ?? duration) * 1000) / 1000}
            aria-valuenow={Math.round(t * 1000) / 1000}
            aria-valuetext={`${formatTimecode(t)}, between clip ${i + 1} and clip ${i + 2}`}
            aria-keyshortcuts="Delete"
            onPointerDown={drag(i)}
            onKeyDown={key(i)}
            className="group absolute inset-y-0 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none justify-center outline-none"
            style={{ left: `${pct(t)}%` }}
          >
            <span className="my-auto flex h-10 w-3 items-center justify-center rounded-sm bg-gray-50 group-focus-visible:stage-focus">
              <span className="h-4 w-0.5 rounded-full bg-gray-900" />
            </span>
          </div>
        ))}
      </TimelineTrack>
    </div>
  );
}
