"use client";

import { useEffect, useState } from "react";

/**
 * Frames of a file at given times, drawn by a hidden <video> onto small canvases of `height`
 * pixels, for page previews (the contact sheet, the frame ticks of the image sequence). Runs on the
 * page thread, where the preview already decodes this file; frames arrive one by one; stops when the
 * inputs change or the component goes away. An undecodable file (ProRes in Chrome) yields none.
 */
export function useFrames(
  file: File | undefined,
  times: number[],
  height: number,
): (HTMLCanvasElement | undefined)[] {
  const [frames, setFrames] = useState<(HTMLCanvasElement | undefined)[]>([]);
  const key = times.map((t) => t.toFixed(3)).join(",");
  useEffect(() => {
    if (!file || times.length === 0 || height <= 0) {
      setFrames([]);
      return;
    }
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const out: (HTMLCanvasElement | undefined)[] = times.map(() => undefined);
    setFrames([...out]);
    const seek = (t: number) =>
      new Promise<void>((resolve, reject) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("video error")), { once: true });
        video.currentTime = t;
      });
    void (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("cannot decode")), { once: true });
        });
        const w = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * height));
        const end = Math.max(0, (video.duration || 0) - 0.05);
        for (let i = 0; i < times.length && !cancelled; i++) {
          await seek(Math.min(times[i] ?? 0, end));
          if (cancelled) return;
          const c = document.createElement("canvas");
          c.width = w;
          c.height = height;
          c.getContext("2d")?.drawImage(video, 0, 0, w, height);
          out[i] = c;
          setFrames([...out]);
        }
      } catch {
        // No frames: the preview shows empty tiles and the run still works in the worker.
      }
    })();
    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    // `key` stands for `times` (compared by value).
  }, [file, key, height]);
  return frames;
}
