import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * "More options" disclosure for the region and layer panels: the quiet summary of the compress
 * panel (`text-fg-muted hover:text-fg`) with a chevron that turns when open (transform only, the
 * fast token, none with reduced motion).
 */
export function MoreOptions({
  children,
  label = "More options",
}: {
  children: ReactNode;
  /** The summary text; "More options" unless a page names its own ("More fields"). */
  label?: string;
}) {
  return (
    <details className="group text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="transition-transform duration-(--duration-fast) ease-(--ease-in-out) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="mt-3 flex flex-col gap-6">{children}</div>
    </details>
  );
}
