"use client";

import { useEffect, useRef, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { unitCommit } from "./unit-commit";

/**
 * A number beside a preset control, with its unit shown inside: free typing while focused, clamped
 * on blur or Enter, the shown value following outside changes (a drag on the picture). Whole
 * numbers by default; `decimals` and `step` allow fractions, and a negative `min` allows negatives
 * (the text is free while typing, so "-" and "0." are fine until the commit).
 */
export function UnitField({
  id,
  label,
  value,
  min,
  max,
  unit,
  onCommit,
  step = 1,
  decimals = 0,
  wide = false,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  /** Shown inside the field; omit for a unitless value. */
  unit?: string;
  onCommit: (v: number) => void;
  /** The browser's spin step. Default 1. */
  step?: number;
  /** Decimal places shown and kept. Default 0 (whole numbers). */
  decimals?: number;
  /** A wider field for long numbers or units ("100000 kb/s"). Default false (w-24). */
  wide?: boolean;
}) {
  const shown = String(decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value));
  const [text, setText] = useState(shown);
  // What is in the field now: an Enter right after typing can run before React re-renders, and the
  // commit must not read the text from the render before (measured: the typed value was dropped).
  const latest = useRef(shown);
  const [editing, setEditing] = useState(false);
  // Set at focus, before any re-render, so an outside change cannot overwrite what is being typed.
  const typing = useRef(false);
  useEffect(() => {
    if (!editing && !typing.current) {
      setText(shown);
      latest.current = shown;
    }
  }, [shown, editing]);
  const commit = () => {
    typing.current = false;
    setEditing(false);
    const next = unitCommit(latest.current, shown, { min, max, decimals });
    if (next !== undefined) onCommit(next);
    else setText(shown);
  };
  return (
    <div className={wide ? "relative w-36 shrink-0" : "relative w-24 shrink-0"}>
      <NumberInput
        id={id}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        className={
          wide ? (unit ? "h-11 w-36 pr-12" : "h-11 w-36") : unit ? "h-11 w-24 pr-7" : "h-11 w-24"
        }
        value={text}
        onFocus={() => {
          typing.current = true;
          setEditing(true);
        }}
        onChange={(e) => {
          latest.current = e.target.value;
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {unit && (
        <span
          aria-hidden
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-fg-muted text-sm"
        >
          {unit}
        </span>
      )}
    </div>
  );
}
