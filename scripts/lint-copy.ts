/** Enforces README.md#content-guidelines banned words in registry content and messages. */
import { globSync, readFileSync } from "node:fs";

const banned = [
  /\bpowerful\b/i,
  /\bseamless(ly)?\b/i,
  /\bblazing\b/i,
  /\blightning[- ]fast\b/i,
  /\bultimate\b/i,
  /\bcutting[- ]edge\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i,
  /\brevolutionary\b/i,
  /\bstunning\b/i,
  /\bamazing\b/i,
  /\bawesome\b/i,
  /\bincredible\b/i,
  /\bsupercharge\b/i,
  /\bunleash\b/i,
  /\bunlock\b/i,
  /\belevate\b/i,
  /\bempower\b/i,
  /\bnext[- ]level\b/i,
  /\bgame[- ]changing\b/i,
  /\bhassle[- ]free\b/i,
  /\bone[- ]stop\b/i,
  /\bAI[- ]powered\b/i,
  /\b100% free\b/i,
  /\btrusted by\b/i,
  /\bjoin thousands\b/i,
  /\bthe #1\b/i,
  /\bsign up today\b/i,
  /\bget started for free\b/i,
  /\bin seconds\b/i,
  /!/,
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
];

const files = [
  ...globSync("src/tools/registry/tools/**/*.ts"),
  ...globSync("src/messages/*.json"),
  // Prose only: profile text lives in index.ts files; capability tables are code.
  ...globSync("src/content/**/index.ts"),
  ...globSync("src/content/**/*.{md,mdx}"),
];
let failed = false;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
    for (const rx of banned) {
      const m = line.match(rx);
      if (m) {
        failed = true;
        console.error(`✗ ${f}:${i + 1}: banned "${m[0]}"`);
      }
    }
  });
}
console.log(failed ? "Copy lint failed" : `✓ copy lint passed (${files.length} files)`);
process.exit(failed ? 1 : 0);
