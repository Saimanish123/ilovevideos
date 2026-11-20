/**
 * The names of what the site keeps in this browser (ADR-0129 to ADR-0131), in one place for the
 * code that reads them and for /privacy, which lists them. Light: imported on every tool page.
 */

/** local storage: the index of kept results, page → when and how large. */
export const KEPT_INDEX_KEY = "kept-results";
/** local storage: a page's remembered settings, `settings:<slug>`. */
export const SETTINGS_PREFIX = "settings:";
/** local storage: a page's saved settings, `presets:<slug>`. */
export const PRESETS_PREFIX = "presets:";

/** Whether the index lists any kept result (one synchronous read; no OPFS access). */
export function anyKeptListed(): boolean {
  try {
    const raw = window.localStorage.getItem(KEPT_INDEX_KEY);
    return !!raw && raw !== "{}";
  } catch {
    return false;
  }
}

/** Kept results older than this are not shown (and are removed by the next tool page). */
export const KEPT_HOURS = 24;

/** Whether the index lists a fresh kept result for this page (synchronous; no OPFS access). */
export function keptListedFor(slug: string, now = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(KEPT_INDEX_KEY);
    const e = raw ? (JSON.parse(raw) as Record<string, { at?: unknown }>)[slug] : undefined;
    return typeof e?.at === "number" && now - e.at >= 0 && now - e.at < KEPT_HOURS * 3600_000;
  } catch {
    return false;
  }
}

/** The drop zone's attribute that reserves room for "Your last result" (ADR-0131). */
export const KEPT_ZONE_ATTR = "data-kept";

/**
 * Inline script placed right after a tool page's stage (tool-page.tsx, a server component). It runs while the HTML is parsed,
 * before first paint, and marks the zone when the index lists a fresh result for this page (the
 * last path segment is the slug), so the zone has its final height before anything is drawn and
 * the row loads into room already there: zero layout shift. Blocked storage or bad data leaves it
 * unmarked. The build hashes it into the page's CSP (scripts/csp-hashes.mjs).
 */
export const keptZoneScript = `(function(){try{var z=document.querySelector('section[aria-label="Workspace"]');var k=JSON.parse(localStorage.getItem(${JSON.stringify(
  KEPT_INDEX_KEY,
)})||"{}");var p=location.pathname.split("/").filter(Boolean);var e=k[p[p.length-1]];if(z&&e&&typeof e.at==="number"&&Date.now()-e.at>=0&&Date.now()-e.at<${KEPT_HOURS * 3600_000})z.setAttribute(${JSON.stringify(
  KEPT_ZONE_ATTR,
)},"")}catch(e){}})()`;
