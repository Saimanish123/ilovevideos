"use client";

import { type RefObject, useEffect, useRef } from "react";
import { type BlurRegionOptions, placeAll, type Size } from "@/tools/engines/blur-region/options";
import { type BlurRenderer, createBlurRenderer } from "@/tools/engines/blur-region/render";
import { useContentRect } from "../crop/use-content-rect";

/** Longest edge of the preview canvas; the picture is scaled down to it, the effect with it. */
const MAX_EDGE = 1280;

/**
 * The live result over the preview picture: each painted frame of the video is drawn through the
 * engine's own WebGL renderer (blur-region/render) with the regions where they are at that moment,
 * at up to 1280 pixels on the long edge (sizes scale with it, so it looks as the file will). Redraws
 * on every frame while playing, on seeks and whenever the options change. Without WebGL 2 it draws
 * nothing and the plain video shows through.
 */
export function BlurPreview({
  video,
  source,
  value,
}: {
  video: RefObject<HTMLVideoElement | null>;
  source: Size;
  value: BlurRegionOptions;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useContentRect(layerRef, source);
  const latest = useRef(value);
  latest.current = value;
  const drawRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || source.width <= 0 || source.height <= 0) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const size = {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    };
    let renderer: BlurRenderer | null = null;
    try {
      renderer = createBlurRenderer(canvas, size, scale);
    } catch {
      renderer = null;
    }
    if (!renderer) return;
    const scratch = document.createElement("canvas");
    scratch.width = size.width;
    scratch.height = size.height;
    const c2d = scratch.getContext("2d", { alpha: false });
    const r = renderer;
    let el: HTMLVideoElement | null = null;
    let vfc = 0;
    let raf = 0;
    const draw = () => {
      const v = video.current;
      if (!v || !c2d || v.readyState < 2) return;
      c2d.drawImage(v, 0, 0, size.width, size.height);
      const o = latest.current;
      r.render(scratch, source, placeAll(o, v.currentTime, source), o);
      canvas.dataset.drawn = "1";
    };
    drawRef.current = draw;
    const tick = () => {
      draw();
      if (!el || el.paused) return;
      if ("requestVideoFrameCallback" in el) vfc = el.requestVideoFrameCallback(tick);
      else raf = requestAnimationFrame(tick);
    };
    const attach = () => {
      el = video.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("play", tick);
      el.addEventListener("seeked", draw);
      el.addEventListener("loadeddata", draw);
      draw();
      if (!el.paused) tick();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (el) {
        if (vfc && "cancelVideoFrameCallback" in el) el.cancelVideoFrameCallback(vfc);
        el.removeEventListener("play", tick);
        el.removeEventListener("seeked", draw);
        el.removeEventListener("loadeddata", draw);
      }
      drawRef.current = () => undefined;
      r.dispose();
    };
  }, [video, source]);

  // Options changed: draw the current frame again with them.
  useEffect(() => {
    drawRef.current();
  }, [value]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      <canvas
        ref={canvasRef}
        aria-hidden
        data-testid="blur-preview"
        className="absolute"
        style={
          box
            ? { left: box.left, top: box.top, width: box.width, height: box.height }
            : { display: "none" }
        }
      />
    </div>
  );
}
