"use client";

import { type RefObject, useEffect } from "react";
import type { Rect, Size } from "@/tools/engines/crop/math";
import { type ContentRect, useContentRect } from "./use-content-rect";

export interface StageFit {
  /** The new frame on the stage, in layer pixels. */
  frame: { left: number; top: number; width: number; height: number };
  /** Where the picture sits inside the frame, in frame pixels. */
  inner: { x: number; y: number; width: number; height: number };
  box: ContentRect;
}

/**
 * Fits a padded result (bars, a border) to the whole stage box rather than to the picture's own
 * letterboxed box, so a new shape uses the space it will have (a vertical clip in a 16:9 frame fills
 * the stage's width instead of shrinking inside its old tall outline). The preview <video> is scaled
 * to match directly and without a transition, so the picture and the bands drawn around it change in
 * the same frame (design system §6.3: direct manipulation does not animate). `frame` and `inner` are
 * in any one unit (output pixels); only their proportions matter.
 */
export function useStageFit(
  layerRef: RefObject<HTMLElement | null>,
  source: Size,
  frame: Size,
  inner: Rect,
  video?: RefObject<HTMLVideoElement | null>,
): StageFit | null {
  const box = useContentRect(layerRef, source);
  const cw = box ? box.width + 2 * box.left : 0;
  const ch = box ? box.height + 2 * box.top : 0;
  const fs =
    box && frame.width > 0 && frame.height > 0 ? Math.min(cw / frame.width, ch / frame.height) : 0;
  const k = box && box.width > 0 ? (inner.width * fs) / box.width : 1;
  const ready = box !== null;
  useEffect(() => {
    const el = video?.current;
    if (!el || !ready) return;
    el.style.transition = "none";
    el.style.transform = `scale(${k})`;
    return () => {
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [video, ready, k]);
  if (!box || fs <= 0) return null;
  const fw = frame.width * fs;
  const fh = frame.height * fs;
  return {
    frame: { left: (cw - fw) / 2, top: (ch - fh) / 2, width: fw, height: fh },
    inner: { x: inner.x * fs, y: inner.y * fs, width: inner.width * fs, height: inner.height * fs },
    box,
  };
}
