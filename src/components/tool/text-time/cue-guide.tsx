"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { useContentRect } from "../crop/use-content-rect";

/**
 * Where burned-in subtitles sit, as a band across the picture that drags up and down (geometry on
 * the picture, ADR-0011): its bottom edge is the bottom of the lowest line, as a share of the
 * picture's height. A vertical slider for the keyboard whose value is the height above the bottom:
 * Up raises it 1% (Shift 5%), Page Up and Page Down 10%, Home and End go to the bottom and the top. Pointer moves are 1:1, at most once per frame. The band takes touches
 * (`touch-none`); the rest of the picture stays free for the preview's gestures. Drawn with the
 * light end of the gray ramp and a dark keyline so it reads on any footage.
 */
export function CueGuide({
  source,
  position,
  min,
  bandHeight,
  bandWidth,
  onChange,
  disabled,
}: {
  source: { width: number; height: number };
  /** Bottom edge, share of the height. */
  position: number;
  /** Highest the bottom edge may go (a share): the band must fit above it. */
  min: number;
  /** Band size in picture pixels: two lines of text, and the wrap width. */
  bandHeight: number;
  bandWidth: number;
  onChange: (position: number) => void;
  disabled?: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const box = useContentRect(layerRef, source);
  const clamp = (p: number) => Math.min(1, Math.max(min, Math.round(p * 1000) / 1000));
  const k = box?.scale ?? 0;
  const bottom = position * source.height;

  const startDrag = (e: React.PointerEvent) => {
    if (disabled || !box) return;
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.focus({ preventScroll: true });
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const p0 = position;
    let frame = 0;
    let last = p0;
    const move = (ev: PointerEvent) => {
      last = clamp(p0 + (ev.clientY - y0) / box.scale / source.height);
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        onChange(last);
      });
    };
    const up = () => {
      cancelAnimationFrame(frame);
      onChange(last);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    // The slider's value is the height above the bottom: Up raises the text.
    const step = e.shiftKey ? 0.05 : 0.01;
    let next: number | undefined;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = position - step;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = position + step;
    else if (e.key === "PageUp") next = position - 0.1;
    else if (e.key === "PageDown") next = position + 0.1;
    else if (e.key === "Home") next = 1;
    else if (e.key === "End") next = min;
    if (next === undefined) return;
    e.preventDefault();
    onChange(clamp(next));
  };

  const pct = Math.round((1 - position) * 100);
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {box && (
        <div
          className="absolute"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        >
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Subtitle position"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={Math.round((1 - min) * 100)}
            aria-valuenow={pct}
            aria-valuetext={`Bottom of the text ${pct}% above the bottom of the picture`}
            aria-disabled={disabled || undefined}
            onPointerDown={startDrag}
            onKeyDown={key}
            className={cn(
              "absolute touch-none outline-none focus-visible:stage-focus",
              disabled ? "pointer-events-none" : "pointer-events-auto cursor-ns-resize",
            )}
            style={{
              left: ((source.width - bandWidth) / 2) * k,
              width: bandWidth * k,
              // At least 44px tall on a small screen, grown upwards so the bottom edge stays true.
              top: bottom * k - Math.max(44, bandHeight * k),
              height: Math.max(44, bandHeight * k),
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 border border-gray-0 outline outline-1 outline-gray-1000/70"
            />
            <span
              aria-hidden
              className="-translate-x-1/2 absolute top-0 left-1/2 mt-1 h-1 w-8 rounded-full bg-gray-0 outline outline-1 outline-gray-1000/70"
            />
          </div>
        </div>
      )}
    </div>
  );
}
