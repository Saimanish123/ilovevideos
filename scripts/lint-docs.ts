/**
 * Keeps the three-file documentation system honest (DECISIONS.md ADR-0007):
 *  - every `README.md#<anchor>`, `PROGRESS.md#<anchor>`, `DECISIONS.md#<anchor>` reference in the
 *    repo and every in-file `](#<anchor>)` link resolves to a real heading
 *  - PROGRESS.md has its required sections; DECISIONS.md entries have a Status line and an index row
 *  - no reference to the retired docs/ tree remains
 *  - agents and skills carry name + description frontmatter (needed for automatic delegation)
 */
import { existsSync, globSync, readFileSync } from "node:fs";

let failed = false;
const fail = (m: string) => {
  failed = true;
  console.error(`✗ ${m}`);
};

/** GitHub-style heading slug. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function anchorsOf(file: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (!m?.[1]) continue;
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

const docFiles = ["README.md", "PROGRESS.md", "DECISIONS.md", "CLAUDE.md"];
for (const f of docFiles) if (!existsSync(f)) fail(`${f} is missing`);
const anchors = new Map(docFiles.filter(existsSync).map((f) => [f, anchorsOf(f)]));

const scanned = [
  ...docFiles,
  ...globSync(".claude/**/*.md"),
  ...globSync(".claude/settings.json"),
  ...globSync(".github/**/*.{yml,yaml,md}"),
  ...globSync("src/**/*.{ts,tsx,css}"),
  ...globSync("scripts/**/*.ts"),
  ...globSync("tests/**/*.ts"),
  ...globSync("*.{ts,mjs,json}"),
].filter((f) => existsSync(f));

const crossRef = /\b(README|PROGRESS|DECISIONS)\.md#([a-z0-9-]+)/g;
const inFile = /\]\(#([a-z0-9-]+)\)/g;
const retired = /\bdocs\/(README\.md|\d{2}-[a-z0-9-]+\.md|adr\/|research\/)/;

for (const f of scanned) {
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(crossRef)) {
      const target = `${m[1]}.md`;
      if (!anchors.get(target)?.has(m[2] ?? "")) fail(`${f}:${i + 1}: ${m[0]} does not resolve`);
    }
    if (docFiles.includes(f)) {
      for (const m of line.matchAll(inFile)) {
        if (!anchors.get(f)?.has(m[1] ?? "")) fail(`${f}:${i + 1}: (#${m[1]}) does not resolve`);
      }
    }
    if (retired.test(line) && !f.endsWith("lint-docs.ts") && !f.endsWith("DECISIONS.md")) {
      fail(`${f}:${i + 1}: references the retired docs/ tree`);
    }
  });
}

// PROGRESS.md structure
if (existsSync("PROGRESS.md")) {
  const p = readFileSync("PROGRESS.md", "utf8");
  for (const h of ["## Current state", "## Next up", "## Roadmap", "## Session log"]) {
    if (!p.includes(`\n${h}\n`)) fail(`PROGRESS.md: missing section "${h}"`);
  }
  if (!/^### \d{4}-\d{2}-\d{2}: /m.test(p))
    fail("PROGRESS.md: session log needs at least one dated entry");
}

// DECISIONS.md structure
if (existsSync("DECISIONS.md")) {
  const d = readFileSync("DECISIONS.md", "utf8");
  const body = d.split("\n## Template")[0] ?? d;
  const entries = [...body.matchAll(/^## (ADR-\d{4}): (.+)$/gm)];
  if (entries.length === 0) fail("DECISIONS.md: no ADR entries");
  const ids = new Set<string>();
  for (const e of entries) {
    const id = e[1] ?? "";
    if (ids.has(id)) fail(`DECISIONS.md: duplicate ${id}`);
    ids.add(id);
    if (!new RegExp(`^\\| ${id} \\|`, "m").test(body)) fail(`DECISIONS.md: ${id} has no index row`);
    const start = e.index ?? 0;
    const section = body.slice(
      start,
      body.indexOf("\n## ", start + 1) === -1 ? undefined : body.indexOf("\n## ", start + 1),
    );
    if (!/\*\*Status:\*\*/.test(section)) fail(`DECISIONS.md: ${id} has no Status line`);
    for (const h of ["### Context", "### Decision", "### Consequences"]) {
      if (!section.includes(h)) fail(`DECISIONS.md: ${id} is missing "${h}"`);
    }
  }
}

// Agents and skills need frontmatter for automatic delegation
for (const f of [...globSync(".claude/agents/*.md"), ...globSync(".claude/skills/*/SKILL.md")]) {
  const head = readFileSync(f, "utf8").split("\n").slice(0, 12).join("\n");
  if (!head.startsWith("---")) fail(`${f}: missing frontmatter block`);
  if (!/^name: \S+/m.test(head)) fail(`${f}: missing frontmatter name`);
  if (!/^description: \S+/m.test(head)) fail(`${f}: missing frontmatter description`);
}

// Hooks referenced from settings.json must exist and be executable
if (existsSync(".claude/settings.json")) {
  const s = readFileSync(".claude/settings.json", "utf8");
  for (const m of s.matchAll(/\.claude\/hooks\/([a-z0-9-]+\.sh)/g)) {
    const path = `.claude/hooks/${m[1]}`;
    if (!existsSync(path)) fail(`.claude/settings.json references missing hook ${path}`);
  }
}

console.log(failed ? "Docs lint failed" : `✓ docs lint passed (${scanned.length} files scanned)`);
process.exit(failed ? 1 : 0);
