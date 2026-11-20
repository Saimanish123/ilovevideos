"use client";

import { discovery } from "@/content/site/discovery";
import { clearRecent } from "@/lib/recent-tools";
import { rowAction } from "./row-styles";

/**
 * "Clear" on the home Continue row (ADR-0124, ADR-0155): forgets this browser's recents and section
 * hides the Continue and Because rows and moves
 * focus to the next row's "See all" instead of letting it fall to the page.
 */
export function ClearRecent() {
  return (
    <button
      type="button"
      className={rowAction}
      onClick={() => {
        clearRecent();
        for (const id of ["row-continue", "row-because"]) {
          const row = document.getElementById(id);
          if (row) row.hidden = true;
        }
        document.querySelector<HTMLAnchorElement>("#tools > section:not([hidden]) a")?.focus();
      }}
    >
      {discovery.clearRecent}
      <span className="sr-only"> recent tools</span>
    </button>
  );
}
