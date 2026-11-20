/**
 * Finding an interrupted recording for the recorder page's offer (ADR-0130): light, no media code,
 * so the page can ask before anything else loads. Recovering it is ./recover, loaded on Recover.
 *
 * No network access (README.md#privacy-and-processing §2).
 */
import { RECOVER_DAYS, type RecordingMeta } from "./journal";
import type { CaptureKind } from "./plan";
import { currentSession, lockName, recordingsRoot, sweepRecordings } from "./recordings";

export interface Interrupted {
  session: string;
  /** The media file's name in the session directory. */
  name: string;
  meta: RecordingMeta;
  /** Bytes of media on disk. */
  bytes: number;
  /** Seconds of it, as near as can be told without reading it. */
  seconds: number;
}

type Dir = FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
const names = async (d: FileSystemDirectoryHandle) => {
  const out: string[] = [];
  for await (const n of (d as Dir).keys()) out.push(n);
  return out;
};

async function unheld(session: string): Promise<boolean> {
  let free = false;
  await navigator.locks.request(lockName(session), { ifAvailable: true }, (lock) => {
    free = !!lock;
  });
  return free;
}

/** Seconds on disk: exact for WAV, else the recorded time scaled by the bytes that made it. */
export function writtenSeconds(meta: RecordingMeta, bytes: number): number {
  if (meta.extension === "wav" && meta.audio)
    return Math.max(0, bytes - 44) / (meta.audio.sampleRate * meta.audio.channels * 2);
  if (meta.bytes > 0 && bytes < meta.bytes) return (meta.seconds * bytes) / meta.bytes;
  return meta.seconds;
}

const inFlight = new Map<CaptureKind, Promise<Interrupted | undefined>>();

/**
 * The newest interrupted recording of this kind that no open tab holds, or undefined. One search
 * per kind at a time on a page: a second caller (React's double effect in development, a remount)
 * shares the first one's answer instead of racing it.
 */
export function findInterrupted(
  kind: CaptureKind,
  now = Date.now(),
): Promise<Interrupted | undefined> {
  const running = inFlight.get(kind);
  if (running) return running;
  const p = search(kind, now).finally(() => inFlight.delete(kind));
  inFlight.set(kind, p);
  return p;
}

/** Finished and unheld recordings are removed on the way; so are interrupted ones past `RECOVER_DAYS`. */
async function search(kind: CaptureKind, now: number): Promise<Interrupted | undefined> {
  if (typeof navigator === "undefined" || typeof navigator.locks?.request !== "function")
    return undefined;
  const root = await recordingsRoot();
  if (!root) return undefined;
  await sweepRecordings().catch(() => undefined);
  let best: Interrupted | undefined;
  for (const session of await names(root).catch(() => [] as string[])) {
    if (session === currentSession() || !(await unheld(session))) continue;
    const dir = await root.getDirectoryHandle(session).catch(() => undefined);
    if (!dir) continue;
    for (const n of await names(dir).catch(() => [] as string[])) {
      if (!n.endsWith(".json")) continue;
      const name = n.slice(0, -5);
      try {
        const meta = JSON.parse(
          await (await (await dir.getFileHandle(n)).getFile()).text(),
        ) as RecordingMeta;
        if (meta.v !== 1 || meta.finished || meta.kind !== kind) continue;
        if (now - meta.started >= RECOVER_DAYS * 86_400_000) continue;
        const media = await (await dir.getFileHandle(name)).getFile();
        if (media.size < 64) continue;
        const found = {
          session,
          name,
          meta,
          bytes: media.size,
          seconds: writtenSeconds(meta, media.size),
        };
        if (!best || meta.started > best.meta.started) best = found;
      } catch {
        // Unreadable: not offered.
      }
    }
  }
  return best;
}

/** Throws an interrupted recording away. */
export async function discardInterrupted(it: Interrupted): Promise<void> {
  const root = await recordingsRoot();
  await root?.removeEntry(it.session, { recursive: true }).catch(() => undefined);
}
