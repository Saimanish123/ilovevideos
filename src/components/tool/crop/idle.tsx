"use client";

import { useId } from "react";
import { type AspectRatioId, aspectRatioIds } from "@/tools/engines/aspect-ratio/ratios";
import { ShapePicker } from "./shape-picker";
import { shapeOption } from "./shapes";

/**
 * Crop, before a file: a picture with a frame drawn on it, dimmed outside, so the page's one control
 * is visible before anything is dropped. Static, decorative; the caption carries the meaning.
 */
export function CropIdle() {
  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        aria-hidden
        width={160}
        height={90}
        viewBox="0 0 160 90"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-fg-muted"
      >
        <rect x={1} y={1} width={158} height={88} rx={4} strokeDasharray="4 6" />
        <path
          d="M1 5a4 4 0 0 1 4-4h150a4 4 0 0 1 4 4v80a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4z M52 18v54h56V18z"
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
          className="text-border"
        />
        <rect x={52} y={18} width={56} height={54} className="text-fg" stroke="currentColor" />
        <path
          d="M52 26v-8h8 M100 18h8v8 M108 64v8h-8 M60 72h-8v-8"
          className="text-fg"
          stroke="currentColor"
        />
      </svg>
      <p className="text-fg-muted text-sm">
        Drag a frame over the picture, or lock it to 16:9, 9:16, 1:1, 4:5 or 4:3.
      </p>
    </div>
  );
}

/**
 * Change aspect ratio, before a file: the target shape can be chosen first, and the choice carries
 * into the ready state (it becomes the page preset `defaults` receives).
 */
export function AspectIdle({
  preset,
  onPresetChange,
}: {
  preset: Record<string, unknown>;
  onPresetChange: (patch: Record<string, unknown>) => void;
}) {
  const id = useId();
  // Unchecked until chosen: without a choice the ready state picks by the video's orientation.
  const value = (aspectRatioIds as readonly string[]).includes(String(preset.ratio))
    ? (preset.ratio as AspectRatioId)
    : undefined;
  return (
    <div className="w-full text-left">
      <p id={id} className="mb-2 font-medium text-sm">
        New shape <span className="font-normal text-fg-muted">(you can change it later)</span>
      </p>
      <ShapePicker
        surface="subtle"
        name="idle-ratio"
        aria-labelledby={id}
        value={value}
        options={aspectRatioIds.map(shapeOption)}
        onChange={(ratio) => onPresetChange({ ratio })}
      />
    </div>
  );
}
