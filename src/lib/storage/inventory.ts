/**
 * What this site keeps in this browser, counted from the storage itself (for /privacy's clear
 * control, ADR-0131): the browser's own `storage.estimate()` is rounded and refreshed lazily, so it
 * can report the same figure before and after everything is removed. Here every file and cache
 * entry is measured, and what kind of thing it is gets a plain name.
 */
import { KEPT_INDEX_KEY, PRESETS_PREFIX, SETTINGS_PREFIX } from "./keys";

type Dir = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

export interface Inventory {
  bytes: number;
  /** Plain names of what is kept, in reading order ("recent tools", "settings for 2 pages"…). */
  parts: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function dirBytes(dir: Dir): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  for await (const [, h] of dir.entries()) {
    if (h.kind === "directory") {
      const d = await dirBytes(h as Dir);
      bytes += d.bytes;
      files += d.files;
    } else {
      try {
        bytes += (await (h as FileSystemFileHandle).getFile()).size;
      } catch {
        // A file another tab holds open: not counted.
      }
      files++;
    }
  }
  return { bytes, files };
}

async function childCount(root: Dir, name: string): Promise<{ n: number; bytes: number }> {
  try {
    const d = (await root.getDirectoryHandle(name)) as Dir;
    let n = 0;
    for await (const [, h] of d.entries()) if (h.kind === "directory") n++;
    return { n, bytes: (await dirBytes(d)).bytes };
  } catch {
    return { n: 0, bytes: 0 };
  }
}

/** Everything this site keeps here, measured. Blocked storage counts as nothing. */
export async function measureSiteStorage(): Promise<Inventory> {
  let bytes = 0;
  const parts: string[] = [];
  // Local storage: two bytes per character, keys and values.
  try {
    const s = window.localStorage;
    let recent = false;
    let settings = 0;
    let presets = 0;
    let other = false;
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k) continue;
      bytes += 2 * (k.length + (s.getItem(k)?.length ?? 0));
      if (k === "recent-tools") recent = true;
      else if (k.startsWith(SETTINGS_PREFIX)) settings++;
      else if (k.startsWith(PRESETS_PREFIX)) presets++;
      else if (k !== KEPT_INDEX_KEY) other = true;
    }
    if (recent) parts.push("recent tools");
    if (settings) parts.push(`settings for ${plural(settings, "page", "pages")}`);
    if (presets) parts.push(`saved settings on ${plural(presets, "page", "pages")}`);
    if (other) parts.push("home page choices");
  } catch {
    // Blocked.
  }
  // Private file storage.
  try {
    const root = (await navigator.storage.getDirectory()) as Dir;
    const results = await childCount(root, "results");
    const recordings = await childCount(root, "recordings");
    const outputs = await childCount(root, "outputs");
    bytes += results.bytes + recordings.bytes + outputs.bytes;
    if (results.n) parts.push(plural(results.n, "kept result", "kept results"));
    if (recordings.bytes) parts.push("recordings");
    if (outputs.bytes) parts.push("large results of closed pages");
  } catch {
    // No OPFS here.
  }
  // Cache Storage: the offline copy and files shared to the installed app.
  try {
    let offline = false;
    let shared = false;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const reqs = await cache.keys();
      if (reqs.length === 0) continue;
      if (name === "share-inbox") shared = true;
      else offline = true;
      for (const r of reqs) {
        const res = await cache.match(r);
        const len = Number(res?.headers.get("content-length"));
        bytes += Number.isFinite(len) && len > 0 ? len : ((await res?.blob())?.size ?? 0);
      }
    }
    if (offline) parts.push("the offline copy of the site");
    if (shared) parts.push("files shared to the app");
  } catch {
    // No Cache Storage here.
  }
  return { bytes, parts };
}

/** "a, b and c". */
export function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
