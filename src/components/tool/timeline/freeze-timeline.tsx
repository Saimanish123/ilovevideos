"use client";

import { useCallback, useEffect, useRef } from "react";
import { formatTimecode, withUnit } from "@/lib/format";
import { snapToFrame } from "@/tools/engines/frame-extract/math";
import { startDrag, TimelineTrack, useSeek, useTimeAt } from "./timeline-track";

export interface TimelineHold {
  /** Frame time of the held frame (already on the frame grid). */
  at: number;
  seconds: number;
}

/**
 * Timeline for freeze frame: the shared filmstrip track with one marker per held frame. A marker is
 * a slider: arrows move it one frame, Shift+arrows one second, Delete removes the hold (not the
 * last one); dragging snaps to frames and moves the preview to the frame, so the picture above is
 * the frame that will be held. A marker cannot pass its neighbours, so keyboard focus stays on it.
 * Each marker carries its length; when the sound plays on (`over`), the stretch of picture the hold
 * covers is shaded, because those frames are replaced. Drawn in the light end of the gray ramp
 * because the strip is the always-dark stage.
 */
export function FreezeTimeline({
  file,
  video,
  duration,
  fps,
  holds,
  over,
  onChange,
  onRemove,
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  fps: number;
  holds: TimelineHold[];
  /** The hold covers the following picture (sound plays on) instead of pausing it. */
  over: boolean;
  onChange: (index: number, at: number) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const snap = useCallback((t: number) => snapToFrame(t, fps, duration), [fps, duration]);
  const seek = useSeek(video);
  const timeAt = useTimeAt(trackRef, duration, snap);

  // On arrival the preview shows the first held frame, so the picture above is what will be held.
  // The preview element can be replaced while the page settles, so each new element that is still
  // at its start gets the seek, for the first few seconds only (never after the user moved it).
  const first = holds[0]?.at;
  const firstRef = useRef(first);
  firstRef.current = first;
  useEffect(() => {
    const seeked = new WeakSet<HTMLVideoElement>();
    let id = 0;
    let tries = 0;
    const go = () => {
      const el = video.current;
      const at = firstRef.current;
      if (el && at !== undefined && !seeked.has(el) && el.readyState >= 1) {
        seeked.add(el);
        if (el.currentTime < 1e-3 && el.paused) el.currentTime = at;
      }
      if (tries++ < 180) id = requestAnimationFrame(go);
    };
    id = requestAnimationFrame(go);
    return () => cancelAnimationFrame(id);
  }, [video]);

  /** Where hold `i` may sit for a wanted time: on a frame, at least a frame from its neighbours. */
  const place = (i: number, t: number) => {
    const lo = i > 0 ? (holds[i - 1]?.at ?? 0) + frame : 0;
    const hi = i < holds.length - 1 ? (holds[i + 1]?.at ?? duration) - frame : duration;
    return snap(Math.min(hi, Math.max(lo, t)));
  };

  const move = (i: number, t: number) => {
    const next = place(i, t);
    if (next === holds[i]?.at) return;
    onChange(i, next);
    const el = video.current;
    if (el && !el.paused) el.pause();
    seek(next);
  };

  const drag = (i: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    // Compared with the last time sent during this drag, not the one captured at pointer-down.
    let last = holds[i]?.at;
    startDrag(e, (x) => {
      const next = place(i, timeAt(x));
      if (next === last) return;
      last = next;
      onChange(i, next);
      const el = video.current;
      if (el && !el.paused) el.pause();
      seek(next);
    });
  };

  const key = (i: number) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const cur = holds[i]?.at ?? 0;
    if (e.key === "Delete" || e.key === "Backspace") {
      // The last hold stays (the panel offers no remove for it either).
      if (holds.length <= 1) return;
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

  return (
    <div className="select-none">
      <div className="tabular flex justify-between text-fg-muted text-xs">
        <span>{formatTimecode(0)}</span>
        <span className="text-fg">
          {holds.length} {holds.length === 1 ? "hold" : "holds"}
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
            {over &&
              holds.map((h) => (
                <div
                  key={`b-${h.at}`}
                  className="pointer-events-none absolute inset-y-0 bg-overlay"
                  style={{
                    left: `${pct(h.at + frame)}%`,
                    width: `${Math.max(0, pct(h.at + frame + h.seconds) - pct(h.at + frame))}%`,
                  }}
                  aria-hidden
                />
              ))}
            {holds.map((h) => (
              <span
                key={`l-${h.at}`}
                className="tabular pointer-events-none absolute top-1 ml-2 rounded-sm bg-overlay px-1 text-gray-50 text-xs"
                style={{ left: `${pct(h.at)}%` }}
                aria-hidden
              >
                {withUnit(Number(h.seconds.toFixed(1)), "s")}
              </span>
            ))}
          </>
        }
      >
        {holds.map((h, i) => (
          <div
            key={`m-${i.toString()}`}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-label={`Hold ${i + 1}`}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 1000) / 1000}
            aria-valuenow={Math.round(h.at * 1000) / 1000}
            aria-valuetext={`Frame at ${formatTimecode(h.at)}, held ${withUnit(Number(h.seconds.toFixed(2)), "s")}`}
            aria-keyshortcuts="Delete"
            onPointerDown={drag(i)}
            onKeyDown={key(i)}
            className="group absolute inset-y-0 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none justify-center outline-none"
            style={{ left: `${pct(h.at)}%` }}
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
