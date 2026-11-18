"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Segmented control on native radio inputs (design system §8.4). 44px segments; arrows move, space selects. */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  columns,
  surface = "raised",
  "aria-labelledby": labelledBy,
}: {
  /** On the subtle drop zone: page-background track with a hairline, so no box is needed around it. */
  surface?: "raised" | "subtle";
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  /** Wrap into rows of this many segments (defaults to one row). */
  columns?: number;
  "aria-labelledby"?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn(
        "grid rounded-md p-1 text-sm",
        surface === "subtle" ? "border border-border bg-bg" : "bg-bg-subtle",
        columns && "gap-1",
      )}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const checked = o.value === value;
        const inputId = `${id}-${o.value}`;
        return (
          <label
            key={o.value}
            htmlFor={inputId}
            className={cn(
              "flex min-h-11 cursor-pointer select-none items-center justify-center rounded-sm px-2 text-center transition-colors duration-(--duration-instant) has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
              checked ? "bg-bg-raised font-medium text-fg shadow-1" : "text-fg-muted hover:text-fg",
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
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
