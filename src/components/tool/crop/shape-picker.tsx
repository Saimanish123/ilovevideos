"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface ShapeOption<T extends string> {
  value: T;
  label: string;
  /** Where the shape is used, one short phrase ("Reels, Shorts, TikTok"). */
  context: string;
  /** width / height; null draws a dashed "any shape" glyph. */
  ratio: number | null;
}

/** A 20px glyph of the shape, drawn like a lucide icon (1.5 stroke), so the choice reads before the label. */
function Glyph({ ratio }: { ratio: number | null }) {
  const w = ratio === null ? 16 : ratio >= 1 ? 18 : 18 * ratio;
  const h = ratio === null ? 12 : ratio >= 1 ? 18 / ratio : 18;
  return (
    <svg aria-hidden width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <rect
        x={(20 - w) / 2}
        y={(20 - h) / 2}
        width={w}
        height={h}
        rx={1}
        strokeWidth={1.5}
        strokeDasharray={ratio === null ? "3 2" : undefined}
      />
    </svg>
  );
}

/**
 * Shape presets as radio cards: glyph, ratio and the place it is used. Native radios (arrows move,
 * space selects), 44px minimum targets, same selected treatment as the segmented control.
 */
export function ShapePicker<T extends string>({
  name,
  value,
  options,
  onChange,
  columns = 3,
  surface = "raised",
  "aria-labelledby": labelledBy,
}: {
  name: string;
  /**
   * The surface it sits on. On the subtle drop zone the track takes the page background and a
   * hairline so it still reads as one control (no box around it: no surface on a surface).
   */
  surface?: "raised" | "subtle";
  /** Undefined leaves every card unchecked (nothing chosen yet). */
  value: T | undefined;
  options: ShapeOption<T>[];
  onChange: (v: T) => void;
  columns?: number;
  "aria-labelledby"?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn(
        "grid gap-1 rounded-md p-1 text-sm",
        surface === "subtle" ? "border border-border bg-bg" : "bg-bg-subtle",
      )}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const checked = o.value === value;
        const inputId = `${id}-${o.value}`;
        return (
          <label
            key={o.value}
            htmlFor={inputId}
            className={cn(
              "relative flex min-h-11 cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-sm px-2 py-2 text-center transition-colors duration-(--duration-instant) has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
              checked ? "bg-bg-raised text-fg shadow-1" : "text-fg-muted hover:text-fg",
            )}
          >
            <input
              id={inputId}
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="pointer-events-none">
              <Glyph ratio={o.ratio} />
            </span>
            <span className={cn("pointer-events-none tabular", checked && "font-medium")}>
              {o.label}
            </span>
            <span className="pointer-events-none text-fg-muted text-xs">{o.context}</span>
          </label>
        );
      })}
    </div>
  );
}
