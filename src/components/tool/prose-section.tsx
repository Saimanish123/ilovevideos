import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One section of a tool page's reading content (what it does, how to use it, good to know,
 * questions) as a native disclosure, so the page stays short and the text stays in the HTML for
 * search engines (and for find-in-page in Chromium, which opens a closed <details> on a match).
 * The summary holds the section's h2, so the outline is unchanged. Rows are separated by a
 * hairline, like the FAQ list; the chevron turns with the same motion as "More options" (fast
 * token, none with reduced motion) and darkens on hover, like the other disclosures. The row's
 * height opens with it where the browser can animate it (`fold`, ADR-0157).
 */
export function ProseSection({
  id,
  title,
  open = false,
  children,
}: {
  id: string;
  title: string;
  /** Open on first load (the short "What this does"); the long sections start closed. */
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group fold border-border border-t">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <h2 id={id} className="text-h3">
          {title}
        </h2>
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          aria-hidden
          className="shrink-0 text-fg-muted transition-[color,transform] group-hover:text-fg duration-(--duration-fast) ease-(--ease-in-out) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="pb-8">{children}</div>
    </details>
  );
}
