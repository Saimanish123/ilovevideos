"use client";

import { useId } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";

/** Named colours for marks drawn on the video; anything else through the custom picker. */
export const MARK_COLOURS = [
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
  { value: "#ffd60a", label: "Yellow" },
  { value: "#ff3b30", label: "Red" },
] as const;

/**
 * A colour for something drawn on the picture: four named presets, and a custom picker that shows
 * the chosen colour and its hex code. The swatch is the user's content colour, not UI chrome.
 */
export function ColourField({
  label = "Colour",
  value,
  onChange,
  disabled,
  hint,
  name,
  presets = true,
  custom = true,
}: {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  hint?: string;
  /** Radio group name, unique on the page. */
  name: string;
  /** False shows the picker alone (a card's colour, where named presets would not help). */
  presets?: boolean;
  /** False leaves the custom picker out (it sits under More options on a busy panel). */
  custom?: boolean;
}) {
  const labelId = useId();
  const pickId = useId();
  const preset = MARK_COLOURS.find((c) => c.value === value.toLowerCase());
  return (
    <Field label={label} labelId={labelId} hint={hint}>
      <div className="flex flex-col gap-2">
        {presets && (
          <Segmented<string>
            name={name}
            aria-labelledby={labelId}
            value={preset?.value ?? ""}
            onChange={(v) => onChange(v)}
            options={MARK_COLOURS.map((c) => ({ value: c.value, label: c.label }))}
          />
        )}
        {custom && (
          <label
            htmlFor={pickId}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "relative min-h-11 w-fit cursor-pointer gap-3 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
            )}
          >
            <span
              aria-hidden
              className="size-6 shrink-0 rounded-full border border-border-strong"
              style={{ backgroundColor: value }}
            />
            {presets && <span>{preset ? "Other colour" : "Custom"}</span>}
            <span className="tabular text-fg-muted">{value.toUpperCase()}</span>
            <input
              id={pickId}
              type="color"
              value={value}
              disabled={disabled}
              aria-label={presets ? `${label}, custom` : label}
              onChange={(e) => onChange(e.target.value.toLowerCase())}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        )}
      </div>
    </Field>
  );
}
