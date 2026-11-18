import { cva, type VariantProps } from "cva";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * See README.md#design-system §8.1. Exactly one `primary` button visible per screen state.
 * Radius follows size: `lg` (the page-level action and its counterpart) is a pill; `sm`/`md` are `md`.
 */
export const buttonVariants = cva({
  base: "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[background-color,color,border-color,scale] duration-(--duration-fast) ease-out not-focus-visible:active:scale-97 disabled:active:scale-100 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
  variants: {
    variant: {
      primary: "bg-accent text-accent-fg hover:bg-accent-hover",
      secondary: "bg-bg text-fg border border-border hover:bg-bg-subtle",
      ghost: "text-fg hover:bg-bg-subtle",
      // Ghost for controls on a `bg-subtle` surface (list rows, wells): ghost's hover fill would
      // be the surface's own colour there and show nothing.
      quiet: "text-fg hover:bg-bg-raised",
      destructive:
        "bg-bg text-fg border border-border hover:text-destructive hover:border-destructive",
    },
    size: {
      sm: "h-8 rounded-md px-3 text-sm",
      md: "h-10 pointer-coarse:h-11 rounded-md px-4 text-sm",
      lg: "h-12 rounded-full px-6 text-body",
      // A picture as the whole button (a suggested frame): no padding, the picture fills it.
      tile: "rounded-md p-0 overflow-hidden",
    },
  },
  defaultVariants: { variant: "secondary", size: "md" },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
