"use client";

import type { Ref } from "react";
import { cn } from "@/lib/cn";

/**
 * Mirrored bar waveform drawn on the always-dark stage. Two copies of the bars: the base in a
 * dim gray and a bright copy clipped to the played (or processed) share. The clip is set by the
 * caller, directly on `brightRef` for playback (no re-render per frame) or through `bright` for
 * slower changes. Peaks are scaled to the loudest bucket so quiet files stay readable.
 */
export function Waveform({
  peaks,
  bright = 0,
  brightRef,
  className,
}: {
  peaks?: Float32Array;
  /** 0–1 share drawn bright, when not driven through `brightRef`. */
  bright?: number;
  brightRef?: Ref<SVGGElement>;
  className?: string;
}) {
  const count = peaks?.length ?? 0;
  let max = 0;
  for (let i = 0; i < count; i++) max = Math.max(max, peaks?.[i] ?? 0);
  const scale = max > 0 ? 1 / max : 0;
  const bars =
    count > 0
      ? Array.from(peaks ?? [], (p, i) => {
          const h = Math.max(0.02, Math.min(1, p * scale)) * 46;
          return (
            <rect key={i.toString()} x={i + 0.2} y={50 - h} width={0.6} height={h * 2} rx={0.3} />
          );
        })
      : null;
  return (
    <svg
      viewBox={`0 0 ${Math.max(1, count)} 100`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
      aria-hidden
    >
      {bars ? (
        <>
          <g className="fill-gray-600">{bars}</g>
          <g
            ref={brightRef}
            className="fill-gray-50"
            // The initial clip; with `brightRef` the caller moves it directly while playing.
            style={{ clipPath: `inset(0 ${(1 - bright) * 100}% 0 0)` }}
          >
            {bars}
          </g>
        </>
      ) : (
        <line
          x1="0"
          x2="1"
          y1="50"
          y2="50"
          className="stroke-gray-700"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
