"use client";

import { type RefObject, useRef } from "react";
import { cn } from "@/lib/cn";
import type { PadLayout, Size } from "@/tools/engines/crop/math";
import { useStageFit } from "./stage-fit";

/**
 * Shows a border on the preview: the new frame fitted to the whole stage box and painted in the
 * border colour around the picture; the <video> is scaled into it by `useStageFit`, directly and
 * without a transition, so bands and picture change together. A named colour uses the stage ramp; a
 * custom one is the user's own value. Not interactive.
 */
export function BorderPreview({
  source,
  layout,
  color,
  video,
}: {
  source: Size;
  layout: PadLayout;
  /** "white", "black" or "#rrggbb". */
  color: string;
  video?: RefObject<HTMLVideoElement | null>;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const fit = useStageFit(layerRef, source, layout, layout.inner, video);
  if (!fit) return <div ref={layerRef} className="pointer-events-none absolute inset-0" />;
  const { frame: f, inner: i } = fit;
  const named = color === "white" ? "bg-gray-0" : color === "black" ? "bg-gray-1000" : undefined;
  const style = named ? undefined : { backgroundColor: color };
  const band = (s: React.CSSProperties) => (
    <div className={cn("absolute", named)} style={{ ...style, ...s }} />
  );
  return (
    <div ref={layerRef} aria-hidden className="pointer-events-none absolute inset-0">
      <div
        data-testid="border-frame"
        className="absolute outline outline-1 outline-gray-400"
        style={{ left: f.left, top: f.top, width: f.width, height: f.height }}
      >
        {band({ left: 0, top: 0, width: f.width, height: i.y })}
        {band({ left: 0, top: i.y + i.height, width: f.width, bottom: 0 })}
        {band({ left: 0, top: i.y, width: i.x, height: i.height })}
        {band({ left: i.x + i.width, top: i.y, right: 0, height: i.height })}
      </div>
    </div>
  );
}
