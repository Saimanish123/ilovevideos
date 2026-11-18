"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FrameScrubber } from "@/components/tool/timeline/frame-scrubber";
import type { EditMetadataOptions } from "@/tools/engines/edit-metadata/fields";
import type { HeroProps } from "../options/types";
import { useBytesUrl, useEditable } from "./use-editable";

/**
 * The change-video-thumbnail page (edit-metadata engine, preset `task: "cover"`, ADR-0098): the hero
 * is the video with a frame scrubber; the frame on screen is captured as a JPEG and becomes the
 * cover (MP4 `covr`, also in MOV). Nothing is re-encoded. When done, the cover is read back from the
 * new copy.
 */
export type CoverOptions = EditMetadataOptions & {
  task?: "date" | "cover";
  /** UI only: the chosen frame's time, seconds. */
  time?: number;
};

/** Longest edge of the captured cover; larger frames are scaled down (a cover is a thumbnail). */
export const COVER_MAX_EDGE = 1920;

/** The frame on the video element as a JPEG, at most COVER_MAX_EDGE on its long side. */
export async function captureFrame(
  el: HTMLVideoElement,
): Promise<NonNullable<EditMetadataOptions["cover"]> | undefined> {
  const w0 = el.videoWidth;
  const h0 = el.videoHeight;
  if (!(w0 > 0 && h0 > 0)) return undefined;
  const k = Math.min(1, COVER_MAX_EDGE / Math.max(w0, h0));
  const width = Math.round(w0 * k);
  const height = Math.round(h0 * k);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(el, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return undefined;
  return {
    name: `frame-${el.currentTime.toFixed(2)}.jpg`,
    blob,
    mime: "image/jpeg",
    width,
    height,
  };
}

export function CoverHero({
  file,
  info,
  value,
  phase,
  showing,
  media,
  onChange,
}: HeroProps<CoverOptions>) {
  const result = showing === "result";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (media) (media as React.MutableRefObject<HTMLMediaElement | null>).current = el;
    },
    [media],
  );
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  /** The time a capture adopted from the video; the effect run it causes must not capture again. */
  const settledAt = useRef<number | undefined>(undefined);
  const duration = info?.durationSec ?? 0;
  const fps = info?.video?.fps || 30;
  const time = value?.time ?? 0;

  // Capture the frame once the preview has settled on it (150 ms after the last seek), so a drag
  // along the filmstrip encodes one JPEG, not one per step. A scrub clears the cover first, so the
  // button waits for the frame that is on screen.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || result) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const half = 1 / (fps * 2);
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!live || el.seeking) return;
        const cover = await captureFrame(el);
        const { value: v, onChange: set } = latest.current;
        if (!live || !cover || !v || !set) return;
        // The seek has settled. Some decoders (WebKit, near the end) land more than half a frame
        // from the asked time: keep the frame on screen and name its real time, without seeking
        // again (the effect run this causes is skipped below).
        const at = el.currentTime;
        if (Math.abs(at - time) < half) set({ ...v, cover });
        else {
          settledAt.current = at;
          set({ ...v, cover, time: at });
        }
      }, 150);
    };
    const start = () => {
      if (Math.abs(el.currentTime - time) > half) el.currentTime = time;
      else schedule();
    };
    el.addEventListener("seeked", schedule);
    if (settledAt.current === time) settledAt.current = undefined;
    else if (el.readyState >= 2) start();
    else el.addEventListener("loadeddata", start, { once: true });
    return () => {
      live = false;
      clearTimeout(timer);
      el.removeEventListener("seeked", schedule);
      el.removeEventListener("loadeddata", start);
    };
  }, [time, fps, result]);

  if (result) return <CoverReadBack file={file} />;
  return (
    <section aria-label="Choose the cover frame" className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg bg-bg-stage">
        {url && (
          <video
            ref={attach}
            src={url}
            muted
            playsInline
            preload="auto"
            className="mx-auto aspect-video max-h-(--sheet-preview-max-h) w-full object-contain"
            data-testid="cover-video"
          />
        )}
      </div>
      {value && onChange && duration > 0 && (
        <FrameScrubber
          file={file}
          video={videoRef}
          duration={duration}
          fps={fps}
          value={time}
          disabled={phase !== "ready"}
          onChange={(t) => onChange({ ...value, time: t, cover: undefined })}
        />
      )}
    </section>
  );
}

/** Done: the cover the new copy carries, read back from it. */
function CoverReadBack({ file }: { file: File }) {
  const read = useEditable(file);
  const cover = read.status === "done" ? read.tags.cover : undefined;
  const src = useBytesUrl(cover?.data, cover?.mime);
  return (
    <section aria-label="Thumbnail" className="flex flex-col gap-3" data-testid="cover-after">
      <p className="text-fg-muted text-sm">Read back from the new copy</p>
      <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-bg-stage">
        {src ? (
          <img
            src={src}
            alt="The thumbnail stored in the new copy"
            className="max-h-(--sheet-preview-max-h) max-w-full object-contain"
          />
        ) : (
          <p className="text-gray-300 text-sm">
            {read.status === "reading" ? "Reading" : "No thumbnail found"}
          </p>
        )}
      </div>
    </section>
  );
}
