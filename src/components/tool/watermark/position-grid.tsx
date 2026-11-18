"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { type Anchor, anchorNames, anchors } from "@/tools/engines/watermark/options";

/**
 * Nine positions as a picture-shaped grid of radios: each cell is a 44px target with a small square
 * showing where the mark goes. Arrow keys move between cells (native radio behaviour). When the mark
 * was dragged to a custom place, no cell is checked.
 */
export function PositionGrid({
  value,
  onChange,
  labelledBy,
}: {
  value: Anchor | "custom";
  onChange: (a: Anchor) => void;
  labelledBy: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      // Rows are 44px targets, so the grid comes out close to a 16:9 picture at this width.
      className="grid w-full max-w-60 grid-cols-3 gap-1 rounded-md bg-bg-subtle p-1"
    >
      {anchors.map((a) => {
        const checked = value === a;
        const inputId = `${id}-${a}`;
        return (
          <label
            key={a}
            htmlFor={inputId}
            className={cn(
              "flex min-h-11 cursor-pointer rounded-sm p-2 transition-colors duration-(--duration-instant) has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
              a[0] === "t" ? "items-start" : a[0] === "b" ? "items-end" : "items-center",
              a[1] === "l" ? "justify-start" : a[1] === "r" ? "justify-end" : "justify-center",
              checked ? "bg-bg-raised shadow-1" : "hover:bg-bg-raised/60",
            )}
          >
            <input
              id={inputId}
              type="radio"
              name={`${id}-anchor`}
              value={a}
              checked={checked}
              onChange={() => onChange(a)}
              className="sr-only"
            />
            <span className="sr-only">{anchorNames[a]}</span>
            <span
              aria-hidden
              className={cn("size-3 rounded-sm", checked ? "bg-fg" : "border border-border-strong")}
            />
          </label>
        );
      })}
    </div>
  );
}
