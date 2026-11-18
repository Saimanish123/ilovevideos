import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** A width class on `className` replaces the default `w-full`: `cn` does not merge conflicting
 * utilities, and stylesheet order (not class order) would decide which width wins. */
const HAS_WIDTH = /(^|\s)(w-|flex-1\b)/;

export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      {...props}
      className={cn(
        "tabular h-10 pointer-coarse:h-11 rounded-md border border-border bg-bg-raised px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        !HAS_WIDTH.test(className ?? "") && "w-full",
        className,
      )}
    />
  );
}
