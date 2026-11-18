"use client";

import { type RefObject, useEffect, useState } from "react";

export interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** CSS pixels per source pixel. */
  scale: number;
}

/**
 * Where the picture actually sits inside the preview box. The preview's height is capped (60vh), so
 * a tall video is pillarboxed inside a wider box; overlays must follow the picture, not the box.
 */
export function useContentRect(
  ref: RefObject<HTMLElement | null>,
  source: { width: number; height: number },
): ContentRect | null {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  if (!box || box.w === 0 || box.h === 0 || source.width <= 0 || source.height <= 0) return null;
  const scale = Math.min(box.w / source.width, box.h / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { left: (box.w - width) / 2, top: (box.h - height) / 2, width, height, scale };
}
