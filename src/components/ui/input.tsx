"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Text input on Base UI (design system §8.4): 40px (44px on touch), `radius-md`, `bg-raised`, 1px
 * `border`, `text-sm`. Focus draws the 2px ring at a 2px offset and the border stays. Pair it with
 * `Field` for the label and hint. On touch the text is 16px so iOS does not zoom the page on focus.
 */
export function Input({ className, ...props }: ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-border bg-bg-raised px-3 text-fg text-sm pointer-coarse:h-11 pointer-coarse:text-body placeholder:text-fg-muted transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
    />
  );
}
