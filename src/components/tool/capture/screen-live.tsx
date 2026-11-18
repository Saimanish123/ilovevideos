"use client";

import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { bubbleRect, type Corner } from "@/tools/engines/capture/light";

/**
 * The screen recorder's pieces that are not on screen at first: the shared picture with the camera
 * bubble while recording, and what a phone sees instead of the recorder. Loaded with the encoder,
 * or on a phone when it turns out to have no screen capture (ADR-0104).
 */
export function ScreenPreview({
  display,
  camera,
  corner,
}: {
  display: MediaStream;
  camera?: MediaStream;
  corner: Corner;
}) {
  const screenVideo = useRef<HTMLVideoElement>(null);
  const camVideo = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (screenVideo.current) screenVideo.current.srcObject = display;
  }, [display]);
  useEffect(() => {
    if (camVideo.current) camVideo.current.srcObject = camera ?? null;
  }, [camera]);
  const shape = display.getVideoTracks()[0]?.getSettings();
  const ratio = shape?.width && shape.height ? shape.width / shape.height : 16 / 9;
  const h = Math.round(1000 / ratio);
  // The same place the recorder draws the bubble (light.ts `bubbleRect`), as shares of the picture.
  const r = bubbleRect(1000, h, corner);
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-lg bg-bg-stage"
      // Width from the cap and the picture's shape, so a capped preview keeps its shape and the
      // bubble's percentages land where the recorder draws it.
      style={{
        aspectRatio: ratio,
        width: `min(100%, calc(var(--stage-preview-max-h) * ${ratio}))`,
      }}
    >
      <video
        ref={screenVideo}
        autoPlay
        muted
        playsInline
        aria-label="The shared screen"
        className="h-full w-full object-contain"
      />
      {camera && (
        <video
          ref={camVideo}
          autoPlay
          muted
          playsInline
          aria-hidden
          className="absolute aspect-square rounded-full border border-gray-0 object-cover"
          style={{
            left: `${(r.x / 1000) * 100}%`,
            top: `${(r.y / h) * 100}%`,
            width: `${(r.size / 1000) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

/**
 * No screen capture in this browser. On a phone or tablet: why, and where to go with the phone's own
 * recording. On a computer: which browsers can.
 */
export function ScreenBlocked({ phone }: { phone: boolean }) {
  if (!phone)
    return (
      <p className="text-body">
        This browser cannot record the screen.{" "}
        <span className="text-fg-muted">Use a current Chrome, Edge, Firefox or Safari.</span>
      </p>
    );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        Phones and tablets do not let a web page record the screen.{" "}
        <span className="text-fg-muted">
          Record with the phone&apos;s own screen recorder, then open the file here.
        </span>
      </p>
      <div className="flex flex-col gap-3">
        <Link href="/trim-video" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Trim a recording
        </Link>
        <Link
          href="/compress-video"
          className={buttonVariants({ variant: "secondary", size: "lg" })}
        >
          Compress a recording
        </Link>
      </div>
    </div>
  );
}
