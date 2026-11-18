"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDimensions } from "@/lib/format";
import { useContentRect } from "../crop/use-content-rect";

export interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One box on the picture: a blur region or an image layer, in picture pixels (unrotated). */
export interface EditorBox {
  id: number;
  rect: BoxRect;
  shape?: "rect" | "ellipse";
  /** Degrees, clockwise, about the box's centre. */
  rotation?: number;
  /** Accessible name, e.g. "Region 2". */
  label: string;
  /** Not on screen at this moment (outside its time range): drawn faint. */
  hidden?: boolean;
  /** A picture drawn inside the box (an image layer), at `opacity`. */
  src?: string;
  opacity?: number;
}

export interface BoxChange {
  rect: BoxRect;
  rotation?: number;
}

/** Smallest box edge a pointer can make, in picture pixels. */
const MIN_PX = 8;
type Corner = "nw" | "ne" | "sw" | "se";
const corners: Corner[] = ["nw", "ne", "sw", "se"];

/**
 * Each corner handle's 44px target is centred 8px outside its corner (so even a tiny box keeps its
 * middle free to drag) and its visible square is moved back onto the corner.
 */
const handleBox: Record<Corner, string> = {
  se: "left-full top-full -translate-x-1/2 -translate-y-1/2 ml-2 mt-2",
  sw: "right-full top-full translate-x-1/2 -translate-y-1/2 mr-2 mt-2",
  ne: "left-full bottom-full -translate-x-1/2 translate-y-1/2 ml-2 mb-2",
  nw: "right-full bottom-full translate-x-1/2 translate-y-1/2 mr-2 mb-2",
};
const handleDot: Record<Corner, string> = {
  se: "-translate-x-2 -translate-y-2",
  sw: "translate-x-2 -translate-y-2",
  ne: "-translate-x-2 translate-y-2",
  nw: "translate-x-2 translate-y-2",
};

/**
 * Boxes over the preview picture, where they will be in the output (geometry gets a visual control,
 * ADR-0011). Drag a box to move it; drag a corner handle to resize it (free, or about its centre
 * with its shape kept); drag the round handle above it to turn it. With `onDraw`, dragging on an
 * empty part of the picture draws a new box; a tap there clears the selection.
 *
 * Keyboard: each box is one tab stop and focusing it selects it. Arrows move it (Shift moves ten
 * times further), + and − resize it, [ and ] turn it (rotatable boxes), Delete or Backspace removes
 * it. Pointer moves are 1:1 and reported at most once per animation frame. The picture is a drawing
 * surface, so it takes touches (`touch-none`); the page scrolls from anywhere else.
 * Drawn with the light end of the gray ramp and a dark keyline, so boxes read on any footage.
 */
export function BoxEditor({
  boxes,
  selected,
  source,
  onSelect,
  onChange,
  onDraw,
  onDelete,
  disabled,
  resize = "free",
  rotatable = false,
  noun,
  help,
}: {
  boxes: EditorBox[];
  selected?: number;
  source: { width: number; height: number };
  onSelect: (id: number | undefined) => void;
  onChange: (id: number, next: BoxChange) => void;
  /** Draw a new box by dragging on the picture. */
  onDraw?: (rect: BoxRect) => void;
  onDelete?: (id: number) => void;
  disabled?: boolean;
  resize?: "free" | "aspect";
  rotatable?: boolean;
  /** What a box is called ("region", "image"), for the description. */
  noun: string;
  /** One sentence for screen readers on how to work a box. */
  help: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const box = useContentRect(layerRef, source);
  const descId = useId();
  const active = useRef<number | null>(null);
  const [ghost, setGhost] = useState<BoxRect>();

  /** A pointer position in picture pixels. */
  const toPicture = (clientX: number, clientY: number) => {
    const r = layerRef.current?.getBoundingClientRect();
    if (!r || !box) return { x: 0, y: 0 };
    return {
      x: (clientX - r.left - box.left) / box.scale,
      y: (clientY - r.top - box.top) / box.scale,
    };
  };

  /** Follows one pointer on `target` until it lifts; moves are batched to one per animation frame. */
  const track = (
    e: React.PointerEvent,
    onMove: (p: { x: number; y: number }, ev: PointerEvent) => void,
    onUp: (cancelled: boolean) => void,
  ) => {
    const target = e.currentTarget as HTMLElement;
    const id = e.pointerId;
    active.current = id;
    target.setPointerCapture(id);
    let frame = 0;
    let last: PointerEvent | undefined;
    const flush = () => {
      frame = 0;
      if (last) onMove(toPicture(last.clientX, last.clientY), last);
      last = undefined;
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      last = ev;
      frame ||= requestAnimationFrame(flush);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      active.current = null;
      cancelAnimationFrame(frame);
      flush();
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      onUp(ev.type === "pointercancel");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const clampCentre = (r: BoxRect): BoxRect => {
    const cx = Math.min(source.width, Math.max(0, r.x + r.width / 2));
    const cy = Math.min(source.height, Math.max(0, r.y + r.height / 2));
    return { ...r, x: cx - r.width / 2, y: cy - r.height / 2 };
  };

  const startMove = (b: EditorBox) => (e: React.PointerEvent) => {
    if (disabled || !box || active.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    onSelect(b.id);
    const p0 = toPicture(e.clientX, e.clientY);
    const start = b.rect;
    track(
      e,
      (p) => {
        const next = clampCentre({ ...start, x: start.x + p.x - p0.x, y: start.y + p.y - p0.y });
        onChange(b.id, { rect: next, rotation: b.rotation });
      },
      () => undefined,
    );
  };

  const startResize = (b: EditorBox, corner: Corner) => (e: React.PointerEvent) => {
    if (disabled || !box || active.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    const start = b.rect;
    const cx = start.x + start.width / 2;
    const cy = start.y + start.height / 2;
    const p0 = toPicture(e.clientX, e.clientY);
    const d0 = Math.max(1, Math.hypot(p0.x - cx, p0.y - cy));
    // The corner opposite the handle stays put (free resize).
    const fx = corner.includes("w") ? start.x + start.width : start.x;
    const fy = corner.includes("n") ? start.y + start.height : start.y;
    track(
      e,
      (p) => {
        let rect: BoxRect;
        if (resize === "aspect") {
          const k = Math.hypot(p.x - cx, p.y - cy) / d0;
          const min = MIN_PX / Math.min(start.width, start.height);
          const s = Math.max(min, k);
          const width = start.width * s;
          const height = start.height * s;
          rect = { x: cx - width / 2, y: cy - height / 2, width, height };
        } else {
          const x0 = Math.min(fx, p.x);
          const y0 = Math.min(fy, p.y);
          const width = Math.max(MIN_PX, Math.abs(p.x - fx));
          const height = Math.max(MIN_PX, Math.abs(p.y - fy));
          rect = {
            x: p.x < fx ? Math.min(x0, fx - MIN_PX) : fx,
            y: p.y < fy ? Math.min(y0, fy - MIN_PX) : fy,
            width,
            height,
          };
        }
        onChange(b.id, { rect, rotation: b.rotation });
      },
      () => undefined,
    );
  };

  const startRotate = (b: EditorBox) => (e: React.PointerEvent) => {
    if (disabled || !box || active.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    const cx = b.rect.x + b.rect.width / 2;
    const cy = b.rect.y + b.rect.height / 2;
    const p0 = toPicture(e.clientX, e.clientY);
    const a0 = Math.atan2(p0.y - cy, p0.x - cx);
    const r0 = b.rotation ?? 0;
    track(
      e,
      (p, ev) => {
        let deg = r0 + ((Math.atan2(p.y - cy, p.x - cx) - a0) * 180) / Math.PI;
        deg = ((((deg + 180) % 360) + 360) % 360) - 180;
        const step = ev.shiftKey ? 15 : 90;
        const near = Math.round(deg / step) * step;
        if (ev.shiftKey || Math.abs(deg - near) < 4) deg = near;
        onChange(b.id, { rect: b.rect, rotation: Math.round(deg * 10) / 10 });
      },
      () => undefined,
    );
  };

  const startDraw = (e: React.PointerEvent) => {
    if (disabled || !box || active.current !== null) return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    const p0 = toPicture(e.clientX, e.clientY);
    let last: BoxRect | undefined;
    track(
      e,
      (p) => {
        if (!onDraw) return;
        const x = Math.max(0, Math.min(p0.x, p.x));
        const y = Math.max(0, Math.min(p0.y, p.y));
        const x1 = Math.min(source.width, Math.max(p0.x, p.x));
        const y1 = Math.min(source.height, Math.max(p0.y, p.y));
        last = { x, y, width: x1 - x, height: y1 - y };
        setGhost(last);
      },
      (cancelled) => {
        setGhost(undefined);
        const tiny = !last || last.width * box.scale < 8 || last.height * box.scale < 8;
        if (!cancelled && onDraw && last && !tiny) onDraw(last);
        else if (!cancelled && tiny) onSelect(undefined);
      },
    );
  };

  const key = (b: EditorBox) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const r = b.rect;
    const step =
      Math.max(1, Math.round(Math.min(source.width, source.height) / 100)) * (e.shiftKey ? 10 : 1);
    const scaled = (k: number) => {
      const s = Math.max(MIN_PX / Math.min(r.width, r.height), k);
      const width = r.width * s;
      const height = r.height * s;
      return {
        x: r.x + (r.width - width) / 2,
        y: r.y + (r.height - height) / 2,
        width,
        height,
      };
    };
    let next: BoxChange | undefined;
    if (e.key === "ArrowLeft") next = { rect: clampCentre({ ...r, x: r.x - step }) };
    else if (e.key === "ArrowRight") next = { rect: clampCentre({ ...r, x: r.x + step }) };
    else if (e.key === "ArrowUp") next = { rect: clampCentre({ ...r, y: r.y - step }) };
    else if (e.key === "ArrowDown") next = { rect: clampCentre({ ...r, y: r.y + step }) };
    else if (e.key === "+" || e.key === "=") next = { rect: scaled(1.1) };
    else if (e.key === "-" || e.key === "_") next = { rect: scaled(1 / 1.1) };
    else if (rotatable && (e.key === "[" || e.key === "]")) {
      const d = (e.key === "]" ? 1 : -1) * (e.shiftKey ? 15 : 5);
      next = { rect: r, rotation: (((b.rotation ?? 0) + d + 540) % 360) - 180 };
    } else if ((e.key === "Delete" || e.key === "Backspace") && onDelete) {
      e.preventDefault();
      onDelete(b.id);
      return;
    }
    if (!next) return;
    e.preventDefault();
    onChange(b.id, { rotation: b.rotation, ...next });
  };

  const k = box?.scale ?? 0;
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {box && (
        <div
          className={cn(
            "absolute touch-none overflow-visible",
            disabled ? "pointer-events-none" : "pointer-events-auto",
            onDraw && !disabled && "cursor-crosshair",
          )}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          onPointerDown={startDraw}
        >
          <span id={descId} className="sr-only">
            {help}
          </span>
          {boxes.map((b) => {
            const isSel = b.id === selected;
            const rot = b.rotation ?? 0;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a focusable drag surface over the picture, not a form group
              <div
                key={b.id}
                role="group"
                aria-roledescription={noun}
                aria-label={`${b.label}: ${formatDimensions(Math.round(b.rect.width), Math.round(b.rect.height))} at ${Math.round(b.rect.x)}, ${Math.round(b.rect.y)}${rot ? `, turned ${Math.round(rot)}°` : ""}${b.hidden ? ", not shown at this moment" : ""}`}
                aria-describedby={descId}
                aria-current={isSel || undefined}
                tabIndex={disabled ? -1 : 0}
                onFocus={() => {
                  if (!isSel) onSelect(b.id);
                }}
                onPointerDown={startMove(b)}
                onKeyDown={key(b)}
                data-box={b.id}
                className={cn(
                  "absolute outline-none focus-visible:stage-focus",
                  disabled ? "pointer-events-none" : "cursor-move",
                  b.hidden && "opacity-50",
                )}
                style={{
                  left: b.rect.x * k,
                  top: b.rect.y * k,
                  width: b.rect.width * k,
                  height: b.rect.height * k,
                  transform: rot ? `rotate(${rot}deg)` : undefined,
                }}
              >
                {/* A 44px minimum target around a box that is small on a phone screen. */}
                <span
                  aria-hidden
                  className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-full min-h-11 w-full min-w-11"
                />
                {b.src && (
                  <img
                    src={b.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full select-none"
                    style={{ opacity: b.opacity ?? 1 }}
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 border border-gray-0 outline outline-1 outline-gray-1000/70",
                    b.shape === "ellipse" && "rounded-full",
                    !isSel && "border-dashed",
                  )}
                />
                {isSel && !disabled && (
                  <>
                    {corners.map((c) => (
                      <div
                        key={c}
                        aria-hidden
                        data-handle={c}
                        onPointerDown={startResize(b, c)}
                        className={cn(
                          "absolute flex size-11 touch-none items-center justify-center",
                          handleBox[c],
                          c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
                        )}
                      >
                        <span
                          className={cn(
                            "size-3 rounded-sm border border-gray-1000 bg-gray-0",
                            handleDot[c],
                          )}
                        />
                      </div>
                    ))}
                    {rotatable && (
                      <div
                        aria-hidden
                        data-handle="rotate"
                        onPointerDown={startRotate(b)}
                        className="-translate-x-1/2 absolute bottom-full left-1/2 mb-3 flex size-11 cursor-grab touch-none items-center justify-center"
                      >
                        <span className="size-3 rounded-full border border-gray-1000 bg-gray-0" />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {ghost && (
            <div
              aria-hidden
              className="pointer-events-none absolute border border-gray-0 border-dashed outline outline-1 outline-gray-1000/70"
              style={{
                left: ghost.x * k,
                top: ghost.y * k,
                width: ghost.width * k,
                height: ghost.height * k,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
