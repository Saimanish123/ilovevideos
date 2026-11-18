"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useFilmstrip } from "./use-filmstrip";

/** Filmstrip slots across the track. */
export const SLOTS = 12;

/**
 * The shared timeline surface used by `TrimTimeline` (one range) and `SplitTimeline` (many cut
 * markers): filmstrip of frames on the always-dark stage, a playhead that follows the preview, tap to
 * scrub. Handles and markers are passed as children and sit outside the clipped strip so their 44px
 * hit areas survive at the edges. Pointer tracking is 1:1, no animation (design system §6.3).
 */
export function TimelineTrack({
  file,
  video,
  duration,
  disabled,
  trackRef,
  loop,
  repeat = false,
  timeAt,
  strip,
  children,
}: {
  file: File;
  video: RefObject<HTMLVideoElement | null>;
  duration: number;
  disabled: boolean;
  trackRef: RefObject<HTMLDivElement | null>;
  /** Keep playback inside this range (trim); omit to play freely (split). */
  loop?: { start: number; end: number };
  /**
   * At the end of `loop`, jump back to its start and keep playing (the selection plays on repeat, as
   * a GIF does). Off: pause at the end, back on the start.
   */
  repeat?: boolean;
  timeAt: (clientX: number) => number;
  /** Layers drawn inside the clipped strip, above the frames (dimming, selection, ticks). */
  strip?: React.ReactNode;
  /** Handles and markers, positioned absolutely against the track. */
  children?: React.ReactNode;
}) {
  const playheadRef = useRef<HTMLDivElement>(null);
  const frames = useFilmstrip(file, duration, SLOTS);
  const loopStart = loop?.start;
  const loopEnd = loop?.end;

  // Playhead: written straight to the element's transform on rAF while playing (no React re-render),
  // plus on seeks. With a loop range, playback stays inside it.
  // The preview element may attach after this track mounts (panels load lazily, ADR-0030), so wait
  // for it rather than giving up on the first render.
  const [attached, setAttached] = useState(false);
  useEffect(() => {
    if (video.current) {
      setAttached(true);
      return;
    }
    let id = 0;
    let tries = 0;
    const wait = () => {
      if (video.current) setAttached(true);
      else if (tries++ < 240) id = requestAnimationFrame(wait);
    };
    id = requestAnimationFrame(wait);
    return () => cancelAnimationFrame(id);
  }, [video]);

  useEffect(() => {
    const el = attached ? video.current : null;
    if (!el) return;
    let raf = 0;
    const paint = () => {
      if (playheadRef.current && duration > 0) {
        playheadRef.current.style.transform = `translateX(${(el.currentTime / duration) * 100}%)`;
      }
    };
    const tick = () => {
      paint();
      if (loopEnd !== undefined && loopStart !== undefined && el.currentTime >= loopEnd) {
        if (!repeat) el.pause();
        el.currentTime = loopStart;
      }
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    // A range that runs to the end of the video ends playback before the tick can wrap it.
    const onEnded = () => {
      if (!repeat || loopStart === undefined) return;
      el.currentTime = loopStart;
      void el.play().catch(() => undefined);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("seeked", paint);
    el.addEventListener("pause", paint);
    el.addEventListener("ended", onEnded);
    paint();
    if (!el.paused) onPlay();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("seeked", paint);
      el.removeEventListener("pause", paint);
      el.removeEventListener("ended", onEnded);
    };
  }, [video, attached, loopStart, loopEnd, duration, repeat]);

  const seek = useSeek(video);

  return (
    <div ref={trackRef} className="relative mt-2 h-16">
      <div
        className="absolute inset-0 overflow-hidden rounded-md bg-bg-stage"
        onPointerDown={(e) => {
          // Tap on the track scrubs the preview. Filmstrip and dim layers are pointer-events-none.
          if (!disabled && e.target === e.currentTarget) seek(timeAt(e.clientX));
        }}
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
        {strip}
        <div
          ref={playheadRef}
          className="pointer-events-none absolute inset-0 will-change-transform"
          aria-hidden
        >
          <div className="h-full w-px bg-gray-50" />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Seeks the preview, ignoring non-finite times. */
export function useSeek(video: RefObject<HTMLVideoElement | null>) {
  return useCallback(
    (t: number) => {
      const el = video.current;
      if (el && Number.isFinite(t)) el.currentTime = t;
    },
    [video],
  );
}

/** Maps a pointer x to a time on the track, through the caller's snap. */
export function useTimeAt(
  trackRef: RefObject<HTMLDivElement | null>,
  duration: number,
  snap: (t: number) => number,
) {
  return useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return snap(((clientX - rect.left) / rect.width) * duration);
    },
    [trackRef, duration, snap],
  );
}

/**
 * Starts a captured pointer drag on the element: `move` gets each pointer x until release.
 * Shared by trim handles and split markers.
 */
export function startDrag(e: React.PointerEvent, move: (clientX: number) => void) {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => move(ev.clientX);
  const up = () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}
