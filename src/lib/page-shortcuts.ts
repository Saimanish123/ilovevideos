/**
 * The open tool page's own keys, for the "?" dialog in the site header (which lives outside the
 * stage). The stage publishes them while it is mounted; module memory, nothing persisted.
 */
export interface PageShortcut {
  keys: string;
  label: string;
}

let current: { items: readonly PageShortcut[]; player: boolean } = { items: [], player: false };
const listeners = new Set<() => void>();

export function setPageShortcuts(items: readonly PageShortcut[], player: boolean): void {
  current = { items, player };
  for (const l of listeners) l();
}

export function getPageShortcuts() {
  return current;
}

export function subscribePageShortcuts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The event the footer's "Keyboard shortcuts" link sends; the header's trigger opens the dialog. */
export const OPEN_SHORTCUTS_EVENT = "open-shortcuts";
