import { cva, type VariantProps } from "cva";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** See docs/06-design-system.md §8.1. Exactly one `primary` button visible per screen state. */
export const buttonVariants = cva({
  base: "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none transition-[background-color,color,border-color] duration-(--duration-instant) ease-out disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
  variants: {
    variant: {
      primary: "bg-accent text-accent-fg hover:bg-gray-800 dark:hover:bg-gray-200",
      secondary: "bg-bg text-fg border border-border hover:bg-bg-subtle",
      ghost: "text-fg hover:bg-bg-subtle",
      destructive:
        "bg-bg text-fg border border-border hover:text-destructive hover:border-destructive",
    },
    size: {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-5 text-body",
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
