"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * The preview's current time, in page seconds, kept in React state: on every seek and pause, and on
 * every painted frame while it plays (requestVideoFrameCallback where the browser has it, otherwise
 * animation frames). For overlays whose boxes move with the picture (key-framed regions, layers
 * that show for part of the video). Waits for the element, which may attach after the overlay.
 */
export function usePlayhead(video: RefObject<HTMLVideoElement | null>): number {
  const [now, setNow] = useState(0);
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (video.current) {
      setEl(video.current);
      return;
    }
    let id = 0;
    let tries = 0;
    const wait = () => {
      if (video.current) setEl(video.current);
      else if (tries++ < 240) id = requestAnimationFrame(wait);
    };
    id = requestAnimationFrame(wait);
    return () => cancelAnimationFrame(id);
  }, [video]);
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    let vfc = 0;
    const read = () => setNow(el.currentTime);
    const rvfc = "requestVideoFrameCallback" in el;
    const tick = () => {
      read();
      if (el.paused) return;
      if (rvfc) vfc = el.requestVideoFrameCallback(tick);
      else raf = requestAnimationFrame(tick);
    };
    const onPlay = () => tick();
    el.addEventListener("play", onPlay);
    el.addEventListener("seeked", read);
    el.addEventListener("pause", read);
    el.addEventListener("loadeddata", read);
    read();
    if (!el.paused) tick();
    return () => {
      cancelAnimationFrame(raf);
      if (rvfc && vfc) el.cancelVideoFrameCallback(vfc);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("seeked", read);
      el.removeEventListener("pause", read);
      el.removeEventListener("loadeddata", read);
    };
  }, [el]);
  return now;
}
