/**
 * `pnpm search-report`: the searches that failed (ADR-0151), so the intent table grows from real
 * queries. Prints, for a date range, the queries that listed no tool and the queries that were left
 * without opening one, most frequent first, each with the top three tools search lists for it today
 * (a zero-result query that lists tools now was answered since, or is answered wrongly: check it).
 *
 * To fix one: add its words to a row in `src/content/site/search-intents.ts` (phrases → slugs, best
 * answer first), or an alias to the tool, then run `pnpm test` (the query table must still pass).
 *
 * Options:
 *   --days N        the last N days up to today, UTC (default 30)
 *   --from DAY      first day, YYYY-MM-DD (overrides --days)
 *   --to DAY        last day, YYYY-MM-DD (default today)
 *   --top N         rows per table (default 25)
 *   --file PATH     the JSON store (default SEARCH_MISS_FILE or .data/search-misses.json)
 *   --rows PATH     read D1 rows instead: the output of
 *                   `wrangler d1 execute search-misses --remote --json \
 *                     --command "SELECT day, q, zero, n FROM search_miss"`
 */
import { readFileSync } from "node:fs";
import { searchIntents } from "../src/content/site/search-intents";
import { daysFromRows, type MissRow } from "../src/lib/search-miss/d1";
import {
  addDays,
  type Counts,
  dayOf,
  defaultFile,
  fileStore,
  isDay,
  type SearchMissDay,
} from "../src/lib/search-miss/store";
import { buildToolIndex, searchTools } from "../src/lib/tool-search";
import { categories, tools } from "../src/tools/registry";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const to = arg("to") ?? dayOf();
const days = Number(arg("days") ?? 30);
const from = arg("from") ?? addDays(to, -(Math.max(1, days) - 1));
const top = Number(arg("top") ?? 25);
if (!isDay(from) || !isDay(to)) fail("Days are YYYY-MM-DD, for example --from 2026-11-01.");
if (!Number.isFinite(days) || !Number.isFinite(top) || top < 1)
  fail("--days and --top take a number.");

async function load(): Promise<{ source: string; data: SearchMissDay[] }> {
  const rowsPath = arg("rows");
  if (rowsPath) {
    // wrangler prints an array of results blocks: [{ results: [...] }].
    const raw = JSON.parse(readFileSync(rowsPath, "utf8")) as
      | { results?: MissRow[] }[]
      | { results?: MissRow[] }
      | MissRow[];
    const blocks = Array.isArray(raw) ? raw : [raw];
    const rows = blocks.flatMap((b) =>
      "results" in b && Array.isArray(b.results) ? b.results : [b as MissRow],
    );
    return {
      source: rowsPath,
      data: daysFromRows(rows).filter((d) => d.day >= from && d.day <= to),
    };
  }
  const file = arg("file") ?? defaultFile();
  return { source: file, data: await fileStore(file).read(from, to) };
}

function sum(data: SearchMissDay[], key: "missed" | "zero"): Counts {
  const out: Counts = {};
  for (const d of data) for (const [q, n] of Object.entries(d[key])) out[q] = (out[q] ?? 0) + n;
  return out;
}

const index = buildToolIndex(tools, categories, searchIntents);
/** What search lists for the query today: its top three titles, or "nothing". */
function now(q: string): string {
  const found = searchTools(index, q, 3);
  return found.length ? found.map((t) => t.title).join(", ") : "nothing";
}

function table(title: string, counts: Counts, hint: (q: string) => string): void {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const searches = rows.reduce((n, [, c]) => n + c, 0);
  console.log(`\n${title}: ${rows.length} queries, ${searches} searches`);
  if (!rows.length) return;
  const width = Math.min(40, Math.max(5, ...rows.slice(0, top).map(([q]) => q.length)));
  console.log(`  ${"count".padStart(5)}  ${"query".padEnd(width)}  search today`);
  for (const [q, n] of rows.slice(0, top))
    console.log(`  ${String(n).padStart(5)}  ${q.padEnd(width)}  ${hint(q)}`);
  if (rows.length > top) console.log(`  … ${rows.length - top} more (--top ${rows.length})`);
}

const { source, data } = await load();
const span = from === to ? from : `${from} to ${to}`;
console.log(`Failed searches, ${span} (UTC), from ${source}`);
if (!data.length) {
  console.log("\nNothing recorded in this range.");
  process.exit(0);
}
table("No tool listed", sum(data, "zero"), now);
table("Left without opening a tool", sum(data, "missed"), now);
console.log(
  "\nAdd the words to a row in src/content/site/search-intents.ts (or a tool alias), then pnpm test.",
);
