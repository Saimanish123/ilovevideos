"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * The preview's current time, for labels and "add at the playhead" buttons. Updated on seeks,
 * pauses and the element's own `timeupdate` (about four times a second while playing), never per
 * frame: timelines move their playhead themselves (./timeline-track). Waits for the preview element,
 * which can attach after the panel (ADR-0030).
 */
export function usePlayhead(video: RefObject<HTMLMediaElement | null>): number {
  const [time, setTime] = useState(0);
  const [el, setEl] = useState<HTMLMediaElement | null>(null);
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
    const on = () => setTime(el.currentTime);
    on();
    el.addEventListener("timeupdate", on);
    el.addEventListener("seeked", on);
    el.addEventListener("pause", on);
    return () => {
      el.removeEventListener("timeupdate", on);
      el.removeEventListener("seeked", on);
      el.removeEventListener("pause", on);
    };
  }, [el]);
  return time;
}

/**
 * The preview's current time every animation frame while it plays (and on seeks): for a layer that
 * must follow the picture frame by frame (a zoom view, a live layout). Stops when paused.
 */
export function useFrameTime(video: RefObject<HTMLMediaElement | null>): number {
  const [time, setTime] = useState(0);
  const [el, setEl] = useState<HTMLMediaElement | null>(null);
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
    const tick = () => {
      setTime(el.currentTime);
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    on();
    el.addEventListener("play", on);
    el.addEventListener("seeked", on);
    el.addEventListener("pause", on);
    el.addEventListener("timeupdate", on);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", on);
      el.removeEventListener("seeked", on);
      el.removeEventListener("pause", on);
      el.removeEventListener("timeupdate", on);
    };
  }, [el]);
  return time;
}
