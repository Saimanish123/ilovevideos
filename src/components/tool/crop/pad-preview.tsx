"use client";

import { type RefObject, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { BLUR_DIM, type PadColor, type Size } from "@/tools/engines/crop/math";
import { useStageFit } from "./stage-fit";

/**
 * The blurred background on the preview, drawn the way the encoder draws it (crop/native
 * `drawBlurred`): the current frame scaled to cover the new frame at a sixteenth of its size, enlarged
 * with smoothing and dimmed, with the middle left clear so the real (scaled) picture shows through.
 * Redrawn while the preview plays and on every seek.
 */
function BlurBars({
  video,
  width,
  height,
  inner,
}: {
  video: RefObject<HTMLVideoElement | null>;
  width: number;
  height: number;
  inner: { x: number; y: number; width: number; height: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const el = video.current;
    if (!canvas || !el) return;
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    canvas.width = w;
    canvas.height = h;
    const small = document.createElement("canvas");
    small.width = Math.max(2, Math.round(w / 16));
    small.height = Math.max(2, Math.round(h / 16));
    const c2d = canvas.getContext("2d");
    const s2d = small.getContext("2d");
    if (!c2d || !s2d) return;
    let raf = 0;
    const draw = () => {
      if (el.readyState < 2 || el.videoWidth === 0) return;
      const k = Math.max(small.width / el.videoWidth, small.height / el.videoHeight);
      const dw = el.videoWidth * k;
      const dh = el.videoHeight * k;
      s2d.drawImage(el, (small.width - dw) / 2, (small.height - dh) / 2, dw, dh);
      c2d.imageSmoothingEnabled = true;
      c2d.imageSmoothingQuality = "high";
      c2d.drawImage(small, 0, 0, w, h);
      c2d.fillStyle = `rgb(0 0 0 / ${BLUR_DIM})`;
      c2d.fillRect(0, 0, w, h);
      c2d.clearRect(inner.x, inner.y, inner.width, inner.height);
    };
    const loop = () => {
      draw();
      if (!el.paused) raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("seeked", draw);
    el.addEventListener("loadeddata", draw);
    draw();
    if (!el.paused) onPlay();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("seeked", draw);
      el.removeEventListener("loadeddata", draw);
    };
  }, [video, width, height, inner.x, inner.y, inner.width, inner.height]);
  return <canvas ref={ref} data-testid="blur-bars" className="absolute inset-0 h-full w-full" />;
}

/**
 * Shows the fitted result on the preview: the new frame (outlined) fitted to the whole stage box, its
 * bars in the chosen colour (or the blurred picture), and the <video> scaled into it by `useStageFit`,
 * directly and without a transition, so bars and picture move together. Not interactive.
 */
export function PadPreview({
  source,
  ratio,
  color,
  video,
}: {
  source: Size;
  ratio: number;
  color: PadColor;
  /** The preview element: scaled into the frame, and the blurred background is drawn from it. */
  video?: RefObject<HTMLVideoElement | null>;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const W = Math.max(1, source.width);
  const H = Math.max(1, source.height);
  const R = W / H;
  // The new frame in source pixels: the picture keeps its size, the frame grows around it.
  const frame = ratio >= R ? { width: H * ratio, height: H } : { width: W, height: W / ratio };
  const inner = { x: (frame.width - W) / 2, y: (frame.height - H) / 2, width: W, height: H };
  const fit = useStageFit(layerRef, source, frame, inner, video);
  if (!fit) return <div ref={layerRef} className="pointer-events-none absolute inset-0" />;
  const { frame: f, inner: i } = fit;
  const fill = color === "white" ? "bg-gray-0" : "bg-gray-1000";
  const barsX = ratio > R;
  return (
    <div ref={layerRef} aria-hidden className="pointer-events-none absolute inset-0">
      <div
        data-testid="pad-frame"
        className="absolute outline outline-1 outline-gray-400"
        style={{ left: f.left, top: f.top, width: f.width, height: f.height }}
      >
        {color === "blur" && video ? (
          <BlurBars video={video} width={f.width} height={f.height} inner={i} />
        ) : barsX ? (
          <>
            <div className={cn("absolute inset-y-0 left-0", fill)} style={{ width: i.x }} />
            <div className={cn("absolute inset-y-0 right-0", fill)} style={{ width: i.x }} />
          </>
        ) : (
          <>
            <div className={cn("absolute inset-x-0 top-0", fill)} style={{ height: i.y }} />
            <div className={cn("absolute inset-x-0 bottom-0", fill)} style={{ height: i.y }} />
          </>
        )}
      </div>
    </div>
  );
}
