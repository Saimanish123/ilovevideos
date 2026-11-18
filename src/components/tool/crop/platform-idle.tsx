"use client";

import { useId } from "react";
import { type FrameProfile, keepsOwnResolution, sizeLabel } from "@/content/platforms/frames";
import { type AspectRatioId, aspectNumber } from "@/tools/engines/aspect-ratio/ratios";
import { ShapePicker } from "./shape-picker";
import { shapeOption } from "./shapes";

/** The target frame drawn to scale, like the shape-picker glyph but large enough to read. */
function FrameGlyph({ ratio }: { ratio: number }) {
  const box = 64;
  const w = ratio >= 1 ? box : box * ratio;
  const h = ratio >= 1 ? box / ratio : box;
  return (
    <svg
      aria-hidden
      width={box + 4}
      height={box + 4}
      viewBox={`0 0 ${box + 4} ${box + 4}`}
      fill="none"
      stroke="currentColor"
      className="shrink-0 text-fg"
    >
      <rect
        x={(box + 4 - w) / 2}
        y={(box + 4 - h) / 2}
        width={w}
        height={h}
        rx={3}
        strokeWidth={1.5}
      />
    </svg>
  );
}

/**
 * Resize for a platform, before a file: the target shape and pixel size the page will write, so the
 * promise is visible before anything is dropped. Platforms that name a second shape (Shorts: square)
 * offer it here; the choice carries into the ready state as the page preset.
 */
export function PlatformIdle({
  platform,
  preset,
  onPresetChange,
}: {
  platform: FrameProfile;
  preset: Record<string, unknown>;
  onPresetChange: (patch: Record<string, unknown>) => void;
}) {
  const id = useId();
  const shapes = [platform.ratio, ...(platform.alsoRatios ?? [])];
  const ratio = (
    shapes.includes(preset.ratio as AspectRatioId) ? preset.ratio : platform.ratio
  ) as AspectRatioId;
  return (
    <div className="mt-2 flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex items-center gap-4 text-left">
        <FrameGlyph ratio={aspectNumber(ratio)} />
        <div>
          <p className="tabular font-medium text-body">
            {ratio} ·{" "}
            {keepsOwnResolution(platform)
              ? "your video's own resolution"
              : sizeLabel(platform, ratio)}
          </p>
          <p className="text-fg-muted text-sm">
            {platform.name}.{" "}
            {keepsOwnResolution(platform)
              ? "Nothing is scaled; only the shape changes."
              : "Bigger videos are scaled down to this; smaller ones are never enlarged."}
          </p>
        </div>
      </div>
      {shapes.length > 1 && (
        <div className="w-full text-left">
          <p id={id} className="mb-2 font-medium text-sm">
            Shape <span className="font-normal text-fg-muted">(you can change it later)</span>
          </p>
          <ShapePicker
            name="idle-platform-ratio"
            aria-labelledby={id}
            value={ratio}
            surface="subtle"
            columns={shapes.length}
            options={shapes.map(shapeOption)}
            onChange={(r) => onPresetChange({ ratio: r })}
          />
        </div>
      )}
    </div>
  );
}
