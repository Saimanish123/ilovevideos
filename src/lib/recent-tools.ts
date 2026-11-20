/**
 * Tools opened in this browser, newest first (ADR-0124, ADR-0155). Kept in localStorage and
 * nowhere else: no request carries them, and the privacy page says what is kept and how to clear
 * it. Every access is wrapped, so a browser that blocks storage simply has no recents.
 *
 * Each entry keeps the title as well as the slug, so search and the home rows can show it without
 * loading the tool index. Titles are refreshed whenever the page is opened again.
 */

export interface RecentTool {
  slug: string;
  title: string;
}

/** The storage keys; the home page's inline script (homeRowsScript) reads them too. */
export const RECENT_KEY = "recent-tools";
/** Written by an earlier version (per-section counts); removed on the next write. */
const OLD_USES_KEY = "tool-uses";
/** Kept; search shows 3, the home Continue row up to 8. */
export const RECENT_MAX = 8;

const listeners = new Set<() => void>();
let cached: RecentTool[] | undefined;

function parse(raw: string | null): RecentTool[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (e): e is RecentTool =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as RecentTool).slug === "string" &&
          typeof (e as RecentTool).title === "string" &&
          /^[a-z0-9-]+$/.test((e as RecentTool).slug),
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readRecent(): RecentTool[] {
  if (cached) return cached;
  try {
    cached = parse(storage()?.getItem(RECENT_KEY) ?? null);
  } catch {
    cached = [];
  }
  return cached;
}

function write(list: RecentTool[]) {
  cached = list;
  try {
    const s = storage();
    if (list.length) s?.setItem(RECENT_KEY, JSON.stringify(list));
    else s?.removeItem(RECENT_KEY);
    s?.removeItem(OLD_USES_KEY);
  } catch {
    // Storage full or blocked: the list lives for this page only.
  }
  for (const l of listeners) l();
}

/** Moves a tool to the front (adds it when new). */
export function rememberTool(slug: string, title: string): void {
  const rest = readRecent().filter((r) => r.slug !== slug);
  write([{ slug, title }, ...rest].slice(0, RECENT_MAX));
}

/** Forgets the recents. */
export function clearRecent(): void {
  write([]);
}

/** For useSyncExternalStore: changes from this tab and from other tabs. */
export function subscribeRecent(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== RECENT_KEY && e.key !== null) return;
    cached = undefined;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const none: RecentTool[] = [];
/** Server render and hydration: nothing. */
export const serverRecent = (): RecentTool[] => none;

/** Cards in the home Continue and Because rows. */
export const PERSONAL_ROW_MAX = 8;

/**
 * Fills the home page's personal rows (ADR-0155), from data in this browser only:
 * - Continue: copies of the cards of the recent tools, newest first, into the hidden first row.
 * - Because you used <last tool>: copies of that tool's related standalone tools (`related`, by card
 *   position on the page), minus those already in Continue.
 * The category rows keep the editorial order (design review: a reordered page would differ from the
 * focus order).
 * It runs twice at most: as an inline script while the HTML is parsed, before React hydrates (the
 * rows sit below the first screen and are filled before they are painted), and from HomeRowsFill on a
 * client-side visit to home, where no inline script runs. Self-contained (it is inlined with
 * Function#toString): no imports, no outer names. Blocked storage or bad data leaves the editorial
 * page.
 */
export function fillHomeRows(
  doc: Document,
  store: Pick<Storage, "getItem">,
  related: number[][],
): void {
  try {
    const recent = JSON.parse(store.getItem("recent-tools") || "[]");
    if (!Array.isArray(recent)) return;
    const max = 8;
    const cards = Array.prototype.slice.call(doc.querySelectorAll("#tools li[data-slug]"));
    const pos: Record<string, number> = {};
    cards.forEach((c: Element, i: number) => {
      pos[c.getAttribute("data-slug") || ""] = i;
    });
    const fill = (id: string, list: number[]) => {
      const ul = doc.getElementById(`${id}-list`);
      const row = doc.getElementById(id);
      if (!ul || !row) return;
      while (ul.firstChild) ul.removeChild(ul.firstChild);
      for (const i of list) {
        const copy = cards[i].cloneNode(true) as Element;
        copy.removeAttribute("data-slug");
        ul.appendChild(copy);
      }
      row.hidden = false;
    };
    const shown: number[] = [];
    for (const r of recent) {
      const i = r && typeof r.slug === "string" ? pos[r.slug] : undefined;
      if (typeof i === "number" && shown.length < max && shown.indexOf(i) < 0) shown.push(i);
    }
    if (!shown.length) return;
    fill("row-continue", shown);
    let last: { slug: string; title: string } | undefined;
    for (const r of recent) if (!last && r && typeof pos[r.slug] === "number") last = r;
    const because = (last ? related[pos[last.slug] as number] || [] : [])
      .filter((i) => shown.indexOf(i) < 0)
      .slice(0, max);
    const title = doc.getElementById("row-because-title");
    if (because.length && last && title) {
      title.textContent = String(last.title);
      fill("row-because", because);
    }
  } catch {
    // Anything unexpected leaves the editorial page.
  }
}

/**
 * The inline-script form of fillHomeRows for the home page (hashed into its CSP at build). The data
 * rides on #tools as data-related, once, for this script and for HomeRowsFill.
 */
export const homeRowsScript = `try{var t=document.getElementById("tools");(${fillHomeRows.toString()})(document,localStorage,JSON.parse(t.dataset.related))}catch(e){}finally{try{document.getElementById("tools").style.visibility=""}catch(e){}}`;

/**
 * Placed first inside #tools: with recent tools stored, the rows stay invisible (their space kept)
 * until homeRowsScript has run at their end, so a row drawn early never moves when Continue and
 * Because appear. Without recents it does nothing.
 */
export const homeRowsHoldScript = `try{var r=JSON.parse(localStorage.getItem(${JSON.stringify(RECENT_KEY)})||"[]");if(Array.isArray(r)&&r.length)document.getElementById("tools").style.visibility="hidden"}catch(e){}`;
