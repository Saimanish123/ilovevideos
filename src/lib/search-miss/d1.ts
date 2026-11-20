/**
 * Cloudflare D1 adapter for the search-miss counts (ADR-0151). No Cloudflare package is needed: the
 * adapter takes anything shaped like a D1 database (`D1Like`, the subset of `D1Database` it uses).
 * D1 is SQLite, so the unit test runs the same statements on Node's built-in SQLite.
 *
 * One row per day, query and kind; a record is one upsert statement, which SQLite applies atomically,
 * so counts written at the same moment are not lost. KV was considered and not used: it has no
 * increment (a read, add and write loses counts when two writes meet) and it is eventually
 * consistent across locations. Unlike the file store, this adapter does not cap new queries per day.
 */
import type { SearchMissDay, SearchMissStore } from "./store";

interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike;
}

/** Run once when the database is created. */
export const D1_SCHEMA = `CREATE TABLE IF NOT EXISTS search_miss (
  day TEXT NOT NULL,
  q TEXT NOT NULL,
  zero INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, q, zero)
) WITHOUT ROWID;`;

const UPSERT = `INSERT INTO search_miss (day, q, zero, n) VALUES (?1, ?2, ?3, 1)
ON CONFLICT (day, q, zero) DO UPDATE SET n = n + 1`;

const SELECT = `SELECT day, q, zero, n FROM search_miss WHERE day >= ?1 AND day <= ?2 ORDER BY day`;

export interface MissRow {
  day: string;
  q: string;
  zero: number | boolean;
  n: number;
}

/** Rows (from D1, or `wrangler d1 execute --json` output) to days, oldest first. */
export function daysFromRows(rows: readonly MissRow[]): SearchMissDay[] {
  const byDay = new Map<string, SearchMissDay>();
  for (const r of rows) {
    const slot = byDay.get(r.day) ?? { day: r.day, missed: {}, zero: {} };
    byDay.set(r.day, slot);
    const table = r.zero ? slot.zero : slot.missed;
    table[r.q] = (table[r.q] ?? 0) + Number(r.n);
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

export function d1Store(db: D1Like): SearchMissStore {
  return {
    async record(day, q, zero) {
      await db
        .prepare(UPSERT)
        .bind(day, q, zero ? 1 : 0)
        .run();
    },
    async read(from, to) {
      const { results } = await db.prepare(SELECT).bind(from, to).all<MissRow>();
      return daysFromRows(results);
    },
  };
}
