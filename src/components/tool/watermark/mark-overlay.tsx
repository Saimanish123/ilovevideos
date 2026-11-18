"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDimensions } from "@/lib/format";
import {
  effectiveRange,
  markRect,
  type Rect,
  type Size,
  showsAt,
  toFractions,
  type WatermarkOptions,
} from "@/tools/engines/watermark/options";
import { useContentRect } from "../crop/use-content-rect";

type O = WatermarkOptions;

/** Smallest and largest mark width as a share of the picture. */
const MIN_SIZE = 0.03;
const MAX_SIZE = 0.9;

/**
 * The watermark drawn over the preview, where it will be in the output (ADR-0011: geometry gets a
 * visual control). Drag the mark to place it anywhere; drag the corner handle, which sits on the
 * corner facing the middle of the picture so it never lands on the frame's edge, to resize it with
 * its shape kept. Keyboard: the mark is one tab stop; arrows move it, Shift moves further, + and −
 * resize. Outside the chosen time range the mark is shown faint with a dashed outline.
 * Drawn with the light end of the gray ramp and a dark keyline so it reads on any footage.
 */
export function MarkOverlay({
  value,
  onChange,
  source,
  duration,
  video,
  disabled,
  name = "watermark",
}: {
  value: O;
  onChange: (next: O) => void;
  source: Size;
  duration: number;
  video: React.RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
  /** What the mark is called in its accessible name and description (text overlay: "text"). */
  name?: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const box = useContentRect(layerRef, source);
  const descId = useId();
  const rect = markRect(value, source);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!value.mark) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(value.mark);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value.mark]);

  // Whether the mark shows at the preview's current moment (time range).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const on = () => setNow(el.currentTime);
    el.addEventListener("timeupdate", on);
    el.addEventListener("seeked", on);
    return () => {
      el.removeEventListener("timeupdate", on);
      el.removeEventListener("seeked", on);
    };
  }, [video]);
  const visible = showsAt(effectiveRange(value, duration), now);

  const place = (r: Rect, sizeShare = value.size): O => ({
    ...value,
    size: sizeShare,
    anchor: "custom",
    ...toFractions(r, source),
  });

  // The resize handle sits on the corner nearest the picture's centre.
  const right = rect.x + rect.width / 2 < source.width / 2;
  const bottom = rect.y + rect.height / 2 < source.height / 2;

  // One pointer at a time: a second finger during a drag is ignored.
  const active = useRef<number | null>(null);

  /** Listens to one pointer on `target` until it lifts; returns nothing, cleans up after itself. */
  const track = (
    e: React.PointerEvent,
    onMove: (ev: PointerEvent) => void,
    onUp: (cancelled: boolean) => void,
  ) => {
    const target = e.currentTarget as HTMLElement;
    const id = e.pointerId;
    active.current = id;
    target.setPointerCapture(id);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === id) onMove(ev);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      active.current = null;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      onUp(ev.type === "pointercancel");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  // Moving writes a transform straight to the element (no React render per pointer event) and
  // commits the position once, when the pointer lifts.
  const startMove = (e: React.PointerEvent) => {
    if (disabled || !box || active.current !== null) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.focus({ preventScroll: true });
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = rect;
    const freeX = source.width - start.width;
    const freeY = source.height - start.height;
    let last = start;
    track(
      e,
      (ev) => {
        const x = Math.round(Math.min(freeX, Math.max(0, start.x + (ev.clientX - x0) / box.scale)));
        const y = Math.round(Math.min(freeY, Math.max(0, start.y + (ev.clientY - y0) / box.scale)));
        last = { ...start, x, y };
        el.style.transform = `translate(${(x - start.x) * box.scale}px, ${(y - start.y) * box.scale}px)`;
      },
      (cancelled) => {
        el.style.transform = "";
        if (!cancelled && (last.x !== start.x || last.y !== start.y)) onChange(place(last));
      },
    );
  };

  // Resizing changes the mark's size, so it re-renders, at most once per frame.
  const startResize = (e: React.PointerEvent) => {
    if (disabled || !box || active.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const start = rect;
    // The opposite corner stays put.
    const fixedX = right ? start.x : start.x + start.width;
    const fixedY = bottom ? start.y : start.y + start.height;
    let frame = 0;
    let pending: O | undefined;
    const flush = () => {
      frame = 0;
      if (pending) onChange(pending);
      pending = undefined;
    };
    track(
      e,
      (ev) => {
        const dx = ((ev.clientX - x0) / box.scale) * (right ? 1 : -1);
        const share = Math.min(MAX_SIZE, Math.max(MIN_SIZE, (start.width + dx) / source.width));
        const next = markRect({ ...value, size: share, anchor: "tl", margin: 0 }, source);
        const x = right ? fixedX : fixedX - next.width;
        const y = bottom ? fixedY : fixedY - next.height;
        pending = place({ ...next, x, y }, share);
        frame ||= requestAnimationFrame(flush);
      },
      () => {
        cancelAnimationFrame(frame);
        flush();
      },
    );
  };

  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step =
      Math.max(2, Math.round(Math.min(source.width, source.height) / 100)) * (e.shiftKey ? 10 : 1);
    let next: O | undefined;
    if (e.key === "ArrowLeft") next = place({ ...rect, x: rect.x - step });
    else if (e.key === "ArrowRight") next = place({ ...rect, x: rect.x + step });
    else if (e.key === "ArrowUp") next = place({ ...rect, y: rect.y - step });
    else if (e.key === "ArrowDown") next = place({ ...rect, y: rect.y + step });
    else if (e.key === "+" || e.key === "=")
      next = { ...value, size: Math.min(MAX_SIZE, value.size * 1.1) };
    else if (e.key === "-" || e.key === "_")
      next = { ...value, size: Math.max(MIN_SIZE, value.size / 1.1) };
    if (!next) return;
    e.preventDefault();
    onChange(next);
  };

  const k = box?.scale ?? 0;
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {box && (
        <div
          className="absolute"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: a focusable drag surface over the picture, not a form group */}
          <div
            role="group"
            aria-roledescription={name}
            aria-label={`${name[0]?.toUpperCase()}${name.slice(1)}: ${formatDimensions(rect.width, rect.height)} at ${rect.x}, ${rect.y}${visible ? "" : ", not shown at this moment"}`}
            aria-describedby={descId}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onPointerDown={startMove}
            onKeyDown={key}
            className={cn(
              "pointer-events-auto absolute touch-none outline-none focus-visible:stage-focus",
              disabled ? "pointer-events-none opacity-60" : "cursor-move",
              !value.mark && "border border-gray-0 border-dashed bg-gray-1000/40",
              !visible && "outline-1 outline-gray-0 outline-dashed",
            )}
            style={{
              left: rect.x * k,
              top: rect.y * k,
              width: rect.width * k,
              height: rect.height * k,
            }}
          >
            {/* A 44px minimum target around a mark that is small on a phone screen. */}
            <span
              aria-hidden
              className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-full min-h-11 w-full min-w-11"
            />
            <span id={descId} className="sr-only">
              Drag to place the {name}, or drag its corner handle to resize it. Arrow keys move it,
              Shift moves further, plus and minus change its size.
            </span>
            {url ? (
              <img
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none h-full w-full select-none"
                style={{ opacity: visible ? value.opacity : value.opacity * 0.35 }}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-gray-0 text-xs">
                {value.kind === "text" ? "Text" : "Logo"}
              </span>
            )}
            {/* The handle's 44px target lies outside the mark, off the corner that faces the centre. */}
            <div
              aria-hidden
              data-handle="resize"
              onPointerDown={startResize}
              className={cn(
                "absolute size-11 touch-none",
                right === bottom ? "cursor-nwse-resize" : "cursor-nesw-resize",
              )}
              style={{
                ...(right ? { left: "100%" } : { right: "100%" }),
                ...(bottom ? { top: "100%" } : { bottom: "100%" }),
              }}
            >
              <span
                className="absolute size-3 rounded-sm border border-gray-1000 bg-gray-0"
                style={{
                  ...(right ? { left: 2 } : { right: 2 }),
                  ...(bottom ? { top: 2 } : { bottom: 2 }),
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
