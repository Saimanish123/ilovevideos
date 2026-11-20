import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Indeterminate loader for a button's leading icon slot (README.md#design-system §8.1, loading
 * state): 16px, stroke 1.5, a linear spin that stops under reduced motion. Decorative; the control
 * it sits in carries `aria-busy` and keeps its label.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      size={16}
      strokeWidth={1.5}
      aria-hidden
      className={cn("animate-spin motion-reduce:animate-none", className)}
    />
  );
}
