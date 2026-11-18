"use client";

import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cn } from "@/lib/cn";

/**
 * Slider on Base UI (design system §8.4): 4px `border-strong` track, `fg` fill, 16px `fg` thumb with
 * a 1px `bg` ring. The control is 44px tall and the thumb carries a 44px hit area, so it can be
 * dragged one-handed; the drawn parts stay small. Put the exact value in a tabular `NumberInput`
 * beside it for precision (principles §1.9). Dragging tracks the pointer 1:1: nothing animates.
 */
export function Slider({
  value,
  onValueChange,
  onValueCommitted,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
  getAriaValueText,
}: {
  value: number;
  onValueChange: (v: number) => void;
  /** Fires once when the pointer is released or a key press ends; use it for expensive work. */
  onValueCommitted?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Spoken value, e.g. "1080p" or "2.5 seconds". */
  getAriaValueText?: (formatted: string, value: number) => string;
}) {
  return (
    <BaseSlider.Root
      value={value}
      onValueChange={(v) => onValueChange(Array.isArray(v) ? (v[0] ?? min) : v)}
      onValueCommitted={(v) => onValueCommitted?.(Array.isArray(v) ? (v[0] ?? min) : v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-labelledby={labelledBy}
      className={cn("w-full data-disabled:opacity-50", className)}
    >
      <BaseSlider.Control className="flex h-11 w-full touch-none select-none items-center">
        <BaseSlider.Track className="h-1 w-full rounded-full bg-border-strong">
          <BaseSlider.Indicator className="rounded-full bg-fg" />
          <BaseSlider.Thumb
            aria-label={ariaLabel}
            getAriaValueText={getAriaValueText}
            className="relative size-4 rounded-full bg-fg ring-1 ring-bg after:absolute after:-inset-3.5 after:content-[''] has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
