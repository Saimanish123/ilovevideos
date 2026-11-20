/**
 * Where recordings live in this browser's Origin Private File System, and who holds them
 * (ADR-0130): `recordings/<session>/`, one directory per recorder page, held by a Web Lock for the
 * page's life. A page that opens a recorder removes the directories nobody holds, except those
 * with an interrupted recording, which ./find offers to recover. Light: no media code, so a
 * recorder page can look for an interrupted recording before anything else loads.
 *
 * No network access (README.md#privacy-and-processing §2).
 */
import { RECOVER_DAYS, type RecordingMeta } from "./journal";

/** The top-level OPFS directory of recordings. */
export const RECORDINGS_DIR = "recordings";
export const lockName = (session: string) => `ilv-recording-${session}`;

export const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let sessionDir: Promise<FileSystemDirectoryHandle | null> | undefined;
/** Directories of interrupted recordings this page recovered: held, and cleared like its own. */
const adopted = new Set<string>();

type Dir = FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };

const opfsOnPage = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.storage?.getDirectory === "function" &&
  typeof FileSystemFileHandle !== "undefined" &&
  typeof navigator.locks?.request === "function";

/** Holds a Web Lock for the page's life; resolves once it is held. */
function hold(name: string): Promise<void> {
  return new Promise<void>((held) => {
    void navigator.locks.request(name, () => {
      held();
      return new Promise<void>(() => undefined);
    });
  });
}

async function namesIn(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const out: string[] = [];
  for await (const n of (dir as Dir).keys()) out.push(n);
  return out;
}

/** Whether a recording directory holds a recording that was never finished, and is recent. */
async function holdsInterrupted(dir: FileSystemDirectoryHandle, now: number): Promise<boolean> {
  for (const n of await namesIn(dir)) {
    if (!n.endsWith(".json")) continue;
    try {
      const m = JSON.parse(
        await (await dir.getFileHandle(n)).getFile().then((f) => f.text()),
      ) as RecordingMeta;
      if (!m.finished && now - m.started < RECOVER_DAYS * 86_400_000) return true;
    } catch {
      // Unreadable description: nothing to offer.
    }
  }
  return false;
}

/** The root `recordings/` directory, or null without OPFS. */
export async function recordingsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsOnPage()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(RECORDINGS_DIR, { create: true });
  } catch {
    return null;
  }
}

/**
 * Removes the recording directories nobody holds, except those with an interrupted recording,
 * which stay for ./recover. Recordings from before this version sat under `outputs/`, which the
 * engine worker sweeps.
 */
export async function sweepRecordings(keep?: string): Promise<void> {
  const root = await recordingsRoot();
  if (!root) return;
  const now = Date.now();
  for (const name of await namesIn(root).catch(() => [] as string[])) {
    if (name === sessionId || name === keep || adopted.has(name)) continue;
    // Asked and released at once: holding the lock while reading would make another page's sweep
    // or search (another tab, or React's double effect in development) take this directory for a
    // live recording and skip it. An unheld directory is never taken again by its own page.
    let free = false;
    await navigator.locks.request(lockName(name), { ifAvailable: true }, (lock) => {
      free = !!lock;
    });
    if (!free) continue;
    const dir = await root.getDirectoryHandle(name).catch(() => undefined);
    if (dir && (await holdsInterrupted(dir, now))) continue;
    // Taken by a recovering page in the meantime: its lock is held now, so it stays.
    if (adopted.has(name)) continue;
    await root.removeEntry(name, { recursive: true }).catch(() => undefined);
  }
}

/** This page's recordings directory, created on first use; stale ones are swept then. */
export function recordingsDir(): Promise<FileSystemDirectoryHandle | null> {
  sessionDir ??= (async () => {
    const root = await recordingsRoot();
    if (!root) return null;
    try {
      await hold(lockName(sessionId));
      await sweepRecordings();
      return await root.getDirectoryHandle(sessionId, { create: true });
    } catch {
      return null;
    }
  })();
  return sessionDir;
}

/** This page's session id (tests, and the recovered file's new home). */
export const currentSession = () => sessionId;

/**
 * Takes an interrupted recording's directory for this page (its lock is held from now on), so it is
 * cleared with this page's own recordings and no other tab sweeps it while its file is in use.
 */
export async function adoptRecording(session: string): Promise<boolean> {
  if (!opfsOnPage()) return false;
  let got = false;
  await new Promise<void>((done) => {
    void navigator.locks.request(lockName(session), { ifAvailable: true }, (lock) => {
      got = !!lock;
      done();
      return lock ? new Promise<void>(() => undefined) : undefined;
    });
  });
  if (got) adopted.add(session);
  return got;
}

/** Removes this page's earlier recordings (a new one starts; the old result is gone from the page). */
export async function releaseRecordings(): Promise<void> {
  const dir = await recordingsDir();
  if (!dir) return;
  for (const name of await namesIn(dir).catch(() => [] as string[]))
    await dir.removeEntry(name).catch(() => undefined);
  const root = await recordingsRoot();
  for (const s of adopted) await root?.removeEntry(s, { recursive: true }).catch(() => undefined);
  adopted.clear();
}
