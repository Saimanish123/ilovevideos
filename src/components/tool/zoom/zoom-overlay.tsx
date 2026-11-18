"use client";

import { useEffect, useRef } from "react";
import { CropFrame } from "@/components/tool/crop/crop-frame";
import { useContentRect } from "@/components/tool/crop/use-content-rect";
import { useFrameTime } from "@/components/tool/timeline/use-playhead";
import { formatTimecode } from "@/lib/format";
import type { Rect } from "@/tools/engines/crop/math";
import { snapToFrame } from "@/tools/engines/frame-extract/math";
import {
  keyFromRect,
  keyRect,
  rectAt,
  sortKeys,
  type ZoomKey,
  type ZoomOptions,
} from "@/tools/engines/zoom-pan/options";

/** Index of the key frame at time `t` (within half a frame), if any. */
export function keyIndexAt(keys: readonly ZoomKey[], t: number, fps: number): number | undefined {
  const half = 0.5 / (fps > 0 ? fps : 30);
  const i = keys.findIndex((k) => Math.abs(k.t - t) <= half);
  return i >= 0 ? i : undefined;
}

const round = (r: { x: number; y: number; width: number; height: number }): Rect => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  width: Math.round(r.width),
  height: Math.round(r.height),
});

/**
 * Over the zoom page's preview. "Frame": the view at the playhead drawn as a frame of the picture's
 * shape; moving or resizing it edits the key frame there, or adds one when the playhead is between
 * key frames. "Result": a canvas over the picture showing what the output shows, drawn from the
 * preview with the same rectangle the engine uses (./options `rectAt`), every frame while it plays.
 */
export function ZoomOverlay({
  value,
  onChange,
  size,
  fps,
  duration,
  video,
  disabled,
}: {
  value: ZoomOptions;
  onChange: (next: ZoomOptions) => void;
  size: { width: number; height: number };
  fps: number;
  duration: number;
  video: React.RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
}) {
  const raw = useFrameTime(video);
  // Key frames sit on frames, as the timeline puts them.
  const t = snapToFrame(raw, fps, duration);
  const keys = sortKeys(value.keys);
  const at = keyIndexAt(keys, t, fps);
  const view = value.view ?? "frame";

  if (view === "result") return <ResultCanvas value={value} size={size} video={video} time={raw} />;

  const current = at !== undefined ? keys[at] : undefined;
  const rect = round(current ? keyRect(current, size) : rectAt(keys, t, value.ease, size));
  return (
    <CropFrame
      source={size}
      rect={rect}
      ratio={size.width / size.height}
      disabled={disabled}
      label={
        current
          ? `Zoom view at key frame ${formatTimecode(current.t)}`
          : `Zoom view at ${formatTimecode(t)}, between key frames`
      }
      onChange={(r) => {
        const key = keyFromRect(current?.t ?? t, r, size);
        const next =
          at !== undefined ? keys.map((k, i) => (i === at ? key : k)) : sortKeys([...keys, key]);
        onChange({ ...value, keys: next });
      }}
    />
  );
}

function ResultCanvas({
  value,
  size,
  video,
  time,
}: {
  value: ZoomOptions;
  size: { width: number; height: number };
  video: React.RefObject<HTMLVideoElement | null>;
  time: number;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useContentRect(layerRef, size);
  useEffect(() => {
    const el = video.current;
    const c = canvasRef.current;
    if (!el || !c || !box) return;
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext("2d", { alpha: false });
    if (!g || el.readyState < 2) return;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    // The element's own picture size may differ from the inspected one (a scaled preview): scale.
    const kx = (el.videoWidth || size.width) / size.width;
    const ky = (el.videoHeight || size.height) / size.height;
    const r = rectAt(value.keys, time, value.ease, size);
    g.drawImage(el, r.x * kx, r.y * ky, r.width * kx, r.height * ky, 0, 0, w, h);
  }, [time, value.keys, value.ease, size, video, box]);
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {box && (
        <canvas
          ref={canvasRef}
          aria-label="Preview of the zoomed result"
          role="img"
          className="absolute"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
    </div>
  );
}
