"use client";

import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react";

/**
 * Where "Saved settings" sits (ADR-0129): at the end of the page's own "More options" when the
 * panel has one, so a page never shows two disclosures; otherwise the stage shows its own row. The
 * first `MoreOptions` under the stage claims the content; the stage then shows only "Reset to
 * defaults". Light: `MoreOptions` reads it on every page with a panel.
 */
export const SavedSlotClaim = createContext<((own: (v: boolean) => void) => () => void) | null>(
  null,
);
export const SavedSlotContent = createContext<ReactNode>(null);

/** In `MoreOptions`: the saved-settings content when this disclosure holds it, else null. */
export function useSavedSlot(): ReactNode {
  const claim = useContext(SavedSlotClaim);
  const content = useContext(SavedSlotContent);
  const [own, setOwn] = useState(false);
  // Before paint, so the stage's own row never shows for a frame on a page that holds it here.
  useLayoutEffect(() => (claim ? claim(setOwn) : undefined), [claim]);
  return own ? content : null;
}
