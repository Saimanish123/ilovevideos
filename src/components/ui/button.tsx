import { cva, type VariantProps } from "cva";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * See README.md#design-system §8.1. Exactly one `primary` button visible per screen state.
 * Radius follows size: `lg` (the page-level action and its counterpart) is a pill; `sm`/`md` are `md`.
 */
export const buttonVariants = cva({
  base: "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[background-color,color,border-color,scale,translate] duration-(--duration-fast) ease-out not-focus-visible:active:scale-97 disabled:active:scale-100 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
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
      // A link to another page drawn as a pill (related tools): raised surface, hairline border, and
      // the hover changes the border only, like the header's search field.
      chip: "bg-bg-raised text-fg border border-border hover:border-border-strong",
      // A plain text action in a list (a saved entry): no fill, underline on hover, flush left.
      text: "text-fg hover:underline decoration-1 underline-offset-3",
    },
    size: {
      sm: "h-8 rounded-md px-3 text-sm",
      md: "h-10 pointer-coarse:h-11 rounded-md px-4 text-sm",
      lg: "h-12 rounded-full px-6 text-body",
      // A pill at least 44px tall whose label may wrap (put it in a `whitespace-normal` span); the
      // height grows with the text instead of truncating it.
      pill: "min-h-11 rounded-full px-4 py-2 text-sm text-center",
      // No padding, so the text lines up with the column; still a 44px target.
      bare: "min-h-11 rounded-sm px-0 text-sm",
      // A round icon-only button, 44px (row arrows). Always give it an aria-label.
      icon: "size-11 rounded-full p-0",
      // A picture as the whole button (a suggested frame): no padding, the picture fills it.
      tile: "rounded-md p-0 overflow-hidden",
    },
  },
  compoundVariants: [
    // A pill that links to another page (related tools, a hub's tasks) lifts 2 px under a resting
    // pointer, the home cards' gesture at a pill's scale (ADR-0157): transform only, on fine pointers,
    // up at the fast duration, back at the instant one. Not on keyboard focus, not with reduced motion.
    {
      variant: "chip",
      size: "pill",
      class:
        "pointer-fine:motion-safe:hover:-translate-y-0.5 pointer-fine:not-hover:duration-(--duration-instant)",
    },
  ],
  defaultVariants: { variant: "secondary", size: "md" },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
