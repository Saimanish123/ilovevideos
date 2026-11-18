"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** What the choice is for, in a few words ("Plays everywhere", "Slow motion"). */
  detail?: string;
  /** The fact that decides it, on the right of a row ("Copy, no quality lost", "Re-encodes"). */
  tag?: string;
}

/**
 * Purpose-led choices: the Segmented control's track and look (native radios, 44px, arrows move),
 * with a second line saying what each choice is for and, in rows, the deciding fact on the right.
 * One column reads as a list of rows (formats); more columns as a grid of presets (speeds).
 */
export function Choices<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 1,
  "aria-labelledby": labelledBy,
}: {
  name: string;
  value: T | undefined;
  onChange: (v: T) => void;
  options: Choice<T>[];
  columns?: number;
  "aria-labelledby"?: string;
}) {
  const id = useId();
  const rows = columns === 1;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid gap-1 rounded-md bg-bg-subtle p-1 text-sm"
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
              "flex min-h-11 cursor-pointer select-none rounded-sm px-3 py-2 transition-colors duration-(--duration-instant) has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
              rows
                ? "items-center justify-between gap-3 text-left"
                : "flex-col items-center justify-center gap-0.5 text-center",
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
              // Named by the label alone; what it is for and the deciding fact are its description.
              aria-labelledby={`${inputId}-l`}
              aria-describedby={o.detail || o.tag ? `${inputId}-d` : undefined}
              className="sr-only"
            />
            <span className={cn("flex min-w-0 flex-col", !rows && "items-center")}>
              <span
                id={`${inputId}-l`}
                className={cn("tabular", checked ? "font-medium text-fg" : "text-fg")}
              >
                {o.label}
              </span>
              {o.detail && (
                <span className="text-fg-muted text-xs" aria-hidden>
                  {o.detail}
                </span>
              )}
            </span>
            {rows && o.tag && (
              <span className="shrink-0 text-fg-muted text-xs" aria-hidden>
                {o.tag}
              </span>
            )}
            {(o.detail || o.tag) && (
              <span id={`${inputId}-d`} className="sr-only">
                {[o.detail, rows ? o.tag : undefined].filter(Boolean).join(". ")}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
