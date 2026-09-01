/**
 * Validates the tool registry beyond the zod schema:
 *  - slug uniqueness
 *  - related slugs exist (warn only, so pages can be authored before their neighbours)
 *  - content uniqueness: no paragraph reused across tools (doorway-page guard)
 *  - minimum body word count
 */
import { ToolDefinition } from "../src/tools/registry/schema";
import { toolInputs } from "../src/tools/registry/tools";

const MIN_WORDS = 350;
let failed = false;
const fail = (m: string) => {
  failed = true;
  console.error(`✗ ${m}`);
};

const tools = toolInputs.map((t) => ToolDefinition.parse(t));
const slugs = new Set<string>();
const paragraphs = new Map<string, string>();

for (const t of tools) {
  if (slugs.has(t.slug)) fail(`${t.slug}: duplicate slug`);
  slugs.add(t.slug);
  const c = t.content.en;
  const body = [c.what, ...c.steps, ...c.goodToKnow, ...c.faq.flatMap((f) => [f.q, f.a])].join(" ");
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) fail(`${t.slug}: body has ${words} words, minimum ${MIN_WORDS}`);
  for (const p of [c.what, ...c.goodToKnow, ...c.faq.map((f) => f.a)]) {
    const key = p.trim().toLowerCase();
    const owner = paragraphs.get(key);
    if (owner && owner !== t.slug)
      fail(`${t.slug}: paragraph duplicated from ${owner}: "${p.slice(0, 60)}…"`);
    paragraphs.set(key, t.slug);
  }
}
for (const t of tools) {
  for (const r of t.related) {
    if (!slugs.has(r)) console.warn(`  ${t.slug}: related slug "${r}" does not exist yet`);
  }
}
console.log(failed ? "Registry validation failed" : `✓ ${tools.length} tools valid`);
process.exit(failed ? 1 : 0);
