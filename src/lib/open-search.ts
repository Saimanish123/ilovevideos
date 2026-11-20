/**
 * Opens the site search from anywhere on the page (the home hero, ADR-0155): the header's trigger
 * listens and opens the palette, or the sheet on phones, with the text or files carried over. A
 * window event, so the hero ships no search code of its own.
 */
export const OPEN_SEARCH_EVENT = "open-search";

export interface OpenSearchDetail {
  /** Text to start the search with (what was typed into the hero field). */
  query?: string;
  /** Files to suggest tools for, in place of the search list. */
  files?: File[];
}

export function openSearch(detail: OpenSearchDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenSearchDetail>(OPEN_SEARCH_EVENT, { detail }));
}
