"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Select on Base UI (design system §8.4): trigger 40px, popup elevation 2, items 36px (44px on
 * touch). Enter scale 0.95→1 + fade at `dur-base`, exit at `dur-fast`; origin follows the anchor.
 */
export function Select<T extends string>({
  id,
  value,
  onValueChange,
  options,
  "aria-labelledby": labelledBy,
}: {
  id?: string;
  value: T;
  onValueChange: (v: T) => void;
  options: SelectOption<T>[];
  "aria-labelledby"?: string;
}) {
  return (
    <BaseSelect.Root<T>
      value={value}
      onValueChange={(v) => {
        if (v !== null) onValueChange(v);
      }}
      items={options}
    >
      <BaseSelect.Trigger
        id={id}
        aria-labelledby={labelledBy}
        className="flex h-10 pointer-coarse:h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-bg-raised pr-4 pl-3 text-left text-fg text-sm transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 data-popup-open:border-border-strong"
      >
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="flex shrink-0 text-fg-muted">
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={8}
          alignItemWithTrigger={false}
          className="z-50 select-none outline-none"
        >
          <BaseSelect.Popup className="max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-md bg-bg-raised py-1 shadow-2 transition-[transform,opacity] duration-(--duration-base) ease-(--ease-out) data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast) data-starting-style:scale-95 data-starting-style:opacity-0">
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className="grid min-h-9 cursor-default pointer-coarse:min-h-11 grid-cols-[1rem_1fr] items-center gap-2 px-3 text-sm outline-none data-highlighted:bg-bg-subtle data-selected:font-medium"
                >
                  <BaseSelect.ItemIndicator className="col-start-1 flex">
                    <Check size={16} strokeWidth={1.5} aria-hidden />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2">{o.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
