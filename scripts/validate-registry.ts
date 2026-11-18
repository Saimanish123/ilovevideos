/**
 * Validates the tool registry beyond the zod schema:
 *  - slug uniqueness
 *  - no two pages with the same engine and the same processing options (a duplicate page, ADR-0011).
 *    Options are compared after the engine's schema fills in its defaults, so `{}` and an explicit
 *    default are the same page; preset keys the schema does not know (a pair's `from`, `lockTarget`)
 *    still count. UI-only keys (UI_ONLY_KEYS) are left out; the one allowed twin is a platform page
 *    whose platform offers >= 2 tiers, because its primary control (the tier choice) is a different job
 *  - content uniqueness: no paragraph reused across tools, except paragraphs that come from the
 *    format-profile library or the compress-family mechanics paragraph (shared by design); each page
 *    still needs >= MIN_UNIQUE_WORDS of its own, and generated family pages >= MIN_FAMILY_OWN_WORDS
 *    hand-written words (generated steps and computed paragraphs do not count)
 *  - minimum body word count
 *  - format-pair pages (a locked target) carry >= MIN_PAIR_OWN_WORDS hand-written words
 *  - the rendered <title> ("{metaTitle} · {site}") fits MAX_TITLE characters
 *  - every page is in the computed related module of >= MIN_INBOUND_RELATED other pages
 *  - related slugs exist (warn only, so pages can be authored before their neighbours)
 */
import { sharedParagraphs } from "../src/content/formats";
import { getPlatform } from "../src/content/platforms";
import { about, hubIntros, licences, privacy } from "../src/content/site";
import { subtitleSharedParagraphs } from "../src/content/subtitles";
import { site } from "../src/lib/site";
import { loadEngine } from "../src/tools/engines";
import { getActiveCategories, getRelatedTools } from "../src/tools/registry";
import {
  familyGeneratedText,
  familySharedParagraphs,
} from "../src/tools/registry/compress-families";
import { pairGeneratedText } from "../src/tools/registry/pairs";
import { ToolDefinition } from "../src/tools/registry/schema";
import { toolInputs } from "../src/tools/registry/tools";

const MIN_WORDS = 350;
const MIN_UNIQUE_WORDS = 150;
const MIN_FAMILY_OWN_WORDS = 250;
/** Format-pair pages (a locked target): story and FAQ words, generated text excluded. */
const MIN_PAIR_OWN_WORDS = 250;
/** Every page must be one of the six related cards on at least this many other pages. */
const MIN_INBOUND_RELATED = 3;
/** The rendered <title> is "{metaTitle} · {site.name}" and must fit 60 characters. */
const MAX_TITLE = 60;
/** Preset keys that only steer the UI (which tiers to offer), not what the engine does. */
const UI_ONLY_KEYS = new Set(["platform"]);
const tierCount = (preset: Record<string, unknown>) =>
  getPlatform(preset.platform)?.tiers.length ?? 0;
let failed = false;
const fail = (m: string) => {
  failed = true;
  console.error(`✗ ${m}`);
};
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.trim().toLowerCase();
const shared = new Set(
  [...sharedParagraphs, ...familySharedParagraphs, ...subtitleSharedParagraphs].map(norm),
);
const generated = new Set([...familyGeneratedText, ...pairGeneratedText].map(norm));

const tools = toolInputs.flatMap((t) => {
  const r = ToolDefinition.safeParse(t);
  if (r.success) return [r.data];
  for (const issue of r.error.issues)
    fail(`${String(t.slug)}: ${issue.path.join(".")}: ${issue.message}`);
  return [];
});
const slugs = new Set<string>();
const paragraphs = new Map<string, string>();
const signatures = new Map<string, { slug: string; preset: Record<string, unknown> }>();

/**
 * What the engine will run with: the preset with the engine schema's defaults filled in. A schema
 * that needs a value only the panel supplies cannot parse a preset alone; the raw preset stands then.
 */
async function processingOptions(
  engine: Parameters<typeof loadEngine>[0],
  preset: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const schema = await loadEngine(engine).then(
    (e) => e.optionsSchema,
    () => undefined,
  );
  const parsed = schema?.safeParse(preset);
  return parsed?.success ? { ...preset, ...(parsed.data as Record<string, unknown>) } : preset;
}

for (const t of tools) {
  if (slugs.has(t.slug)) fail(`${t.slug}: duplicate slug`);
  slugs.add(t.slug);

  const options = await processingOptions(t.engine, t.presetOptions);
  const keys = Object.keys(options)
    .filter((k) => !UI_ONLY_KEYS.has(k))
    .sort();
  const sig = `${t.engine}:${JSON.stringify(options, keys)}`;
  const twin = signatures.get(sig);
  if (twin && tierCount(t.presetOptions) < 2 && tierCount(twin.preset) < 2)
    fail(`${t.slug}: same engine and preset options as ${twin.slug}; this is a duplicate page`);
  // Keep the first non-platform page as the owner, so a later plain twin is still caught.
  if (!twin || tierCount(twin.preset) >= 2)
    signatures.set(sig, { slug: t.slug, preset: t.presetOptions });

  const c = t.content.en;
  const body = [c.what, ...c.steps, ...c.goodToKnow, ...c.faq.flatMap((f) => [f.q, f.a])];
  const total = words(body.join(" "));
  if (total < MIN_WORDS) fail(`${t.slug}: body has ${total} words, minimum ${MIN_WORDS}`);
  const own = body.filter((p) => !shared.has(norm(p)));
  const unique = words(own.join(" "));
  if (unique < MIN_UNIQUE_WORDS)
    fail(
      `${t.slug}: only ${unique} words are specific to this page (rest is shared profile text), minimum ${MIN_UNIQUE_WORDS}`,
    );
  if (t.family) {
    const handWritten = words(own.filter((p) => !generated.has(norm(p))).join(" "));
    if (handWritten < MIN_FAMILY_OWN_WORDS)
      fail(
        `${t.slug}: only ${handWritten} hand-written words (generated steps and computed paragraphs do not count), minimum ${MIN_FAMILY_OWN_WORDS} for a family page`,
      );
  }

  if (t.presetOptions.lockTarget === true) {
    const handWritten = words(own.filter((p) => !generated.has(norm(p))).join(" "));
    if (handWritten < MIN_PAIR_OWN_WORDS)
      fail(
        `${t.slug}: only ${handWritten} hand-written words in the pair story and FAQ, minimum ${MIN_PAIR_OWN_WORDS} for a format-pair page`,
      );
  }
  const titleLength = c.metaTitle.length + 3 + site.name.length;
  if (titleLength > MAX_TITLE)
    fail(
      `${t.slug}: <title> "${c.metaTitle} · ${site.name}" is ${titleLength} characters, maximum ${MAX_TITLE}`,
    );

  for (const p of [c.what, ...c.goodToKnow, ...c.faq.map((f) => f.a)]) {
    const key = norm(p);
    if (shared.has(key)) continue;
    const owner = paragraphs.get(key);
    if (owner && owner !== t.slug)
      fail(`${t.slug}: paragraph duplicated from ${owner}: "${p.slice(0, 60)}…"`);
    paragraphs.set(key, t.slug);
  }
}
const linkRe = /\]\((\/[a-z0-9-]+)\)/g;
for (const t of tools) {
  const prose = [...t.content.en.goodToKnow, ...t.content.en.faq.map((f) => f.a)].join("\n");
  const links = [...prose.matchAll(linkRe)].map((m) => (m[1] ?? "").slice(1));
  if (links.length === 0)
    fail(`${t.slug}: no contextual link to a sibling tool in goodToKnow/FAQ (use [text](/slug))`);
  for (const l of links)
    if (!slugs.has(l)) fail(`${t.slug}: links to /${l}, which is not a registered tool`);
}
// Internal linking: the computed related module (explicit list plus fill) must reach every page.
const inbound = new Map<string, number>();
for (const t of tools)
  for (const r of getRelatedTools(t)) inbound.set(r.slug, (inbound.get(r.slug) ?? 0) + 1);
for (const t of tools) {
  const n = inbound.get(t.slug) ?? 0;
  if (n < MIN_INBOUND_RELATED)
    fail(
      `${t.slug}: appears in the related tools of ${n} other pages, minimum ${MIN_INBOUND_RELATED}; add it to the \`related\` list of close siblings`,
    );
}
// No two pages may show the same related set, in any order (SEO audit 2026-09-30).
const relatedSets = new Map<string, string>();
for (const t of tools) {
  const key = getRelatedTools(t)
    .map((r) => r.slug)
    .sort()
    .join(",");
  const twin = relatedSets.get(key);
  if (twin) fail(`${t.slug}: shows the same related tools as ${twin}; vary its \`related\` list`);
  else relatedSets.set(key, t.slug);
}
for (const t of tools) {
  for (const r of t.related) {
    if (!slugs.has(r)) console.warn(`  ${t.slug}: related slug "${r}" does not exist yet`);
  }
}
// Site pages and hubs: the same <title> limit as tools (SEO audit 2026-09-30).
for (const [name, title] of [
  ["about", about.metaTitle],
  ["privacy", privacy.metaTitle],
  ["licences", licences.metaTitle],
  ...getActiveCategories().map((c) => [`hub ${c.id}`, c.hubTitle ?? `${c.title} video tools`]),
] as const) {
  const n = title.length + 3 + site.name.length;
  if (n > MAX_TITLE)
    fail(`${name}: <title> "${title} · ${site.name}" is ${n} characters, maximum ${MAX_TITLE}`);
}
// Hub intros must not paraphrase one tool's own prose (a one-tool hub that only repeats its tool is a
// doorway): at most MAX_HUB_OVERLAP of an intro's six-word sequences may appear on any single tool.
const MAX_HUB_OVERLAP = 0.1;
const shingles = (text: string) => {
  const w = text
    .toLowerCase()
    .replace(/[^a-z0-9×\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(" "));
  return out;
};
for (const [id, paragraphs] of Object.entries(hubIntros)) {
  const intro = shingles((paragraphs ?? []).join(" "));
  if (intro.size === 0) continue;
  for (const t of tools) {
    const c = t.content.en;
    const own = shingles([c.what, ...c.goodToKnow, ...c.faq.map((f) => f.a)].join(" "));
    let shared = 0;
    for (const x of intro) if (own.has(x)) shared++;
    if (shared / intro.size > MAX_HUB_OVERLAP)
      fail(
        `hub ${id}: ${Math.round((shared / intro.size) * 100)}% of its intro repeats ${t.slug}; write it for the hub`,
      );
  }
}
console.log(failed ? "Registry validation failed" : `✓ ${tools.length} tools valid`);
process.exit(failed ? 1 : 0);
