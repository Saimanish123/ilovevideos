"use client";

import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { useWaveform } from "../audio/use-waveform";
import { Waveform } from "../audio/waveform";

/**
 * The sound of a video as a strip under its picture, on the dark stage: the waveform, a playhead that
 * follows the preview, and an optional layer drawn over it (a fade envelope with handles). The strip
 * itself is not a control; the preview's own controls play and seek. Reduced motion: the playhead
 * still moves with playback (it is position, not decoration).
 */
export function WaveStrip({
  file,
  media,
  duration,
  layer,
  label,
}: {
  file: File;
  media?: RefObject<HTMLMediaElement | null>;
  duration: number;
  layer?: ReactNode;
  /** What the strip shows, for screen readers, e.g. "Sound of the video with the fades". */
  label: string;
}) {
  const wave = useWaveform(file, 200);
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let el: HTMLMediaElement | null = null;
    const paint = () => {
      const head = headRef.current;
      if (el && head && duration > 0)
        head.style.transform = `translateX(${Math.min(1, el.currentTime / duration) * 100}cqw)`;
    };
    const loop = () => {
      paint();
      if (el && !el.paused) raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    // The preview element mounts a commit after this strip; wait for it briefly.
    const attach = () => {
      el = media?.current ?? null;
      if (!el) {
        if (tries++ < 120) raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("play", onPlay);
      el.addEventListener("seeked", paint);
      el.addEventListener("timeupdate", paint);
      paint();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("play", onPlay);
      el?.removeEventListener("seeked", paint);
      el?.removeEventListener("timeupdate", paint);
    };
  }, [media, duration]);
  return (
    <div className="rounded-lg bg-bg-stage p-3 text-gray-50">
      <div className="@container relative h-16">
        <div role="img" aria-label={label} className="absolute inset-0">
          <Waveform peaks={wave.peaks} bright={1} />
        </div>
        <div
          ref={headRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gray-50/70"
        />
        {layer}
      </div>
      {(wave.status === "unreadable" || wave.status === "no-audio") && (
        <p className="mt-2 text-gray-400 text-xs">
          {wave.status === "no-audio"
            ? "This video has no sound track."
            : "This browser cannot decode the sound to draw it."}
        </p>
      )}
    </div>
  );
}
