"use client";

import { useCallback, useRef } from "react";

/** Air between the bar's top edge and a control scrolled into view above it. */
const AIR_PX = 8;

/** Bars mounted now, oldest first. The newest one sets the padding; usually there is only one. */
const mounted: HTMLElement[] = [];

function write() {
  const root = document.documentElement;
  const bar = mounted[mounted.length - 1];
  if (bar) root.style.setProperty("--action-bar-h", `${bar.offsetHeight + AIR_PX}px`);
  else root.style.removeProperty("--action-bar-h");
}

/**
 * Ref for a tool's sticky action bar (`data-action-bar`). Below lg the bar sticks to the bottom of
 * the viewport, and `globals.css` sets `scroll-padding-bottom: var(--action-bar-h)` so focus moves
 * and find-in-page stop above it. The bar's height changes with its content (a status line that
 * wraps, a next-step link, a verdict), so it is measured here and written to `--action-bar-h` on
 * <html>; the token in tokens.css is only the value before the first measure. Several bars may be
 * mounted at once (a stage swapping its bar): the newest is measured, and unmounting one hands the
 * value back to the one before it.
 */
export function useActionBarRef() {
  const observer = useRef<ResizeObserver | null>(null);
  const current = useRef<HTMLElement | null>(null);
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    const prev = current.current;
    const at = prev ? mounted.indexOf(prev) : -1;
    if (at >= 0) mounted.splice(at, 1);
    current.current = el;
    if (el) mounted.push(el);
    write();
    if (!el || typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(write);
    observer.current.observe(el);
  }, []);
}
