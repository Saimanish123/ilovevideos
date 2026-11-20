/**
 * Searches that fail, counted so the intent table (`content/site/search-intents.ts`) can grow from
 * what people really type (ADR-0150, ADR-0152). This module is the browser half and the rules both
 * halves share; the route (`app/api/search-miss/route.ts`) checks every body against the same rules.
 *
 * What is sent, once per query per page session, to this site only:
 *   { q: the query as search reads it (`normalize`), at most 80 characters,
 *     results: how many tools it listed, opened: false, zero: results === 0 }
 * Nothing else: no file, no file name (choosing a file is not a search), no id, no cookie, no time.
 * A query that looks like an address, a path or a long number is not sent at all.
 */
import { normalize } from "@/lib/tool-search";

export const SEARCH_MISS_URL = "/api/search-miss";
/** Longest query sent, in characters, after normalising; longer ones are cut at a word. */
export const MAX_QUERY = 80;
/** Shortest query worth counting: one letter says nothing about a job. */
export const MIN_QUERY = 2;
/** The palette lists at most 8; anything above this is not a count the palette can send. */
export const MAX_RESULTS = 50;
/** How long the query must stay unchanged before a zero-result search counts (not per keystroke). */
export const SETTLE_MS = 1200;

export interface SearchMiss {
  q: string;
  results: number;
  opened: false;
  zero: boolean;
}

// An e-mail address, a web or file path, or a run of five digits (a phone number, a camera's file
// name such as IMG_20241119): not a description of a job, and possibly personal.
const PERSONAL = /@|:\/\/|www\.|\\|\d{5,}/i;

/**
 * The query as it is counted: normalised the way search reads it, cut to `MAX_QUERY` at a word
 * boundary. Undefined when it is too short or looks personal (then nothing is sent).
 */
export function missQuery(raw: string): string | undefined {
  if (PERSONAL.test(raw)) return undefined;
  const q = normalize(raw);
  if (q.length < MIN_QUERY || PERSONAL.test(q)) return undefined;
  if (q.length <= MAX_QUERY) return q;
  const cut = q.slice(0, MAX_QUERY + 1);
  const space = cut.lastIndexOf(" ");
  return (space >= MIN_QUERY ? cut.slice(0, space) : cut.slice(0, MAX_QUERY)).trim();
}

/** The body for a failed search, or undefined when the query is not counted. */
export function missPayload(raw: string, results: number): SearchMiss | undefined {
  const q = missQuery(raw);
  if (!q) return undefined;
  const n = Math.max(0, Math.min(MAX_RESULTS, Math.floor(results)));
  return { q, results: n, opened: false, zero: n === 0 };
}

type Send = (url: string, body: string) => void;

/**
 * Same-origin, fire and forget. `sendBeacon` survives the page closing; where it is missing or
 * refuses, a keepalive POST. Any failure (offline, blocked, a 4xx) is silent: search works the same.
 * The body goes as text, so no preflight and no content-type the beacon might refuse.
 */
const beacon: Send = (url, body) => {
  try {
    if (navigator.sendBeacon?.(url, body)) return;
  } catch {
    // Some browsers throw instead of returning false; fall through.
  }
  try {
    void fetch(url, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(
      () => undefined,
    );
  } catch {
    // No network API at all: nothing to do.
  }
};

/**
 * Queries already sent while this page is open (one count per query per session). Kept in memory
 * only: moving between pages keeps it (the site navigates in place), a reload starts again.
 */
const sent = new Set<string>();

/**
 * Sends one failed search, unless the same query was already sent in this session or it is not
 * counted. Returns whether a beacon went out.
 */
export function reportSearchMiss(raw: string, results: number, send: Send = beacon): boolean {
  const body = missPayload(raw, results);
  if (!body || sent.has(body.q)) return false;
  sent.add(body.q);
  try {
    send(SEARCH_MISS_URL, JSON.stringify(body));
  } catch {
    // Never let counting break search.
  }
  return true;
}

/** Tests only: forget what this session sent. */
export function resetSearchMissSession(): void {
  sent.clear();
}
