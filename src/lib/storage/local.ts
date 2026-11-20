/**
 * The site's own keys in this browser's local storage (ADR-0128, ADR-0129). Every access is wrapped:
 * a browser that blocks storage (a private mode, a policy) or a full quota reads as "nothing kept"
 * and writes are dropped, so no page depends on it. Values are JSON; a value that does not parse
 * reads as missing.
 *
 * What is kept, under which keys, is listed on /privacy (content/site `privacy`), and
 * `clearSiteStorage` there removes all of it.
 */

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** The parsed value under `key`, or undefined when missing, unreadable or blocked. */
export function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/** Stores `value` as JSON; false when storage is blocked or full (the value then lives nowhere). */
export function writeJson(key: string, value: unknown): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Blocked: there was nothing to remove.
  }
}

/** Every key that starts with `prefix` (the site's per-page settings, presets). */
export function keysWithPrefix(prefix: string): string[] {
  const out: string[] = [];
  try {
    const s = storage();
    if (!s) return out;
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(prefix)) out.push(k);
    }
  } catch {
    // Blocked.
  }
  return out;
}

/** Removes every key this site stored in local storage. */
export function clearLocal(): void {
  try {
    storage()?.clear();
  } catch {
    // Blocked: nothing was kept.
  }
}
