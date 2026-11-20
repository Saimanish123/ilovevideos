"use client";

import { useId } from "react";
import { type AspectRatioId, aspectRatioIds } from "@/tools/engines/aspect-ratio/ratios";
import { ShapePicker } from "./shape-picker";
import { shapeOption } from "./shapes";

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
