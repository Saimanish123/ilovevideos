/**
 * Search over the tool registry for the command palette (feature catalog L4). Pure and synchronous:
 * the query is matched on this device and never sent anywhere. The index is the registry reduced to
 * what a search needs (title, aliases, keywords, category), built once at build time
 * (`app/tool-index.json`), so the palette never ships the registry's page content.
 */

export interface ToolIndexEntry {
  slug: string;
  title: string;
  /** Category title, shown beside the result ("Convert"). */
  category: string;
  /** Category order, for the unfiltered list. */
  order: number;
  aliases: string[];
  keywords: string[];
  /** Generated family (compress-size...): searchable, but left out of the unfiltered list. */
  family?: string;
}

interface IndexSource {
  slug: string;
  category: string;
  aliases: string[];
  keywords: string[];
  family?: string;
  content: { en: { title: string } };
}

export function buildToolIndex(
  tools: readonly IndexSource[],
  categories: readonly { id: string; title: string; order: number }[],
): ToolIndexEntry[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return tools.map((t) => ({
    slug: t.slug,
    title: t.content.en.title,
    category: byId.get(t.category)?.title ?? t.category,
    order: byId.get(t.category)?.order ?? 99,
    aliases: t.aliases,
    keywords: t.keywords,
    ...(t.family ? { family: t.family } : {}),
  }));
}

/** Lowercase, accents off, punctuation to spaces; "8mb" and "8 MB" read the same. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)\s*(kb|mb|gb)\b/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Words that carry no intent on their own ("mov to mp4", "compress a video online").
const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "into",
  "of",
  "for",
  "in",
  "my",
  "and",
  "online",
  "free",
]);

/** Characters of `t` in order inside `w`, tightly: 0 when absent, higher when the span is short. */
function subsequence(t: string, w: string): number {
  let i = 0;
  let start = -1;
  for (let j = 0; j < w.length && i < t.length; j++) {
    if (w[j] === t[i]) {
      if (start < 0) start = j;
      i++;
      if (i === t.length) return t.length / (j - start + 1);
    }
  }
  return 0;
}

/** How well one query token matches one field: exact word, word prefix, substring, then fuzzy. */
function tokenScore(t: string, field: string, words: string[]): number {
  if (field === t) return 100;
  let best = 0;
  for (const [i, w] of words.entries()) {
    if (w === t) best = Math.max(best, i === 0 ? 90 : 80);
    else if (w.startsWith(t))
      best = Math.max(best, (i === 0 ? 70 : 60) * Math.min(1, t.length / 3));
  }
  if (best) return best;
  if (t.length >= 2 && field.includes(t)) return 40;
  if (t.length >= 3) {
    let fuzzy = 0;
    for (const w of words) fuzzy = Math.max(fuzzy, subsequence(t, w));
    // Tight subsequences only ("cmprs" in "compress"), never letters scattered across a long word.
    if (fuzzy >= 0.6) return 25 * fuzzy;
  }
  return 0;
}

interface Prepared {
  entry: ToolIndexEntry;
  fields: { text: string; words: string[]; weight: number }[];
  title: string;
  slug: string;
}

const cache = new WeakMap<ToolIndexEntry[], Prepared[]>();
function prepare(index: ToolIndexEntry[]): Prepared[] {
  const hit = cache.get(index);
  if (hit) return hit;
  const field = (s: string, weight: number) => {
    const text = normalize(s);
    return { text, words: text.split(" ").filter(Boolean), weight };
  };
  const out = index.map((entry) => ({
    entry,
    title: normalize(entry.title),
    slug: normalize(entry.slug),
    fields: [
      field(entry.title, 1),
      field(entry.slug, 0.85),
      ...entry.aliases.map((a) => field(a, 0.9)),
      ...entry.keywords.map((k) => field(k, 0.7)),
      field(entry.category, 0.4),
    ],
  }));
  cache.set(index, out);
  return out;
}

/**
 * Ranked matches for a query. Every meaningful word must match somewhere (title, slug, alias,
 * keyword or category), best field per word; a title that starts with the whole query ranks first.
 * An empty query lists every tool outside a generated family, in category order.
 */
export function searchTools(index: ToolIndexEntry[], query: string, limit = 30): ToolIndexEntry[] {
  const q = normalize(query);
  if (!q) {
    return index
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !e.family)
      .sort((a, b) => a.e.order - b.e.order || a.i - b.i)
      .map(({ e }) => e);
  }
  const all = q.split(" ").filter(Boolean);
  const meaningful = all.filter((t) => !STOP.has(t));
  const tokens = meaningful.length ? meaningful : all;
  const scored: { e: ToolIndexEntry; score: number; i: number }[] = [];
  for (const [i, p] of prepare(index).entries()) {
    let total = 0;
    let missed = false;
    for (const t of tokens) {
      let best = 0;
      for (const f of p.fields) best = Math.max(best, tokenScore(t, f.text, f.words) * f.weight);
      if (best === 0) {
        missed = true;
        break;
      }
      total += best;
    }
    if (missed) continue;
    // Words that meet in one field ("mov" and "mp4" in one title) beat words spread across several.
    if (tokens.length > 1) {
      let together = 0;
      for (const f of p.fields)
        if (tokens.every((t) => tokenScore(t, f.text, f.words) > 0))
          together = Math.max(together, 40 * f.weight);
      total += together;
      // ...and in the order typed: "srt vtt" is SRT to WebVTT, not the reverse.
      const at = tokens.map((t) => p.slug.indexOf(t));
      if (at.every((x, k) => x >= 0 && (k === 0 || x > (at[k - 1] ?? -1)))) total += 20;
    }
    if (p.title.startsWith(q)) total += 60;
    else if (p.title.includes(q)) total += 30;
    // A hub page beats its generated family members on the same words.
    if (p.entry.family) total -= 5;
    scored.push({ e: p.entry, score: total, i });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.e.title.length - b.e.title.length || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.e);
}
