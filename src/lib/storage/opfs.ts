/**
 * The page's side of the site's Origin Private File System (ADR-0130, ADR-0131): reading and
 * removing its files, and a client for the storage worker that writes them (sync access handles
 * exist only in workers). Every call is wrapped: a browser without OPFS, or one that refuses it
 * (a private window, a full disk), reads as "nothing kept" and writes report failure, so the page
 * works as if nothing were kept.
 *
 * Top-level directories: `results/<slug>/` (the last result of a page), `recordings/<session>/`
 * (recordings, kept through a crash), `outputs/<session>/` (large outputs while a page is open,
 * ADR-0058). /privacy lists them.
 */
import { isReady } from "@/tools/workers/ready";
import type { FromStorage, ToStorage } from "@/tools/workers/storage.worker";

type Dir = FileSystemDirectoryHandle & {
  keys(): AsyncIterable<string>;
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

export const opfsSupported = () =>
  typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";

/**
 * Whether files can be written here at all: OPFS and workers. (Sync access handles, which the
 * storage worker writes with, exist only inside workers, so the page cannot test for them; a worker
 * without them answers every write with an error, and the caller falls back.)
 */
export const opfsWritable = () => opfsSupported() && typeof Worker !== "undefined";

/** The directory at `path`, or undefined when it (or OPFS) is not there. */
export async function dirAt(path: string[], create = false): Promise<Dir | undefined> {
  if (!opfsSupported()) return undefined;
  try {
    let d = (await navigator.storage.getDirectory()) as Dir;
    for (const p of path) d = (await d.getDirectoryHandle(p, { create })) as Dir;
    return d;
  } catch {
    return undefined;
  }
}

/** Names in a directory; [] when missing. */
export async function listDir(path: string[]): Promise<string[]> {
  const d = await dirAt(path);
  if (!d) return [];
  const out: string[] = [];
  try {
    for await (const name of d.keys()) out.push(name);
  } catch {
    // Unreadable: nothing listed.
  }
  return out;
}

/** The file at `path` (an OPFS-backed File: nothing is read into memory). */
export async function fileAt(path: string[]): Promise<File | undefined> {
  const name = path.at(-1);
  const d = await dirAt(path.slice(0, -1));
  if (!d || !name) return undefined;
  try {
    return await (await d.getFileHandle(name)).getFile();
  } catch {
    return undefined;
  }
}

export async function readTextAt(path: string[]): Promise<string | undefined> {
  try {
    return await (await fileAt(path))?.text();
  } catch {
    return undefined;
  }
}

/** Removes a file or a directory (recursively); false when it could not (open in another tab). */
export async function removeAt(path: string[]): Promise<boolean> {
  const name = path.at(-1);
  const d = await dirAt(path.slice(0, -1));
  if (!d || !name) return false;
  try {
    await d.removeEntry(name, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Every top-level entry the site keeps, removed where nothing holds it open. */
export async function clearOpfs(): Promise<void> {
  const root = await dirAt([]);
  if (!root) return;
  const names: string[] = [];
  try {
    for await (const name of root.keys()) names.push(name);
  } catch {
    return;
  }
  for (const name of names) {
    const d = (await root.getDirectoryHandle(name).catch(() => undefined)) as Dir | undefined;
    if (!d) {
      await root.removeEntry(name).catch(() => undefined);
      continue;
    }
    // Entry by entry, so a file another open tab is writing stays and the rest goes.
    const inner: string[] = [];
    try {
      for await (const n of d.keys()) inner.push(n);
    } catch {
      // Unreadable.
    }
    for (const n of inner) await d.removeEntry(n, { recursive: true }).catch(() => undefined);
    await root.removeEntry(name).catch(() => undefined);
  }
}

/** Bytes used and available to this site, when the browser says. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | undefined> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || typeof e.quota !== "number") return undefined;
    return { usage: e.usage ?? 0, quota: e.quota };
  } catch {
    return undefined;
  }
}

type Request = ToStorage extends infer T
  ? T extends { id: number }
    ? Omit<T, "id">
    : never
  : never;

/** One storage worker: requests answered in order, each a promise. */
export class StorageWorker {
  private worker: Worker;
  private ready: Promise<void>;
  private next = 1;
  private waiting = new Map<
    number,
    { resolve: (b?: number) => void; reject: (e: Error) => void }
  >();
  private failure?: Error;

  constructor() {
    this.worker = new Worker(new URL("@/tools/workers/storage.worker.ts", import.meta.url), {
      type: "module",
    });
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The storage worker did not start.")), 8000);
      this.worker.onmessage = (e: MessageEvent<FromStorage | { type: string }>) => {
        if (isReady(e.data)) {
          clearTimeout(timer);
          resolve();
          return;
        }
        const m = e.data as FromStorage;
        const w = this.waiting.get(m.id);
        if (!w) return;
        this.waiting.delete(m.id);
        if (m.ok) w.resolve(m.bytes);
        else w.reject(new Error(m.error));
      };
      this.worker.onerror = (e) => {
        clearTimeout(timer);
        this.failure = new Error(e.message || "The storage worker failed.");
        reject(this.failure);
        for (const w of this.waiting.values()) w.reject(this.failure);
        this.waiting.clear();
      };
    });
    this.ready.catch(() => undefined);
  }

  async request(m: Request, transfer: Transferable[] = []): Promise<number | undefined> {
    await this.ready;
    if (this.failure) throw this.failure;
    const id = this.next++;
    return new Promise<number | undefined>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ ...m, id }, transfer);
    });
  }

  terminate(): void {
    this.worker.terminate();
    for (const w of this.waiting.values()) w.reject(new Error("Stopped."));
    this.waiting.clear();
  }
}
