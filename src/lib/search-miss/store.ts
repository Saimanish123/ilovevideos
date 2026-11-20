/**
 * Where failed searches are counted (ADR-0151). Server only. A store holds, per UTC day, two
 * tables: query → how many times it was left without opening a tool while it listed some
 * (`missed`), and query → how many times it listed nothing (`zero`). Nothing else exists to store:
 * no time of day, no order, no request detail.
 *
 * Adapters:
 * - `fileStore`: one JSON file (`.data/search-misses.json`, or `SEARCH_MISS_FILE`). For development,
 *   tests and a single long-running server (`next start`). Every write re-reads the file, changes it
 *   and replaces it atomically, one write at a time per process.
 * - `memoryStore`: for unit tests.
 * - `d1Store` (`./d1`): Cloudflare D1, one upserted row per day, query and kind. Wired in
 *   `getSearchMissStore` once hosting is chosen; see that file for the steps.
 * `SEARCH_MISS_STORE=off` turns counting off (the endpoint still answers 204).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type Counts = Record<string, number>;

export interface SearchMissDay {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  /** Left without opening a tool while results were listed. */
  missed: Counts;
  /** Listed no tool at all. */
  zero: Counts;
}

export interface SearchMissStore {
  /** Adds one to the query's count for that day, in `zero` or `missed`. */
  record(day: string, q: string, zero: boolean): Promise<void>;
  /** Every stored day from `from` to `to` inclusive (YYYY-MM-DD), oldest first. */
  read(from: string, to: string): Promise<SearchMissDay[]>;
}

/**
 * New queries a day may add; counts of queries already there keep growing. A flood of invented
 * queries (the endpoint is public) cannot grow the store past this.
 */
export const MAX_QUERIES_PER_DAY = 5000;
/** Days kept by the file store; older days are dropped on the next write. */
export const KEEP_DAYS = 400;

/** The UTC day of `at`, as stored. */
export function dayOf(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s: string) => DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** `day` shifted by `n` days (negative goes back). */
export function addDays(day: string, n: number): string {
  return dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));
}

interface FileShape {
  version: 1;
  days: Record<string, { missed: Counts; zero: Counts }>;
}

const empty = (): FileShape => ({ version: 1, days: {} });

/** Adds one in place, honouring the per-day cap on new queries. */
function bump(days: FileShape["days"], day: string, q: string, zero: boolean): void {
  const slot = days[day] ?? { missed: {}, zero: {} };
  days[day] = slot;
  const table = zero ? slot.zero : slot.missed;
  if (table[q] === undefined) {
    const distinct = Object.keys(slot.missed).length + Object.keys(slot.zero).length;
    if (distinct >= MAX_QUERIES_PER_DAY) return;
  }
  table[q] = (table[q] ?? 0) + 1;
}

function between(days: FileShape["days"], from: string, to: string): SearchMissDay[] {
  return Object.keys(days)
    .filter((d) => d >= from && d <= to)
    .sort()
    .map((day) => ({
      day,
      missed: { ...days[day]?.missed },
      zero: { ...days[day]?.zero },
    }));
}

export function memoryStore(): SearchMissStore {
  const days: FileShape["days"] = {};
  return {
    async record(day, q, zero) {
      bump(days, day, q, zero);
    },
    async read(from, to) {
      return between(days, from, to);
    },
  };
}

async function readShape(path: string): Promise<FileShape> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw e;
  }
  const parsed = JSON.parse(raw) as Partial<FileShape>;
  return parsed && typeof parsed.days === "object" && parsed.days ? (parsed as FileShape) : empty();
}

export function fileStore(path: string): SearchMissStore {
  // One write at a time in this process; a failed write does not block the next.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    record(day, q, zero) {
      const next = queue.then(async () => {
        const shape = await readShape(path);
        bump(shape.days, day, q, zero);
        const oldest = addDays(day, -KEEP_DAYS);
        for (const d of Object.keys(shape.days)) if (d < oldest) delete shape.days[d];
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, `${JSON.stringify(shape)}\n`);
        await rename(tmp, path);
      });
      queue = next.catch(() => undefined);
      return next;
    },
    async read(from, to) {
      return between((await readShape(path)).days, from, to);
    },
  };
}

const off: SearchMissStore = {
  async record() {},
  async read() {
    return [];
  },
};

/** The development store's default place, relative to where the server runs. */
export const defaultFile = () =>
  process.env.SEARCH_MISS_FILE ?? join(process.cwd(), ".data", "search-misses.json");

let current: SearchMissStore | undefined;

/**
 * The store the endpoint writes to.
 *
 * Hosting on Cloudflare (Next up 6, not decided yet), with the OpenNext adapter:
 *   1. `wrangler d1 create search-misses`, add the binding `SEARCH_DB` to wrangler.jsonc;
 *   2. run `D1_SCHEMA` from `./d1` once (`wrangler d1 execute search-misses --remote --command ...`);
 *   3. here, return `d1Store(getCloudflareContext().env.SEARCH_DB)` when that binding exists.
 * The file store must not be used on a host whose file system is per instance or read-only.
 */
export function getSearchMissStore(): SearchMissStore {
  current ??= process.env.SEARCH_MISS_STORE === "off" ? off : fileStore(defaultFile());
  return current;
}

/** Replaces the store (tests; a host's adapter). */
export function setSearchMissStore(store: SearchMissStore | undefined): void {
  current = store;
}
