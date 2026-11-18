"use client";

import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { withUnit } from "@/lib/format";
import { type FadeSpec, fadeGain, fitFades } from "@/tools/engines/sound/dsp/fade";
import { STAGE_FOCUS } from "../audio/audio-hero";

const POINTS = 120;

/** Seconds with one decimal and a non-breaking space: "2.5 s". */
const secs = (s: number) => withUnit((Math.round(s * 10) / 10).toFixed(1), "s");

/**
 * The fade envelope drawn over a waveform on the dark stage: the part of the sound each fade turns
 * down is shaded above its curve, and each fade has a handle to drag its length (44px wide hit
 * area, `touch-none` so it does not fight scrolling). Keyboard: arrows ±0.1 s, Shift ±1 s, Home and
 * End. Without `onChange` (processing, done, a result) it is a picture of the fades only.
 */
export function FadeLayer({
  fades,
  duration,
  onChange,
  maxFade,
}: {
  fades: FadeSpec;
  duration: number;
  onChange?: (next: FadeSpec) => void;
  maxFade: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const f = fitFades(fades, duration);
  const x = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  // Envelope as a path in a 100 × 100 box: y = 0 is full level, y = 100 silence.
  const pts = Array.from({ length: POINTS + 1 }, (_, i) => {
    const t = (i / POINTS) * duration;
    return `${x(t).toFixed(3)},${((1 - fadeGain(t, duration, f)) * 100).toFixed(3)}`;
  });
  const curve = `M${pts.join(" L")}`;
  const shade = `M0,0 L${pts.join(" L")} L100,0 Z`;

  const set = (which: "fadeIn" | "fadeOut", seconds: number) => {
    if (!onChange) return;
    const other = which === "fadeIn" ? fades.fadeOut : fades.fadeIn;
    const room = Math.max(0, Math.min(maxFade, duration - other));
    const v = Math.round(Math.min(room, Math.max(0, seconds)) * 10) / 10;
    onChange({ ...fades, [which]: v });
  };
  const drag = (which: "fadeIn" | "fadeOut") => (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const at = (clientX: number) => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const t = ((clientX - rect.left) / rect.width) * duration;
      set(which, which === "fadeIn" ? t : duration - t);
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
  const keys = (which: "fadeIn" | "fadeOut") => (e: KeyboardEvent<HTMLDivElement>) => {
    const v = fades[which];
    const step = e.shiftKey ? 1 : 0.1;
    // The fade-out handle sits at the end, so pointing right shortens it.
    const dir = which === "fadeIn" ? 1 : -1;
    let next: number | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowUp")
      next = v + (e.key === "ArrowUp" ? step : step * dir);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
      next = v - (e.key === "ArrowDown" ? step : step * dir);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = maxFade;
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    set(which, next);
  };

  const handle = (which: "fadeIn" | "fadeOut") => {
    const value = f[which];
    const pos = which === "fadeIn" ? x(value) : 100 - x(value);
    const label = which === "fadeIn" ? "Fade-in length" : "Fade-out length";
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(Math.min(maxFade, duration) * 10) / 10}
        aria-valuenow={Math.round(value * 10) / 10}
        aria-valuetext={value > 0 ? secs(value) : "Off"}
        onPointerDown={drag(which)}
        onKeyDown={keys(which)}
        className={`-translate-x-1/2 absolute inset-y-0 flex w-11 cursor-ew-resize touch-none justify-center ${STAGE_FOCUS}`}
        style={{ left: `${pos}%` }}
      >
        <span className="h-full w-0.5 bg-gray-50" />
        <span className="-translate-y-1/2 absolute top-1/2 size-3 rounded-full bg-gray-50 ring-2 ring-gray-950" />
      </div>
    );
  };

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <path d={shade} className="fill-gray-950 opacity-70" />
        <path
          d={curve}
          className="fill-none stroke-gray-50"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {onChange && (
        <div className="pointer-events-auto">
          {handle("fadeIn")}
          {handle("fadeOut")}
        </div>
      )}
    </div>
  );
}
