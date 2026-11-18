"use client";

import { type RefObject, useEffect, useRef } from "react";
import { useContentRect } from "../crop/use-content-rect";

type Draw = (ctx: CanvasRenderingContext2D) => void;

/**
 * A canvas laid exactly over the preview picture, for live previews drawn with the engine's own
 * drawing code (ADR-0035): `draw` gets a context already scaled so one unit is one source pixel,
 * the same coordinates the worker draws in. Sized to the screen's pixels, so it stays sharp.
 * Decorative (the result is described by the panel); it never takes the pointer.
 */
export function PictureCanvas({
  source,
  draw,
  children,
}: {
  source: { width: number; height: number };
  /** Redrawn whenever this function changes; keep it memoised on what it draws. */
  draw: Draw;
  /** Controls placed over the picture (a draggable box), in the same layer. */
  children?: React.ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useContentRect(layerRef, source);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !box) return;
    const dpr = typeof window === "undefined" ? 1 : Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const k = w / Math.max(1, source.width);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    draw(ctx);
  }, [box, draw, source.width]);
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {box && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      {children}
    </div>
  );
}

/** Keeps a ref to a value for callbacks that must not change identity. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
