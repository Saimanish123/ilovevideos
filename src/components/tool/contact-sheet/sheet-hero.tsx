"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { codecName } from "@/tools/engines/convert-video/plan";
import {
  drawSheet,
  sheetHeader,
  sheetLayout,
  type ThumbnailGridOptions,
  tileTimes,
} from "@/tools/engines/thumbnail-grid/layout";
import { ImagePreview } from "../image-preview";
import type { HeroProps } from "../options/types";
import { useFrames } from "./use-frames";

/** The UI typeface as a canvas font list (the next/font family names behind --font-sans). */
function uiFont(): string {
  if (typeof document === "undefined") return "sans-serif";
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
    "sans-serif"
  );
}

/** Tracks an element's width in CSS pixels. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * The contact sheet page's hero (spec.Hero): the sheet itself, drawn live from the preview's own
 * frames with the same layout code the worker uses, so a change of grid, width, labels or header
 * shows before anything runs. The frames are the ones the sheet will hold (the middle of each equal
 * slice). When done it shows the real sheet.
 */
export function SheetHero({ file, info, value, phase, showing }: HeroProps<ThumbnailGridOptions>) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useWidth(boxRef);
  const v = info?.video;
  const layout = useMemo(() => (value && v ? sheetLayout(value, v) : undefined), [value, v]);
  const count = value ? value.columns * value.rows : 0;
  const times = useMemo(() => tileTimes(count, info?.durationSec ?? 0), [count, info?.durationSec]);
  // Preview resolution: the box width in device pixels, never more than the sheet itself.
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const scale = layout && width > 0 ? Math.min(1, (width * dpr) / layout.width) : 0;
  const tileH = layout?.tiles[0] ? Math.max(8, Math.round(layout.tiles[0].height * scale)) : 0;
  const source = showing === "result" ? undefined : file;
  const frames = useFrames(phase === "inspecting" ? undefined : source, times, tileH);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !value || !info || scale <= 0) return;
    canvas.width = Math.max(1, Math.round(layout.width * scale));
    canvas.height = Math.max(1, Math.round(layout.height * scale));
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    drawSheet(
      c,
      layout,
      value,
      frames,
      times,
      sheetHeader(file.name, info, codecName, formatBytes),
      uiFont(),
    );
  }, [layout, value, info, scale, frames, times, file.name]);

  if (showing === "result")
    return (
      <ImagePreview
        blob={file}
        info={
          layout && info
            ? {
                ...info,
                video: info.video && { ...info.video, width: layout.width, height: layout.height },
              }
            : info
        }
        alt={`The contact sheet, ${value?.columns ?? 0} by ${value?.rows ?? 0} frames`}
      />
    );
  const ready = frames.filter(Boolean).length;
  // The canvas has the sheet's shape from the first render (full size until the box is measured, then
  // scaled), so the preview never grows from the browser's 300 by 150 default and moves the page.
  const k = scale > 0 ? scale : 1;
  const canvasSize = layout
    ? {
        width: Math.max(1, Math.round(layout.width * k)),
        height: Math.max(1, Math.round(layout.height * k)),
      }
    : {};
  return (
    <div className="flex flex-col gap-2">
      <div
        ref={boxRef}
        className="flex max-h-(--sheet-preview-max-h) w-full items-center justify-center overflow-hidden rounded-lg bg-bg-stage p-4"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            value
              ? `Preview of the contact sheet: ${value.columns} by ${value.rows} frames${value.timestamps ? " with timestamps" : ""}`
              : "Preview of the contact sheet"
          }
          {...canvasSize}
          // Before the file is read there is no layout: hold the shape a 16:9 video's sheet has.
          className={cn(
            "h-auto max-h-(--sheet-canvas-max-h) max-w-full",
            !layout && "aspect-16/10 w-full",
          )}
        />
      </div>
      {/* Announced at the start and the end of drawing, not for every frame. */}
      <span className="sr-only" aria-live="polite">
        {phase === "inspecting" || !layout
          ? "Reading the file"
          : ready < count
            ? "Drawing the preview"
            : "Preview ready"}
      </span>
      <p className="tabular text-fg-muted text-xs">
        {phase === "inspecting" || !layout
          ? "Reading the file"
          : ready < count
            ? `Preview: ${ready} of ${count} frames drawn`
            : "Preview of the sheet. The frames are the ones it will hold."}
      </p>
    </div>
  );
}
