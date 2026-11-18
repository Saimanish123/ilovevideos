"use client";

import { OPEN_SHORTCUTS_EVENT } from "@/lib/page-shortcuts";

/**
 * Footer entry to the list of keyboard shortcuts and gestures, for people who do not know "?" and
 * for touch devices, which have no keys to press. The header's trigger owns the dialog.
 */
export function ShortcutsLink({ className }: { className: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}
    >
      Shortcuts
    </button>
  );
}
