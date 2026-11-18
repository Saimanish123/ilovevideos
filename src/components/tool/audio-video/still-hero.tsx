"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDimensions, formatDuration } from "@/lib/format";
import { type AudioToVideoOptions, sizeOf } from "@/tools/engines/audio-to-video/options";
import { paintStill } from "@/tools/engines/audio-to-video/still";
import type { HeroProps } from "../options/types";
import { VideoPreview } from "../video-preview";

/**
 * The audio to video page's hero (spec.Hero): the picture the video will show, drawn live with the
 * same code that draws the real still, above a player for the sound. When done, the new video plays
 * in its place. The player is the stage's preview element, so Space plays and pauses it.
 */
export function StillHero({
  file,
  info,
  value,
  phase,
  showing,
  media,
}: HeroProps<AudioToVideoOptions>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();
  const [width, setWidth] = useState(0);
  const result = showing === "result";
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const size = value ? sizeOf(value) : { width: 1920, height: 1080 };
  const title = info?.tags?.title;
  const artist = info?.tags?.artist;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value || width === 0 || result) return;
    let live = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(1, (width * dpr) / size.width);
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(size.width * scale));
    off.height = Math.max(1, Math.round(size.height * scale));
    const c = off.getContext("2d");
    if (!c) return;
    // Drawn off screen, then shown in one step, so a picture being decoded never flashes blank.
    void paintStill(c, value, { name: file.name, title, artist }, scale).then(() => {
      if (!live) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")?.drawImage(off, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [value, width, size.width, size.height, file.name, title, artist, result]);

  const attach = useCallback(
    (el: HTMLAudioElement | null) => {
      if (media) media.current = el;
    },
    [media],
  );

  if (result)
    return (
      <VideoPreview
        file={file}
        info={
          info && {
            ...info,
            video: { codec: "avc", width: size.width, height: size.height, fps: 1 },
          }
        }
        videoRef={media as React.RefObject<HTMLVideoElement | null>}
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={boxRef}
        className="w-full overflow-hidden rounded-lg bg-bg-stage"
        style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight: "60vh" }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`The picture the video will show, ${formatDimensions(size.width, size.height)}`}
          className="h-full w-full object-contain"
        />
      </div>
      {url && (
        // biome-ignore lint/a11y/useMediaCaption: the user's own sound, played back before it is used
        <audio
          ref={attach}
          controls
          preload="metadata"
          src={url}
          aria-label={`Play ${file.name}`}
          className="w-full"
        />
      )}
      <p className="tabular text-fg-muted text-xs" aria-live="polite">
        {phase === "inspecting" || !info
          ? "Reading the file"
          : `${formatDuration(info.durationSec)} of sound under one still picture, ${formatDimensions(size.width, size.height)}.`}
      </p>
    </div>
  );
}
