"use client";

import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { ClarityOptions } from "@/tools/engines/clarity/options";
import { type ClarityRenderer, createClarityRenderer } from "@/tools/engines/clarity/render";
import { useContentRect } from "../crop/use-content-rect";

/** Longest edge of the preview canvas; grain and detail sizes scale with it. */
const MAX_EDGE = 1920;

/**
 * Before and after on the picture: the engine's own renderer (clarity/render) draws each painted
 * frame of the video onto a canvas over it, shown right of a divider the user drags (or moves with
 * the arrow keys); left of it the untouched video shows through. While playing, denoise uses the
 * previous drawn frame as the file will; after a seek it starts again from the frame alone. Without
 * WebGL 2 nothing is drawn and the plain video shows.
 *
 * Each renderer gets a canvas of its own, made here and removed with it: a canvas whose WebGL
 * context was given up (`dispose`) hands back that lost context forever, which drew solid black
 * after the first re-render (design review 2026-11-18).
 */
export function ClarityPreview({
  video,
  source,
  value,
  fps,
  ready = true,
}: {
  video: RefObject<HTMLVideoElement | null>;
  source: { width: number; height: number };
  value: ClarityOptions;
  /** The video's frame rate: a seek of one frame forward continues from the frame before. */
  fps: number;
  /** False while the options are not final (denoise measuring the grain): the After side waits. */
  ready?: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const box = useContentRect(layerRef, source);
  const [split, setSplit] = useState(0.5);
  const latest = useRef(value);
  latest.current = value;
  const drawRef = useRef<(fresh: boolean) => void>(() => undefined);
  const labelId = useId();

  const sw = source.width;
  const sh = source.height;
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || sw <= 0 || sh <= 0) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.testid = "clarity-preview";
    canvas.className = "absolute inset-0 size-full";
    holder.appendChild(canvas);
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const size = {
      width: Math.max(2, Math.round(sw * scale)),
      height: Math.max(2, Math.round(sh * scale)),
    };
    let renderer: ClarityRenderer | null = null;
    try {
      renderer = createClarityRenderer(canvas, size);
    } catch {
      renderer = null;
    }
    if (!renderer) {
      canvas.remove();
      return;
    }
    const r = renderer;
    const scratch = document.createElement("canvas");
    scratch.width = size.width;
    scratch.height = size.height;
    const c2d = scratch.getContext("2d", { alpha: false });
    let el: HTMLVideoElement | null = null;
    let vfc = 0;
    let raf = 0;
    /** The video time of the frame drawn last. */
    let last = Number.NaN;
    const draw = (fresh: boolean) => {
      const v = video.current;
      if (!v || !c2d || v.readyState < 2) return;
      c2d.drawImage(v, 0, 0, size.width, size.height);
      if (fresh) r.reset();
      r.render(scratch, latest.current, scale);
      last = v.currentTime;
      canvas.dataset.drawn = "1";
      setDrawn(true);
    };
    drawRef.current = draw;
    const tick = () => {
      draw(false);
      if (!el || el.paused) return;
      if ("requestVideoFrameCallback" in el) vfc = el.requestVideoFrameCallback(tick);
      else raf = requestAnimationFrame(tick);
    };
    // A seek one frame forward (the . key, a frame step) carries on from the frame before, as
    // playing and the file do; any other seek starts again from the frame alone.
    const frameSec = 1 / (fps > 0 ? fps : 30);
    const still = () => {
      const t = video.current?.currentTime ?? 0;
      const step = t - last;
      draw(!(step > frameSec * 0.5 && step < frameSec * 1.5));
    };
    const attach = () => {
      el = video.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("play", tick);
      el.addEventListener("seeked", still);
      el.addEventListener("loadeddata", still);
      still();
      if (!el.paused) tick();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (el) {
        if (vfc && "cancelVideoFrameCallback" in el) el.cancelVideoFrameCallback(vfc);
        el.removeEventListener("play", tick);
        el.removeEventListener("seeked", still);
        el.removeEventListener("loadeddata", still);
      }
      drawRef.current = () => undefined;
      r.dispose();
      canvas.remove();
      setDrawn(false);
    };
  }, [video, sw, sh, fps]);

  // Options changed: the current frame again, alone (as after a seek).
  useEffect(() => {
    drawRef.current(true);
  }, [value]);

  const dragging = useRef(false);
  const fromPointer = (clientX: number) => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect || !box) return;
    const x = (clientX - rect.left - box.left) / box.width;
    setSplit(Math.min(1, Math.max(0, x)));
  };
  const pct = Math.round(split * 100);
  // The 44 px grab strip stays inside the picture at the ends; the line itself follows the split.
  const grab = box ? Math.min(box.width - 22, Math.max(22, split * box.width)) : 0;

  return (
    <div ref={layerRef} className="absolute inset-0 overflow-hidden rounded-lg">
      <div
        className="absolute"
        style={
          box
            ? { left: box.left, top: box.top, width: box.width, height: box.height }
            : { display: "none" }
        }
      >
        <div
          ref={holderRef}
          className="pointer-events-none absolute inset-0"
          style={{
            clipPath: `inset(0 0 0 ${split * 100}%)`,
            visibility: ready && drawn ? "visible" : "hidden",
          }}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute top-2 left-2 rounded-sm bg-gray-1000/70 px-2 py-1 text-gray-0 text-xs transition-opacity ease-(--ease-out) motion-reduce:transition-none ${split < 0.12 ? "opacity-0 duration-(--duration-fast)" : "opacity-100 duration-(--duration-base)"}`}
        >
          Before
        </span>
        <span
          aria-hidden
          className={`pointer-events-none absolute top-2 right-2 rounded-sm bg-gray-1000/70 px-2 py-1 text-gray-0 text-xs transition-opacity ease-(--ease-out) motion-reduce:transition-none ${split > 0.88 || !(ready && drawn) ? "opacity-0 duration-(--duration-fast)" : "opacity-100 duration-(--duration-base)"}`}
        >
          After
        </span>
        <span
          aria-hidden
          className="-translate-x-1/2 pointer-events-none absolute inset-y-0 w-0.5 bg-gray-0 outline outline-1 outline-gray-1000/70"
          style={{ left: `${split * 100}%` }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}% shows the original`}
          className="group -translate-x-1/2 absolute inset-y-0 flex w-11 cursor-ew-resize touch-none items-center justify-center outline-none"
          style={{ left: grab }}
          onPointerDown={(e) => {
            if (!e.isPrimary) return;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (dragging.current) fromPointer(e.clientX);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.2 : 0.05;
            if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - step));
            else if (e.key === "ArrowRight") setSplit((s) => Math.min(1, s + step));
            else if (e.key === "Home") setSplit(0);
            else if (e.key === "End") setSplit(1);
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <span id={labelId} className="sr-only">
            Before and after divider
          </span>
          <span
            className="absolute flex h-11 w-3 items-center justify-center rounded-sm bg-gray-0 group-focus-visible:stage-focus"
            style={{ left: `calc(50% + ${split * (box?.width ?? 0) - grab}px - 6px)` }}
          >
            <span className="h-4 w-0.5 rounded-full bg-gray-900" />
          </span>
        </div>
      </div>
    </div>
  );
}
