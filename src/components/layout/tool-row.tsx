import type { ReactNode } from "react";
import { ToolCard } from "@/components/tool/tool-card";
import { Link } from "@/lib/i18n/navigation";
import type { ToolDefinition } from "@/tools/registry/schema";
import { RowControlsLazy } from "./row-controls-lazy";
import { rowAction } from "./row-styles";

/** Card in a home row: its width and snap, and the lift it shares with the hub grids (tokens.css). */
const lift = "card-lift w-3/4 shrink-0 snap-start sm:w-64";
/** The scrolling list: full bleed, first card on the content column, fades where more cards wait. */
const list =
  "row-fade flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain px-gutter pt-6 pb-6 -mb-6 scroll-px-gutter [scrollbar-width:none] md:px-gutter-md md:scroll-px-gutter-md [&::-webkit-scrollbar]:hidden";

/** Heading line of a row, on the content column; the row itself runs to the viewport edges. */
export function RowHeading({
  id,
  children,
  action,
}: {
  id: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-(--container-content) items-baseline justify-between gap-4 px-4 md:px-8">
      <h2 id={id} className="text-balance text-h2">
        {children}
      </h2>
      {action}
    </div>
  );
}

/**
 * One home section as a Netflix-style row (ADR-0154): every standalone tool of a category on one line
 * of illustrated cards, the next card peeking, native scrolling with snap, no loop, no auto-play, no
 * clones. "See all" goes to the hub. Every card is in the HTML, so home links each standalone tool;
 * the arrows, fades and arrow keys are one small client island (row-controls.tsx).
 */
export function ToolRow({
  id,
  title,
  hubHref,
  tools,
  locale,
}: {
  id: string;
  title: string;
  hubHref: string;
  tools: ToolDefinition[];
  locale: string;
}) {
  const label = `${title.toLowerCase()} tools`;
  return (
    // Each row reveals once, as one block, the first time it scrolls into view (ADR-0157).
    <section id={`row-${id}`} aria-labelledby={`row-${id}-heading`} data-reveal>
      <RowHeading
        id={`row-${id}-heading`}
        action={
          <Link
            prefetch={false}
            href={hubHref}
            aria-label={`See all ${label}`}
            className={rowAction}
          >
            See all
          </Link>
        }
      >
        {title}
      </RowHeading>
      <RowList id={`row-${id}`} label={label}>
        {tools.map((t) => (
          <li key={t.slug} data-slug={t.slug} className={lift}>
            <ToolCard tool={t} locale={locale} />
          </li>
        ))}
      </RowList>
    </section>
  );
}

/**
 * The scroller and its controls. `copies` rows (Continue, Because) are filled before hydration by the
 * home page's inline script with copies of cards, so React renders them empty and never touches them.
 */
export function RowList({
  id,
  label,
  children,
  copies = false,
}: {
  id: string;
  label: string;
  children?: ReactNode;
  copies?: boolean;
}) {
  const listId = `${id}-list`;
  const name = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div className="relative">
      {copies ? (
        <ul
          id={listId}
          aria-label={name}
          data-more-end=""
          className={list}
          dangerouslySetInnerHTML={{ __html: "" }}
          suppressHydrationWarning
        />
      ) : (
        <ul
          id={listId}
          aria-label={name}
          data-more-end=""
          className={list}
          suppressHydrationWarning
        >
          {children}
        </ul>
      )}
      <RowControlsLazy listId={listId} label={label} copies={copies} />
    </div>
  );
}
