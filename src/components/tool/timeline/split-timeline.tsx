"use client";

import { useCallback, useRef } from "react";
import { formatTimecode } from "@/lib/format";
import { nearestKeyframe } from "@/tools/engines/split/math";
import { startDrag, TimelineTrack, useSeek, useTimeAt } from "./timeline-track";

/** Most key frame ticks drawn; beyond this they merge into a gray bar and say nothing. */
const MAX_TICKS = 300;
/** Part numbers are drawn on the strip up to this many parts. */
const MAX_LABELS = 12;

/**
 * Timeline for cutting one video into parts: the shared filmstrip track with one marker per cut.
 * Markers are sliders: arrows move to the previous or next key frame (lossless) or frame (precise),
 * Shift+arrows about a second, Delete removes the cut. Dragging snaps the same way, so a marker
 * always sits where the file will actually be cut. Markers cannot pass their neighbours.
 */
export function SplitTimeline({
  file,
  video,
  duration,
  fps,
  points,
  keyframes,
  precise,
  onChange,
  onRemove,
  activePart,
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  fps: number;
  /** Cut points as they will be made (already snapped), ascending. */
  points: number[];
  /** Key frame times; lossless markers snap to these. */
  keyframes?: number[];
  precise: boolean;
  /** Called with the new cut list while a marker moves. */
  onChange: (next: number[]) => void;
  onRemove: (index: number) => void;
  /** Part being written while processing, highlighted on the strip. */
  activePart?: number;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const frameSnap = useCallback(
    (t: number) => Math.min(duration, Math.max(0, Math.round(t / frame) * frame)),
    [duration, frame],
  );
  const seek = useSeek(video);
  const timeAt = useTimeAt(trackRef, duration, frameSnap);
  const lossless = !precise && (keyframes?.length ?? 0) > 0;

  /** Where cut `i` may sit for a wanted time `t`, between its neighbours. Undefined: nowhere. */
  const place = (i: number, t: number): number | undefined => {
    const lo = (points[i - 1] ?? 0) + frame / 2;
    const hi = (points[i + 1] ?? duration) - frame / 2;
    if (!lossless) return Math.min(hi - frame / 2, Math.max(lo + frame / 2, frameSnap(t)));
    const inside = (keyframes ?? []).filter((k) => k > lo && k < hi);
    return nearestKeyframe(t, inside);
  };

  const move = (i: number, t: number | undefined) => {
    if (t === undefined || t === points[i]) return;
    const next = [...points];
    next[i] = t;
    onChange(next);
    seek(t);
  };

  const drag = (i: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    startDrag(e, (x) => move(i, place(i, timeAt(x))));
  };

  const key = (i: number) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const cur = points[i] ?? 0;
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
    if (!lossless) {
      move(i, place(i, cur + dir * (e.shiftKey ? 1 : frame)));
      return;
    }
    // Next key frame in that direction, at least a second away with Shift.
    const reach = cur + dir * (e.shiftKey ? 1 : frame / 2);
    const kf = keyframes ?? [];
    const target = dir > 0 ? kf.find((k) => k > reach) : [...kf].reverse().find((k) => k < reach);
    if (target !== undefined) move(i, place(i, target));
  };

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const edges = [0, ...points, duration];
  const ticks = lossless && (keyframes?.length ?? 0) <= MAX_TICKS ? (keyframes ?? []) : [];

  return (
    <div className="select-none">
      <div className="tabular flex justify-between text-fg-muted text-xs">
        <span>{formatTimecode(0)}</span>
        <span className="text-fg">
          {points.length + 1} {points.length === 0 ? "part" : "parts"}
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
        strip={
          <>
            {activePart !== undefined && (
              <div
                className="pointer-events-none absolute inset-y-0 border-gray-50 border-y-2"
                style={{
                  left: `${pct(edges[activePart] ?? 0)}%`,
                  width: `${pct((edges[activePart + 1] ?? duration) - (edges[activePart] ?? 0))}%`,
                }}
                aria-hidden
              />
            )}
            {points.map((t) => (
              <div
                key={`c-${t}`}
                className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-gray-50"
                style={{ left: `${pct(t)}%` }}
                aria-hidden
              />
            ))}
            {ticks.map((k) => (
              <div
                key={`k-${k}`}
                className="pointer-events-none absolute bottom-0 h-1.5 w-px bg-gray-400"
                style={{ left: `${pct(k)}%` }}
                aria-hidden
              />
            ))}
            {edges.length - 1 <= MAX_LABELS &&
              edges.slice(0, -1).map((start, i) => (
                <span
                  key={`l-${start}`}
                  className="tabular pointer-events-none absolute top-1 -translate-x-1/2 rounded-sm bg-overlay px-1 text-gray-50 text-xs"
                  style={{ left: `${pct((start + (edges[i + 1] ?? duration)) / 2)}%` }}
                  aria-hidden
                >
                  {i + 1}
                </span>
              ))}
          </>
        }
      >
        {points.map((t, i) => (
          <div
            key={`m-${i.toString()}`}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-label={`Cut ${i + 1}`}
            aria-valuemin={Math.round((points[i - 1] ?? 0) * 1000) / 1000}
            aria-valuemax={Math.round((points[i + 1] ?? duration) * 1000) / 1000}
            aria-valuenow={Math.round(t * 1000) / 1000}
            aria-valuetext={`${formatTimecode(t)}, between part ${i + 1} and part ${i + 2}`}
            aria-keyshortcuts="Delete"
            onPointerDown={drag(i)}
            onKeyDown={key(i)}
            className="group absolute inset-y-0 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none justify-center outline-none"
            style={{ left: `${pct(t)}%` }}
          >
            {/* The same 12px pill as the trim handles, so a cut reads on any picture. */}
            <span className="my-auto flex h-10 w-3 items-center justify-center rounded-sm bg-gray-50 group-focus-visible:stage-focus">
              <span className="h-4 w-0.5 rounded-full bg-gray-900" />
            </span>
          </div>
        ))}
      </TimelineTrack>
    </div>
  );
}
