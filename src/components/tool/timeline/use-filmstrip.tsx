"use client";

import { useEffect, useState } from "react";

const FRAME_HEIGHT = 96;

/**
 * Grabs evenly spaced frames from the file with a hidden <video> and a canvas. Runs on the page
 * thread because decoding is hardware-backed and the preview already decodes this file; stops
 * cleanly when the file changes or the component unmounts.
 */
export function useFilmstrip(file: File, duration: number, count = 12): string[] {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    if (!(duration > 0)) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const canvas = document.createElement("canvas");
    const out: string[] = [];

    const seekTo = (t: number) =>
      new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        const onError = () => reject(new Error("video error"));
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = t;
      });

    (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("cannot decode")), { once: true });
        });
        const w = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * FRAME_HEIGHT));
        canvas.width = w;
        canvas.height = FRAME_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        for (let i = 0; i < count && !cancelled; i++) {
          const t = ((i + 0.5) / count) * duration;
          await seekTo(Math.min(t, Math.max(0, duration - 0.05)));
          if (cancelled) return;
          ctx.drawImage(video, 0, 0, w, FRAME_HEIGHT);
          out.push(canvas.toDataURL("image/jpeg", 0.7));
          setFrames([...out]);
        }
      } catch {
        // Undecodable in <video> (e.g. ProRes): the timeline still works without thumbnails.
      }
    })();

    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [file, duration, count]);
  return frames;
}
