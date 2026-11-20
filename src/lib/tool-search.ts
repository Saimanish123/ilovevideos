/**
 * Search over the tool registry for the command palette and the phone search sheet (feature catalog
 * L4, ADR-0123). Pure and synchronous: the query is matched on this device; nothing here sends it (a
 * search that fails is counted by `lib/search-miss`, ADR-0150).
 * The index is the registry reduced to what a search needs (title, aliases, keywords, category) plus
 * the hand-written intent table (`content/site/search-intents.ts`), built once at build time
 * (`app/tool-index.json`), so neither ships with a page: both load when search is first opened.
 *
 * Ranking is best coverage, not "every word must match": each word counts by how rare it is across
 * the tools (a word every tool shares says little), words that match nothing anywhere are ignored,
 * and a tool needs at least half the query's weight. Intent phrases ("too big", "won't play",
 * "whatsapp") add a boost to the pages that do that job, the first listed most.
 */

export interface ToolIndexEntry {
  slug: string;
  title: string;
  /** Category title, shown beside the result ("Convert"). */
  category: string;
  /** Category id, for the hub link (`/tools/<id>`). */
  categoryId?: string;
  /** Category order, for the unfiltered list. */
  order: number;
  aliases: string[];
  keywords: string[];
  /** Generated family (compress-size...): searchable, but left out of the unfiltered list. */
  family?: string;
  /** What the page takes ("video", "audio"...): a query about a song leans to the audio pages. */
  accepts?: string[];
  /** Intent phrases that point here, with their weight (1 for the main answer). */
  intents?: { p: string; w: number }[];
  /**
   * A generated page (format pair, size or platform preset; ADR-0154). It is a result only when the
   * query names it: every word of one of `names` is in the query ("mov mp4", "8 mb", "discord").
   */
  generated?: true;
  names?: string[];
}

/** A way into the catalogue when the query is empty or matches nothing: a category hub. */
export interface SearchGroup {
  id: string;
  /** The task, as people say it ("Make a video smaller"). */
  label: string;
  href: string;
}

/** What `/tool-index.json` serves: the tools, then the task groups shown before anything is typed. */
export interface SearchPayload {
  tools: ToolIndexEntry[];
  groups: SearchGroup[];
}

export interface SearchIntent {
  phrases: readonly string[];
  /** Pages for this intent, the best answer first. Slugs missing from the registry are skipped. */
  slugs: readonly string[];
  /** Below 1 for context words that only lean towards a page ("iphone", "windows"). */
  weight?: number;
  /** The phrases name the page (a platform): a generated page among `slugs` may then be a result. */
  names?: true;
}

interface IndexSource {
  slug: string;
  category: string;
  aliases: string[];
  keywords: string[];
  family?: string;
  accepts?: readonly string[];
  presetOptions?: Record<string, unknown>;
  content: { en: { title: string } };
}

/** The words that name a generated page: its two formats, its size, and its own keywords. */
function namesOf(t: IndexSource): string[] {
  const out = new Set<string>(t.keywords);
  const pair = /^([a-z0-9]+)-to-([a-z0-9]+)$/.exec(t.slug);
  if (pair) out.add(`${pair[1]} ${pair[2]}`);
  const size = /-under-(\d+)mb$/.exec(t.slug);
  if (size) out.add(`${size[1]} mb`);
  return [...out];
}

export function buildToolIndex(
  tools: readonly IndexSource[],
  categories: readonly { id: string; title: string; order: number }[],
  intents: readonly SearchIntent[] = [],
): ToolIndexEntry[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const entries: ToolIndexEntry[] = tools.map((t) => ({
    slug: t.slug,
    title: t.content.en.title,
    category: byId.get(t.category)?.title ?? t.category,
    categoryId: t.category,
    order: byId.get(t.category)?.order ?? 99,
    aliases: t.aliases,
    keywords: t.keywords,
    ...(t.family ? { family: t.family } : {}),
    ...(t.accepts ? { accepts: [...t.accepts] } : {}),
    ...(t.family || t.presetOptions?.lockTarget === true
      ? { generated: true as const, names: namesOf(t) }
      : {}),
  }));
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  for (const intent of intents) {
    const present = intent.slugs.filter((s) => bySlug.has(s));
    present.forEach((slug, rank) => {
      const e = bySlug.get(slug);
      if (!e) return;
      // The main answer counts fully; the others lean (0.7, 0.6, then 0.5).
      const w =
        Math.round(
          (intent.weight ?? 1) * (rank === 0 ? 1 : Math.max(0.5, 0.8 - 0.1 * rank)) * 100,
        ) / 100;
      e.intents ??= [];
      for (const p of intent.phrases) e.intents.push({ p, w });
      if (intent.names && e.generated) e.names = [...(e.names ?? []), ...intent.phrases];
    });
  }
  return entries;
}

/** Lowercase, accents and apostrophes off, punctuation to spaces; "8mb" and "8 MB" read the same. */
export function normalize(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’‘`]/g, "")
      // "H.264", "h 264" and "h264" are one word; "WebVTT" is VTT, as in the file extension.
      .replace(/\bh\s*\.?\s*(26[45])\b/g, "h$1")
      .replace(/\bwebvtt\b/g, "vtt")
      .replace(/(\d)\s*(kb|mb|gb)\b/g, "$1 $2")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/** Plural and singular read the same ("subtitles", "bars"); never below three letters. */
export function stem(w: string): string {
  return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

const words = (s: string) => normalize(s).split(" ").filter(Boolean).map(stem);

// Words that carry no intent on their own ("how do I compress a video online for free").
const STOP = new Set(
  [
    "a",
    "an",
    "the",
    "to",
    "into",
    "of",
    "for",
    "in",
    "on",
    "my",
    "and",
    "or",
    "online",
    "free",
    "how",
    "do",
    "doe",
    "i",
    "can",
    "you",
    "want",
    "need",
    "please",
    "with",
    "from",
    "it",
    "is",
    "this",
    "that",
    "me",
    "way",
    "best",
    "tool",
    "app",
    "software",
    "program",
    "file",
    "quickly",
    "easily",
    "easy",
    "fast",
    "quick",
    "make",
    "get",
    "turn",
    "help",
    "some",
    "so",
    "be",
    "am",
    "are",
  ].map(stem),
);

// Promises every page here keeps: they say nothing about which tool ("no watermark" is not "add a
// watermark"). Removed before the words are read.
const NOISE = [
  "without a watermark",
  "without watermark",
  "no watermark",
  "without watermarks",
  "without uploading",
  "without upload",
  "no upload",
  "no sign up",
  "no signup",
  "no account",
  "without an account",
  "without losing quality",
  "without quality loss",
  "no quality loss",
  "for free",
  "in the browser",
  "in browser",
].map(normalize);

function stripNoise(q: string): string {
  let out = ` ${q} `;
  for (const n of NOISE) out = out.replaceAll(` ${n} `, " ");
  return out.trim();
}

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

/** Edit distance with adjacent swaps (optimal string alignment), stopping early past `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i] as number[];
      const prev = d[i - 1] as number[];
      let v = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, ((d[i - 2] as number[])[j - 2] as number) + 1);
      row[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return (d[a.length] as number[])[b.length] as number;
}

/** A typo allowance: one slip from five letters, two from nine; short words must be exact. */
const allowed = (t: string) => (t.length >= 9 ? 2 : t.length >= 5 ? 1 : 0);
const near = (t: string, w: string) => {
  if (t === w) return true;
  const max = Math.min(allowed(t), allowed(w));
  return max > 0 && editDistance(t, w, max) <= max;
};

/** How well one query word matches one field: exact word, word prefix, substring, then fuzzy. */
function tokenScore(t: string, field: string, fieldWords: string[]): number {
  if (field === t) return 100;
  let best = 0;
  for (const [i, w] of fieldWords.entries()) {
    if (w === t) best = Math.max(best, i === 0 ? 90 : 80);
    else if (w.startsWith(t))
      best = Math.max(best, (i === 0 ? 70 : 60) * Math.min(1, t.length / 3));
  }
  if (best) return best;
  if (t.length >= 2 && field.includes(t)) return 40;
  if (t.length >= 3) {
    let fuzzy = 0;
    for (const w of fieldWords) {
      // A slip or a swapped pair ("compres", "discrod") reads as the word.
      if (near(t, w)) return 50;
      fuzzy = Math.max(fuzzy, subsequence(t, w));
    }
    // Tight subsequences only ("cmprs" in "compress"), never letters scattered across a long word.
    if (fuzzy >= 0.6) return 25 * fuzzy;
  }
  return 0;
}

interface Field {
  text: string;
  words: string[];
  weight: number;
}

interface Prepared {
  entry: ToolIndexEntry;
  fields: Field[];
  title: string;
  slug: string;
  /** For a generated page: the word sets that name it (stop words out). */
  names: string[][];
}

interface PreparedIndex {
  items: Prepared[];
  /** Each intent phrase once, as words, with the tools it points to. */
  phrases: { words: string[]; targets: { at: number; w: number }[] }[];
}

const cache = new WeakMap<ToolIndexEntry[], PreparedIndex>();
function prepare(index: ToolIndexEntry[]): PreparedIndex {
  const hit = cache.get(index);
  if (hit) return hit;
  const field = (s: string, weight: number): Field => {
    const ws = words(s);
    return { text: ws.join(" "), words: ws, weight };
  };
  const items = index.map((entry) => ({
    entry,
    title: normalize(entry.title),
    slug: normalize(entry.slug),
    names: (entry.names ?? [])
      .map((n) => words(n).filter((w) => !STOP.has(w)))
      .filter((ws) => ws.length > 0),
    fields: [
      field(entry.title, 1),
      field(entry.slug, 0.85),
      ...entry.aliases.map((a) => field(a, 0.9)),
      ...entry.keywords.map((k) => field(k, 0.7)),
      field(entry.category, 0.4),
    ],
  }));
  const byPhrase = new Map<string, { words: string[]; targets: { at: number; w: number }[] }>();
  index.forEach((entry, at) => {
    for (const { p, w } of entry.intents ?? []) {
      const ws = words(p);
      const key = ws.join(" ");
      if (!key) continue;
      const slot = byPhrase.get(key) ?? { words: ws, targets: [] };
      slot.targets.push({ at, w });
      byPhrase.set(key, slot);
    }
  });
  const out = { items, phrases: [...byPhrase.values()] };
  cache.set(index, out);
  return out;
}

/**
 * Whether the phrase's words occur in the query in order, allowing up to two words between them
 * ("too damn big" still says "too big") and a typo in longer words.
 */
function phraseIn(phrase: string[], query: string[]): boolean {
  for (let start = 0; start < query.length; start++) {
    if (!near(phrase[0] as string, query[start] as string)) continue;
    let k = 1;
    let at = start;
    while (k < phrase.length) {
      let found = -1;
      for (let j = at + 1; j < query.length && j <= at + 3; j++)
        if (near(phrase[k] as string, query[j] as string)) {
          found = j;
          break;
        }
      if (found < 0) break;
      at = found;
      k++;
    }
    if (k === phrase.length) return true;
  }
  return false;
}

const VIDEO_WORDS = new Set(
  ["video", "clip", "footage", "film", "movie", "mp4", "mov", "recording", "vid"].map(stem),
);
const AUDIO_WORDS = new Set(
  ["audio", "mp3", "song", "music", "podcast", "wav", "m4a", "flac", "track", "voice"].map(stem),
);

/** One phrase word is worth this much; a three-word symptom outweighs a one-word context. */
const INTENT_POINTS = 100;
/** A tool needs this share of the query's weight (words that match nothing anywhere excluded). */
const MIN_COVERAGE = 0.5;
/** Results far below the best are noise at the moment of choice; they are dropped. */
const RELATIVE_FLOOR = 0.3;

/**
 * Ranked matches for a query, at most `limit`. An empty query lists every standalone tool, in
 * category order. Generated pages come up only when the query names them (ADR-0154).
 */
export function searchTools(index: ToolIndexEntry[], query: string, limit = 30): ToolIndexEntry[] {
  const q = stripNoise(normalize(query));
  if (!normalize(query)) {
    return index
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !e.family && !e.generated)
      .sort((a, b) => a.e.order - b.e.order || a.i - b.i)
      .map(({ e }) => e);
  }
  const all = q.split(" ").filter(Boolean).map(stem);
  const meaningful = all.filter((t) => !STOP.has(t));
  const tokens = meaningful.length ? meaningful : all;
  const { items, phrases } = prepare(index);

  // Per tool and word: the best field score. Then each word's weight from how many tools it matches.
  const scores = items.map((p) =>
    tokens.map((t) => {
      let best = 0;
      for (const f of p.fields) best = Math.max(best, tokenScore(t, f.text, f.words) * f.weight);
      return best;
    }),
  );
  const weights = tokens.map((_, k) => {
    const df = scores.reduce((n, s) => n + ((s[k] ?? 0) > 0 ? 1 : 0), 0);
    return df === 0 ? 0 : Math.log(1 + items.length / df);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const intent = new Map<number, number>();
  for (const ph of phrases) {
    if (!phraseIn(ph.words, all)) continue;
    for (const { at, w } of ph.targets)
      intent.set(at, (intent.get(at) ?? 0) + INTENT_POINTS * ph.words.length * w);
  }
  // A query about a song or an MP3 and not a video: pages that only take video lean back.
  const kind = all.some((t) => VIDEO_WORDS.has(t))
    ? "video"
    : all.some((t) => AUDIO_WORDS.has(t))
      ? "audio"
      : undefined;
  if (kind === "audio")
    for (const [at, b] of intent)
      if (!items[at]?.entry.accepts?.includes("audio")) intent.set(at, b * 0.6);
  // A generated page is a result only when the query names it (ADR-0154): "mov to mp4", "8 mb",
  // "discord". Otherwise the standalone tool that does the job leads ("convert mov" is the converter).
  const named = (p: Prepared) =>
    !p.entry.generated || p.names.some((ws) => ws.every((w) => all.some((t) => near(w, t))));

  const scored: { e: ToolIndexEntry; score: number; i: number }[] = [];
  items.forEach((p, i) => {
    if (!named(p)) return;
    const s = scores[i] as number[];
    let covered = 0;
    let quality = 0;
    tokens.forEach((_, k) => {
      const w = weights[k] as number;
      if ((s[k] ?? 0) > 0) covered += w;
      quality += w * (s[k] ?? 0);
    });
    const coverage = totalWeight > 0 ? covered / totalWeight : 0;
    const boost = intent.get(i) ?? 0;
    if (boost === 0 && (coverage < MIN_COVERAGE || covered === 0)) return;
    let total = totalWeight > 0 ? (quality / totalWeight) * coverage : 0;
    const matched = tokens.filter((_, k) => (s[k] ?? 0) > 0 && (weights[k] ?? 0) > 0);
    // Words that meet in one field ("mov" and "mp4" in one title) beat words spread across several.
    if (matched.length > 1) {
      let together = 0;
      for (const f of p.fields)
        if (matched.every((t) => tokenScore(t, f.text, f.words) > 0))
          together = Math.max(together, 40 * f.weight);
      total += together * coverage;
      // ...and in the order typed: "srt vtt" is SRT to WebVTT, not the reverse.
      const at = matched.map((t) => p.slug.indexOf(t));
      if (at.every((x, k) => x >= 0 && (k === 0 || x > (at[k - 1] ?? -1)))) total += 20;
    }
    if (p.title.startsWith(q)) total += 60;
    else if (q.length > 2 && p.title.includes(q)) total += 30;
    // A hub page beats its generated family members on the same words.
    if (p.entry.family) total -= 5;
    scored.push({ e: p.entry, score: total + boost, i });
  });
  scored.sort((a, b) => b.score - a.score || a.e.title.length - b.e.title.length || a.i - b.i);
  const top = scored[0]?.score ?? 0;
  return scored
    .filter((s) => s.score >= top * RELATIVE_FLOOR)
    .slice(0, limit)
    .map((s) => s.e);
}
