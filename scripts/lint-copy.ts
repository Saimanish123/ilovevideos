/**
 * Enforces README.md#content-guidelines:
 *  1. Banned words in registry content, messages and site copy.
 *  2. Interface copy (ADR-0149): privacy is stated on /privacy, /about and once in the home page's
 *     promises block, never in the interface. Fails on "on this device", "no upload" and the like in
 *     components, app routes, UI strings in lib, engine and worker messages, site copy outside the
 *     kept entries, and tool subtitles, titles and button labels.
 *  3. No check-date stamps ("Checked 2026-09", "(checked …)") in the interface or page prose; the
 *     dates stay in src/content/platforms.
 *  4. No machinery in the interface or page prose: "fallback engine", WebGL, WebCodecs, ffmpeg.wasm,
 *     "ffmpeg engine", workers, canvases, OPFS, TensorFlow and model names. FFmpeg named as a tool a
 *     reader runs themselves ("in FFmpeg it is -c:v copy") is allowed.
 *  5. No test talk in page prose ("our tests", "test clips", "not yet measured", fixture sources).
 * Rules 2 to 5 read the registry and site copy as data, so only the fields named here are checked:
 * metaTitle and metaDescription (search results only) and the kept privacy pages are not.
 */
import { globSync, readFileSync } from "node:fs";
import * as site from "../src/content/site";
import * as discoverySite from "../src/content/site/discovery";
import { fileFacts } from "../src/content/site/file-facts";
import { toolInputs } from "../src/tools/registry/tools";

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

/** Rule 2: privacy reassurance, never in the interface (ADR-0149). */
const privacyPhrases = [
  /\bon (this|your) device\b/i,
  /\bnot uploaded\b/i,
  /\bnever uploaded\b/i,
  /\bnothing (is )?uploaded\b/i,
  /\bno upload\b/i,
  /\bstays? on (this|your)\b/i,
  /\bnever leaves?\b/i,
  /\bin your browser\b/i,
];

/** Rule 3: check-date stamps. */
const dateStamps = [
  /\bchecked\s+(\d{4}|\$\{)/i,
  /\(checked\b/i,
  /\blast checked\b/i,
  /\bverified on\b/i,
  /\bas of \d{4}\b/i,
  /\bread on \d{4}-\d{2}-\d{2}\b/i,
];

/** Rule 4: machinery. Hyphenated identifiers ("sheet-canvas-max-h", "worker-not-ready") are code. */
const machinery = [
  /\bfallback engine\b/i,
  /(?<![-\w])WebGL/i,
  /\bWebCodecs\b/i,
  /\bffmpeg\.wasm\b/i,
  /\bffmpeg engine\b/i,
  /\bcompiled to WebAssembly\b/i,
  /(?<![-\w])workers?(?![-\w])/i,
  /(?<![-\w])canvas(es)?(?![-\w])/i,
  /\bOPFS\b/,
  /\bTensorFlow/i,
  /\bMediaPipe\b/i,
  /\bRNNoise\b/,
  /\bSilero\b/,
  /\bYuNet\b/,
  /\b(lame|libass)\b/i,
];

/** Rule 5: evidence belongs in DECISIONS.md, tests and data files. */
const evidence = [
  /\bour (own )?tests?\b/i,
  /\bour test (files|clips)\b/i,
  /\btest (files|clips|file|clip)\b/i,
  /\bwe (checked|tested|measured)\b/i,
  /\bnot (yet )?(been )?(measured|tested|verified)\b/i,
  /\bhave not been tested\b/i,
  /\bNASA\b/,
  /\bIoU\b/,
];

let failed = false;
const report = (where: string, rule: string, m: RegExpMatchArray) => {
  failed = true;
  console.error(`✗ ${where}: ${rule} "${m[0]}"`);
};
const check = (where: string, text: string, rules: [string, RegExp[]][]) => {
  for (const [rule, list] of rules)
    for (const rx of list) {
      const m = text.match(rx);
      if (m) report(where, rule, m);
    }
};

// 1. Banned words, line by line (unchanged).
const bannedFiles = [
  ...globSync("src/tools/registry/tools/**/*.ts"),
  ...globSync("src/messages/*.json"),
  // Prose only: profile text lives in index.ts files; capability tables are code.
  ...globSync("src/content/**/index.ts"),
  // Site copy split into topic files (discovery, search intents): all prose.
  ...globSync("src/content/site/*.ts"),
  ...globSync("src/content/**/*.{md,mdx}"),
];
for (const f of bannedFiles) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
    for (const rx of banned) {
      const m = line.match(rx);
      if (m) report(`${f}:${i + 1}`, "banned", m);
    }
  });
}

// 2-5 on the registry, as data: interface fields get every rule, prose fields all but privacy (a FAQ
// may answer "Is my file uploaded?", and prose may say how a specific tool works).
const ui: [[string, RegExp[]], ...[string, RegExp[]][]] = [
  ["privacy line in the interface", privacyPhrases],
  ["check date", dateStamps],
  ["machinery", machinery],
];
const prose: [string, RegExp[]][] = [
  ["check date", dateStamps],
  ["machinery", machinery],
  ["test evidence", evidence],
];
for (const t of toolInputs) {
  for (const [locale, c] of Object.entries(t.content)) {
    const at = (field: string) => `registry ${t.slug} (${locale}) ${field}`;
    check(at("title"), c.title, ui);
    check(at("subtitle"), c.subtitle, ui);
    if (c.action) check(at("action"), c.action, ui);
    check(at("what"), c.what, prose);
    // Steps are instructions next to the tool: no privacy line there either.
    for (const [i, s] of c.steps.entries()) check(at(`steps[${i}]`), s, [...prose, ui[0]]);
    for (const [i, p] of c.goodToKnow.entries()) check(at(`goodToKnow[${i}]`), p, prose);
    for (const [i, f] of c.faq.entries()) {
      check(at(`faq[${i}].q`), f.q, prose);
      check(at(`faq[${i}].a`), f.a, prose);
    }
  }
}

// Site copy, as data. Kept (they are where privacy and credits are stated): privacy, about, licences
// and the home page's promises block. Search intents are query data, never shown as sentences.
const strings = (
  value: unknown,
  path: string,
  out: [string, string][] = [],
): [string, string][] => {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value))
    for (const [i, v] of value.entries()) strings(v, `${path}[${i}]`, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
  return out;
};
const keptSite = new Set(["privacy", "about", "licences"]);
const siteCopy: [string, string][] = [];
for (const [name, value] of Object.entries(site)) {
  if (keptSite.has(name)) continue;
  if (name === "home") {
    const { promises: _kept, ...rest } = value as typeof site.home;
    strings(rest, "site.home", siteCopy);
  } else strings(value, `site.${name}`, siteCopy);
}
for (const [name, value] of Object.entries(discoverySite))
  strings(value, `discovery.${name}`, siteCopy);
strings(fileFacts, "fileFacts", siteCopy);
for (const [where, text] of siteCopy) check(where, text, [...ui, ["test evidence", evidence]]);

// Source files whose strings reach the interface. Literals with a space and JSX text are checked;
// comments, internal Error messages, console lines, ffmpeg arguments and shader code are not.
const keptFiles = new Set([
  // Search synonyms people type ("no upload"), matched against the query, never shown.
  "src/lib/tool-search.ts",
  // site.description is the meta description and the web app manifest's description.
  "src/lib/site.ts",
  // The default <title> template (search results).
  "src/app/[locale]/layout.tsx",
]);
const keptDirs = [
  "src/app/[locale]/privacy/",
  "src/app/[locale]/about/",
  "src/app/[locale]/licences/",
];
const sourceFiles = [
  ...globSync("src/components/**/*.{ts,tsx}"),
  ...globSync("src/app/**/*.{ts,tsx}"),
  ...globSync("src/lib/**/*.{ts,tsx}"),
  ...globSync("src/tools/engines/**/*.{ts,tsx}"),
  ...globSync("src/tools/workers/**/*.{ts,tsx}"),
].filter((f) => !keptFiles.has(f) && !keptDirs.some((d) => f.startsWith(d)));

const blank = (s: string) => s.replace(/[^\n]/g, " ");
/** A template literal's text with every `${…}` (nested braces included) removed. */
const withoutInterpolations = (s: string) => {
  let out = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (depth === 0 && s[i] === "$" && s[i + 1] === "{") {
      depth = 1;
      i++;
    } else if (depth > 0) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") depth--;
    } else out += s[i];
  }
  return out;
};
const literal = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const jsxText = />([^<>{}`"']*[A-Za-z][^<>{}`"']*)</g;
const internal = /(?:\bError\(|console\.\w+\()[^()]*$/;
const code =
  /#version|\buniform\b|^\s*ffmpeg\s|\s-(c|i|vf|af|map|b|q|f|filter_complex|movflags)[:\s]/;

for (const f of sourceFiles) {
  const raw = readFileSync(f, "utf8");
  // Comments out, positions kept (block comments, then line comments that are not inside a string).
  let src = raw.replace(/\/\*[\s\S]*?\*\//g, blank);
  src = src.replace(
    /(^|[^:"'`\\])\/\/[^\n]*/g,
    (m, pre: string) => pre + blank(m.slice(pre.length)),
  );
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;
  const texts: [number, string][] = [];
  for (const m of src.matchAll(literal)) {
    // Interpolations are code (`${canvas.width}`), not copy.
    const body = withoutInterpolations(m[0].slice(1, -1));
    if (!/\s/.test(body)) continue;
    const before = src.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
    if (internal.test(before) || code.test(body)) continue;
    texts.push([m.index ?? 0, body]);
  }
  if (f.endsWith(".tsx"))
    for (const m of src.matchAll(jsxText)) texts.push([m.index ?? 0, m[1] ?? ""]);
  for (const [i, text] of texts) check(`${f}:${lineOf(i)}`, text, ui);
}

const total = bannedFiles.length + sourceFiles.length;
console.log(
  failed
    ? "Copy lint failed"
    : `✓ copy lint passed (${total} files, ${toolInputs.length} tools, ${siteCopy.length} site strings)`,
);
process.exit(failed ? 1 : 0);
