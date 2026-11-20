/**
 * "Your last result" (ADR-0131): after a run, a page's output is copied to this browser's Origin
 * Private File System, so a reload, a crash or an accidental Back on that page can still download
 * it. One result per page, under `results/<slug>/` (the files, then `meta.json`, written last so a
 * half-written copy is never offered), with a small index in local storage (`kept-results`) so a page
 * knows without touching OPFS whether it has anything to show.
 *
 * Bounds: a result is kept only if it is at most `KEEP_MAX_BYTES` and fits in a quarter of the free
 * quota; all kept results together stay under `KEEP_TOTAL_BYTES`, the oldest removed first to make
 * room; anything older than `KEEP_HOURS` is removed on the next visit to any tool page. Start over
 * removes it at once. Nothing here is read from or sent to a network.
 */
import { KEPT_HOURS, KEPT_INDEX_KEY } from "./keys";
import { readJson, writeJson } from "./local";
import {
  dirAt,
  fileAt,
  opfsWritable,
  readTextAt,
  removeAt,
  StorageWorker,
  storageEstimate,
} from "./opfs";

export const KEEP_HOURS = KEPT_HOURS;
export const KEEP_MAX_BYTES = 1024 * 1024 * 1024;
export const KEEP_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const ROOT = "results";

export interface KeptFile {
  name: string;
  type: string;
  size: number;
}
export interface KeptMeta {
  v: 1;
  slug: string;
  /** ms since the epoch. */
  savedAt: number;
  files: KeptFile[];
  /** Several outputs: the name of the ZIP that downloads them together. */
  zipName?: string;
}
export interface KeptResult {
  meta: KeptMeta;
  files: File[];
}
type Index = Record<string, { at: number; bytes: number }>;

const slugOk = (s: string) => /^[a-z0-9-]+$/.test(s);

/** The local index of kept results: page → when and how large. Bad entries are dropped. */
export function readKeptIndex(): Index {
  const raw = readJson(KEPT_INDEX_KEY);
  const out: Index = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [slug, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = v as { at?: unknown; bytes?: unknown };
    if (slugOk(slug) && typeof e?.at === "number" && typeof e.bytes === "number")
      out[slug] = { at: e.at, bytes: e.bytes };
  }
  return out;
}

const writeIndex = (i: Index) => writeJson(KEPT_INDEX_KEY, i);

export const isFresh = (at: number, now = Date.now()) =>
  now - at >= 0 && now - at < KEEP_HOURS * 3600_000;

/**
 * Which results to remove so `incoming` bytes fit: expired ones, then the oldest, until the total
 * is under `KEEP_TOTAL_BYTES`. `slug`'s own entry is always replaced. Pure, for the unit test.
 */
export function evictions(
  index: Index,
  slug: string,
  incoming: number,
  now = Date.now(),
): string[] {
  const out = new Set<string>();
  if (index[slug]) out.add(slug);
  for (const [s, e] of Object.entries(index)) if (!isFresh(e.at, now)) out.add(s);
  const rest = Object.entries(index)
    .filter(([s]) => !out.has(s))
    .sort((a, b) => a[1].at - b[1].at);
  let total = rest.reduce((n, [, e]) => n + e.bytes, 0) + incoming;
  for (const [s, e] of rest) {
    if (total <= KEEP_TOTAL_BYTES) break;
    out.add(s);
    total -= e.bytes;
  }
  return [...out];
}

/** Whether a result of this size is kept at all, given what the browser says is free. */
export function keepable(bytes: number, estimate?: { usage: number; quota: number }): boolean {
  if (bytes <= 0 || bytes > KEEP_MAX_BYTES) return false;
  if (!estimate) return true;
  return bytes <= (estimate.quota - estimate.usage) / 4;
}

async function forget(slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;
  const index = readKeptIndex();
  for (const s of slugs) {
    await removeAt([ROOT, s]);
    delete index[s];
  }
  writeIndex(index);
}

/** Removes a page's kept result (Start over, Discard). */
export function forgetResult(slug: string): Promise<void> {
  return forget([slug]);
}

/** Removes kept results older than `KEEP_HOURS` (any tool page, after it loads). */
export function sweepExpired(now = Date.now()): Promise<void> {
  const index = readKeptIndex();
  return forget(Object.keys(index).filter((s) => !isFresh(index[s]?.at ?? 0, now)));
}

interface Saving {
  slug: string;
  cancelled: boolean;
  worker?: StorageWorker;
}
let current: Saving | undefined;
// One save at a time: two copies into the same directory would fight over its files.
let chain: Promise<unknown> = Promise.resolve();

function cancel(s: Saving | undefined) {
  if (!s || s.cancelled) return;
  s.cancelled = true;
  s.worker?.terminate();
}

/**
 * Keeps a finished result for `slug`, replacing any save still running. Resolves true when it was
 * kept; false when it was too large, storage refused it, or Start over or a newer result replaced
 * it while it was written (then nothing of it is left).
 */
export function keepResult(
  slug: string,
  files: { blob: Blob; name: string }[],
  zipName?: string,
): Promise<boolean> {
  cancel(current);
  const me: Saving = { slug, cancelled: false };
  current = me;
  const run = chain.then(() => save(me, files, zipName));
  chain = run.catch(() => undefined);
  return run;
}

async function save(
  me: Saving,
  files: { blob: Blob; name: string }[],
  zipName?: string,
): Promise<boolean> {
  const { slug } = me;
  if (me.cancelled || !slugOk(slug) || files.length === 0 || !opfsWritable()) return false;
  const bytes = files.reduce((n, f) => n + f.blob.size, 0);
  if (!keepable(bytes, await storageEstimate())) {
    await forget([slug]);
    return false;
  }
  await forget(evictions(readKeptIndex(), slug, bytes));
  try {
    me.worker = new StorageWorker();
    const kept: KeptFile[] = [];
    for (const [i, f] of files.entries()) {
      if (me.cancelled) throw new Error("replaced");
      await me.worker.request({ op: "copy", dir: [ROOT, slug], name: String(i), blob: f.blob });
      kept.push({ name: f.name, type: f.blob.type, size: f.blob.size });
    }
    if (me.cancelled) throw new Error("replaced");
    const meta: KeptMeta = {
      v: 1,
      slug,
      savedAt: Date.now(),
      files: kept,
      ...(files.length > 1 && zipName ? { zipName } : {}),
    };
    await me.worker.request({
      op: "text",
      dir: [ROOT, slug],
      name: "meta.json",
      text: JSON.stringify(meta),
    });
    if (me.cancelled) throw new Error("replaced");
    const index = readKeptIndex();
    index[slug] = { at: meta.savedAt, bytes };
    if (!writeIndex(index)) throw new Error("index");
    return true;
  } catch {
    me.worker?.terminate();
    await forget([slug]);
    return false;
  } finally {
    me.worker?.terminate();
    if (current === me) current = undefined;
  }
}

/** Stops a save in progress for `slug` (Start over while it is still being written). */
export function cancelKeep(slug: string): void {
  if (current?.slug === slug) cancel(current);
}

/** Whether the local index says `slug` has a fresh result (synchronous, no OPFS access). */
export function hasKeptResult(slug: string, now = Date.now()): boolean {
  const e = readKeptIndex()[slug];
  return !!e && isFresh(e.at, now);
}

/** The page's kept result, read back as OPFS-backed Files; undefined when missing or stale. */
export async function loadKeptResult(
  slug: string,
  now = Date.now(),
): Promise<KeptResult | undefined> {
  if (!slugOk(slug) || !hasKeptResult(slug, now)) return undefined;
  const text = await readTextAt([ROOT, slug, "meta.json"]);
  let meta: KeptMeta | undefined;
  try {
    meta = text ? (JSON.parse(text) as KeptMeta) : undefined;
  } catch {
    meta = undefined;
  }
  const valid =
    meta?.v === 1 &&
    meta.slug === slug &&
    typeof meta.savedAt === "number" &&
    isFresh(meta.savedAt, now) &&
    Array.isArray(meta.files) &&
    meta.files.length > 0;
  if (!meta || !valid) {
    await forget([slug]);
    return undefined;
  }
  const files: File[] = [];
  for (const [i, f] of meta.files.entries()) {
    const file = await fileAt([ROOT, slug, String(i)]);
    if (!file || file.size !== f.size) {
      await forget([slug]);
      return undefined;
    }
    files.push(new File([file], f.name, { type: f.type }));
  }
  return { meta, files };
}

/** Whether any kept result exists, for /privacy. */
export async function anyKept(): Promise<boolean> {
  return Object.keys(readKeptIndex()).length > 0 || !!(await dirAt([ROOT]));
}
