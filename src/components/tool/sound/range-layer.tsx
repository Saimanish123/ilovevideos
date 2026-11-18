"use client";

import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef } from "react";
import { formatTimecode } from "@/lib/format";
import { STAGE_FOCUS } from "../audio/audio-hero";

/** Shortest part that can be kept, seconds. */
const MIN_PART = 0.1;

/**
 * Keeps playback inside the chosen part: play starts at its start and stops at its end, back on the
 * start (the way the video trim timeline plays a selection).
 */
function useKeepInside(
  media: RefObject<HTMLMediaElement | null> | undefined,
  range: { start: number; end: number },
) {
  const r = useRef(range);
  r.current = range;
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let el: HTMLMediaElement | null = null;
    const loop = () => {
      if (!el || el.paused) return;
      if (el.currentTime >= r.current.end) {
        el.pause();
        el.currentTime = r.current.start;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      if (!el) return;
      if (el.currentTime < r.current.start - 0.01 || el.currentTime >= r.current.end - 0.01)
        el.currentTime = r.current.start;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const attach = () => {
      el = media?.current ?? null;
      if (!el) {
        if (tries++ < 120) raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("play", onPlay);
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("play", onPlay);
    };
  }, [media]);
}

/**
 * The part of an audio file to keep, on its waveform: the rest is dimmed, and a handle at each end
 * drags it (44px hit areas, `touch-none`). Keyboard on a handle: arrows ±0.1 s, Shift ±1 s, Home and
 * End. Playback stays inside the part. Without `onChange` it only shows the part.
 */
export function RangeLayer({
  range,
  duration,
  onChange,
  media,
  step = 0.01,
  minPart = MIN_PART,
}: {
  range: { start: number; end: number };
  duration: number;
  onChange?: (next: { start: number; end: number }) => void;
  media?: RefObject<HTMLMediaElement | null>;
  /** Positions are rounded to this (seconds); 0.1 where the page's fields show tenths. */
  step?: number;
  /** The shortest part: one handle stops this far from the other instead of pushing it. */
  minPart?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useKeepInside(media, range);
  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
  const set = (which: "start" | "end", t: number) => {
    if (!onChange) return;
    const r = Math.round(t / step) * step;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    if (which === "start")
      onChange({ start: round(Math.min(Math.max(0, r), range.end - minPart)), end: range.end });
    else
      onChange({
        start: range.start,
        end: round(Math.max(Math.min(duration, r), range.start + minPart)),
      });
  };
  const drag = (which: "start" | "end") => (e: PointerEvent<HTMLDivElement>) => {
    // The primary pointer and the main button only: a second finger or a right click does not drag.
    if (!onChange || !e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const at = (clientX: number) => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      set(which, ((clientX - rect.left) / rect.width) * duration);
    };
    const move = (ev: globalThis.PointerEvent) => at(ev.clientX);
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  const keys = (which: "start" | "end") => (e: KeyboardEvent<HTMLDivElement>) => {
    const v = range[which];
    const delta = e.shiftKey ? 1 : 0.1;
    let next: number | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = v + delta;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = v - delta;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = duration;
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    set(which, next);
  };
  const handle = (which: "start" | "end") => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={which === "start" ? "Start of the part to keep" : "End of the part to keep"}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 100) / 100}
      aria-valuenow={Math.round(range[which] * 100) / 100}
      aria-valuetext={formatTimecode(range[which])}
      onPointerDown={drag(which)}
      onKeyDown={keys(which)}
      className={`-translate-x-1/2 absolute inset-y-0 flex w-11 cursor-ew-resize touch-none justify-center ${STAGE_FOCUS}`}
      style={{ left: `${pct(range[which])}%` }}
    >
      <span className="h-full w-0.5 bg-gray-50" />
      <span className="-translate-y-1/2 absolute top-1/2 h-6 w-2 rounded-full bg-gray-50 ring-2 ring-gray-950" />
    </div>
  );
  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 bg-gray-950 opacity-70"
        style={{ width: `${pct(range.start)}%` }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 bg-gray-950 opacity-70"
        style={{ width: `${100 - pct(range.end)}%` }}
      />
      {onChange && (
        <div className="pointer-events-auto">
          {handle("start")}
          {handle("end")}
        </div>
      )}
    </div>
  );
}
