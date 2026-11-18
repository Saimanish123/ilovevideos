"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { formatTimecode } from "@/lib/format";
import { lastFrameTime, snapToFrame } from "@/tools/engines/frame-extract/math";
import { useFilmstrip } from "./use-filmstrip";

const SLOTS = 12;

/**
 * Filmstrip with one playhead for choosing a single moment. Dragging or tapping the strip moves the
 * playhead and seeks the preview 1:1 (no animation, design system §6.3), so the picture above is
 * always the frame that will be saved. The handle is a slider for keyboard users: arrows move one
 * frame, Shift+arrows one second, Home/End jump. A thin line follows the preview's own playback so
 * "Use current preview time" has something to point at. Snaps to frame boundaries.
 * Controls are drawn in the light end of the gray ramp because the strip is the always-dark stage.
 */
export function FrameScrubber({
  file,
  video,
  duration,
  fps,
  value,
  onChange,
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  fps: number;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<HTMLDivElement>(null);
  const frames = useFilmstrip(file, duration, SLOTS);
  const id = useId();
  const frameDur = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const last = lastFrameTime(duration, fps);
  const snap = useCallback((t: number) => snapToFrame(t, fps, duration), [fps, duration]);

  // Playback line: written straight to the element's transform on rAF while playing.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let raf = 0;
    const paint = () => {
      if (playbackRef.current && duration > 0) {
        playbackRef.current.style.transform = `translateX(${(el.currentTime / duration) * 100}%)`;
      }
    };
    const tick = () => {
      paint();
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("seeked", paint);
    el.addEventListener("pause", paint);
    paint();
    if (!el.paused) onPlay();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("seeked", paint);
      el.removeEventListener("pause", paint);
    };
  }, [video, duration]);

  const seek = useCallback(
    (t: number) => {
      const el = video.current;
      if (!el || !Number.isFinite(t)) return;
      if (!el.paused) el.pause();
      el.currentTime = t;
    },
    [video],
  );

  const set = useCallback(
    (t: number) => {
      const next = snap(t);
      onChange(next);
      seek(next);
    },
    [snap, onChange, seek],
  );

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return ((clientX - rect.left) / rect.width) * duration;
    },
    [duration],
  );

  const drag = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    set(timeAt(e.clientX));
    const move = (ev: PointerEvent) => set(timeAt(ev.clientX));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 1 : frameDur;
    let next: number | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "PageDown") next = value - 10;
    else if (e.key === "PageUp") next = value + 10;
    if (next === undefined) return;
    e.preventDefault();
    set(next);
  };

  const pct = duration > 0 ? (value / duration) * 100 : 0;

  return (
    <div className="select-none">
      <div className="tabular flex justify-between text-fg-muted text-xs">
        <span className="text-fg">Frame at {formatTimecode(value)}</span>
        <span>{formatTimecode(duration)}</span>
      </div>
      {/* Outer track is not clipped so the 44px handle keeps its full hit area at the edges. */}
      <div ref={trackRef} className="relative mt-2 h-16">
        <div
          className="absolute inset-0 cursor-pointer touch-none overflow-hidden rounded-md bg-bg-stage"
          onPointerDown={drag}
        >
          <div
            className="pointer-events-none absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}
            aria-hidden
          >
            {Array.from({ length: SLOTS }, (_, i) => {
              const src = frames[i];
              return src ? (
                <img
                  key={`f-${i.toString()}`}
                  src={src}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div key={`p-${i.toString()}`} className="h-full w-full border-gray-800 border-r" />
              );
            })}
          </div>
          <div
            ref={playbackRef}
            className="pointer-events-none absolute inset-0 will-change-transform"
            aria-hidden
          >
            <div className="h-full w-px bg-gray-400" />
          </div>
        </div>
        <div
          id={`${id}-time`}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-label="Frame time"
          aria-valuemin={0}
          aria-valuemax={Math.round(last * 1000) / 1000}
          aria-valuenow={Math.round(value * 1000) / 1000}
          aria-valuetext={formatTimecode(value)}
          onPointerDown={drag}
          onKeyDown={key}
          className="group absolute inset-y-0 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center outline-none"
          style={{ left: `${pct}%` }}
        >
          <span className="flex h-full w-3 items-center justify-center rounded-sm bg-gray-50 group-focus-visible:stage-focus">
            <span className="h-4 w-0.5 rounded-full bg-gray-900" />
          </span>
        </div>
      </div>
    </div>
  );
}
