"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDimensions } from "@/lib/format";
import {
  even,
  type Handle,
  handles,
  moveRect,
  type Rect,
  resizeRect,
  type Size,
  scaleRect,
} from "@/tools/engines/crop/math";

/** Dark keyline around the white handle marks so they read on bright footage (design review 2026-09-30). */
const keyline = { filter: "drop-shadow(0 0 1px var(--color-gray-1000))" } as const;

import { useContentRect } from "./use-content-rect";

const cursor: Record<Handle, string> = {
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
};
/** Handle centre as a fraction of the frame. */
const at: Record<Handle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};
/** Corner marks: which two sides of the 16px square carry the stroke, drawn inward from the corner. */
const cornerMark: Partial<Record<Handle, string>> = {
  nw: "left-1/2 top-1/2 border-t-2 border-l-2",
  ne: "right-1/2 top-1/2 border-t-2 border-r-2",
  se: "right-1/2 bottom-1/2 border-r-2 border-b-2",
  sw: "left-1/2 bottom-1/2 border-b-2 border-l-2",
};
/** Below this on-screen size an axis hides its edge handles, so the 44px corners and the body stay reachable. */
const EDGE_HANDLE_MIN = 132;

/**
 * The crop frame drawn over the preview (tool-page spec §0: geometry gets a visual frame). The frame
 * follows the pointer 1:1 in source pixels (no easing, design system §6.3); corners and edges resize,
 * the body moves. Each handle has a 44px hit area, larger than its mark. Keyboard: the frame is one
 * tab stop; arrows move it, Shift moves further, + and − grow and shrink it around its centre.
 * `mode="move"` locks the size (aspect-ratio fill: the window is always the largest of its shape).
 * Drawn in the light end of the gray ramp because the stage is always dark.
 */
export function CropFrame({
  source,
  rect,
  onChange,
  ratio,
  mode = "resize",
  disabled = false,
  label,
}: {
  source: Size;
  rect: Rect;
  onChange: (next: Rect) => void;
  ratio: number | null;
  mode?: "resize" | "move";
  disabled?: boolean;
  label: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const box = useContentRect(layerRef, source);
  const [active, setActive] = useState(false);
  const descId = useId();

  const drag = (e: React.PointerEvent, handle: Handle | "move") => {
    if (disabled || !box) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    (target.closest("[data-crop-frame]") as HTMLElement | null)?.focus({ preventScroll: true });
    const start = rect;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const k = box.scale;
    setActive(true);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / k;
      const dy = (ev.clientY - y0) / k;
      onChange(
        handle === "move"
          ? moveRect(start, dx, dy, source)
          : resizeRect(start, handle, dx, dy, source, ratio),
      );
    };
    const up = () => {
      setActive(false);
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
    const step =
      even(Math.max(2, Math.min(source.width, source.height) / 100)) * (e.shiftKey ? 10 : 1);
    let next: Rect | undefined;
    if (e.key === "ArrowLeft") next = moveRect(rect, -step, 0, source);
    else if (e.key === "ArrowRight") next = moveRect(rect, step, 0, source);
    else if (e.key === "ArrowUp") next = moveRect(rect, 0, -step, source);
    else if (e.key === "ArrowDown") next = moveRect(rect, 0, step, source);
    else if (mode === "resize" && (e.key === "+" || e.key === "="))
      next = scaleRect(rect, 1.05, source, ratio);
    else if (mode === "resize" && (e.key === "-" || e.key === "_"))
      next = scaleRect(rect, 1 / 1.05, source, ratio);
    if (!next) return;
    e.preventDefault();
    onChange(next);
  };

  const k = box?.scale ?? 0;
  const fx = rect.x * k;
  const fy = rect.y * k;
  const fw = rect.width * k;
  const fh = rect.height * k;
  const showEdgeX = fw >= EDGE_HANDLE_MIN;
  const showEdgeY = fh >= EDGE_HANDLE_MIN;

  return (
    <div ref={layerRef} className="absolute inset-0">
      {box && (
        <div
          className={cn("absolute", disabled && "opacity-60")}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        >
          {/* Dimmed picture outside the frame: four bands so the frame itself stays clear. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
          >
            <div className="absolute inset-x-0 top-0 bg-gray-1000/60" style={{ height: fy }} />
            <div
              className="absolute inset-x-0 bottom-0 bg-gray-1000/60"
              style={{ height: Math.max(0, box.height - fy - fh) }}
            />
            <div
              className="absolute left-0 bg-gray-1000/60"
              style={{ top: fy, height: fh, width: fx }}
            />
            <div
              className="absolute right-0 bg-gray-1000/60"
              style={{ top: fy, height: fh, width: Math.max(0, box.width - fx - fw) }}
            />
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: a focusable drag surface, not a group of form controls; a fieldset cannot take focus or be positioned as the frame */}
          <div
            data-crop-frame
            role="group"
            aria-roledescription="crop frame"
            aria-label={`${label}: ${formatDimensions(rect.width, rect.height)} at ${rect.x}, ${rect.y}`}
            aria-describedby={descId}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onPointerDown={(e) => drag(e, "move")}
            onKeyDown={key}
            className={cn(
              "absolute touch-none border border-gray-0 outline-none ring-1 ring-gray-1000/60 focus-visible:stage-focus",
              disabled ? "pointer-events-none" : "cursor-move",
            )}
            style={{ left: fx, top: fy, width: fw, height: fh }}
          >
            <span id={descId} className="sr-only">
              {mode === "resize"
                ? "Drag inside to move, drag an edge or corner to resize. Arrow keys move the frame, Shift moves further, plus and minus change its size."
                : "Drag to choose which part of the picture stays. Arrow keys move the window, Shift moves further."}
            </span>
            {active && (
              // Rule-of-thirds guides while dragging only.
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-gray-0/40" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-gray-0/40" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-gray-0/40" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-gray-0/40" />
              </div>
            )}
            {mode === "resize" &&
              handles.map((h) => {
                const isEdge = h.length === 1;
                if (isEdge && (h === "n" || h === "s") && !showEdgeX) return null;
                if (isEdge && (h === "e" || h === "w") && !showEdgeY) return null;
                const [px, py] = at[h];
                return (
                  <div
                    key={h}
                    aria-hidden
                    data-handle={h}
                    onPointerDown={(e) => drag(e, h)}
                    className={cn(
                      "-translate-x-1/2 -translate-y-1/2 absolute size-11 touch-none",
                      cursor[h],
                    )}
                    style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
                  >
                    {isEdge ? (
                      <span
                        className={cn(
                          "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 rounded-full bg-gray-0",
                          h === "n" || h === "s" ? "h-1 w-6" : "h-6 w-1",
                        )}
                        style={keyline}
                      />
                    ) : (
                      <span
                        className={cn("absolute size-4 border-gray-0", cornerMark[h])}
                        style={keyline}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
