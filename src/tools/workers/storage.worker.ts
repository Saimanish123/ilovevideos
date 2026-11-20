/// <reference lib="webworker" />
/**
 * Writes the site's own files to this browser's Origin Private File System through sync access
 * handles (ADR-0130, ADR-0131). Only a worker can hold one, and only a sync handle writes in place:
 * a page's `createWritable()` stream keeps its bytes in a temporary file that is thrown away unless
 * the stream is closed, so a recording written that way is lost with the tab. Here every write lands
 * in the file itself and is flushed, so what was written survives a closed, crashed or reloaded tab.
 *
 * Two jobs, one per worker instance:
 * - a recording (`open`, `write`, `journal`, `meta`, `close`): the media file written at the
 *   positions the muxer asks for, an append-only index of the packets for MP4 (../engines/capture
 *   /journal), and a small JSON description, all in one directory;
 * - a copy (`copy`, `text`): a finished Blob streamed into a file, for a kept result.
 *
 * Paths are relative to the OPFS root and come from the page's own code. No network access
 * (README.md#privacy-and-processing §2).
 */
import { announceReady } from "./ready";

export type ToStorage =
  | { id: number; op: "open"; dir: string[]; name: string; journal: boolean }
  | { id: number; op: "write"; at: number; data: ArrayBuffer }
  | { id: number; op: "journal"; data: ArrayBuffer }
  | { id: number; op: "meta"; text: string }
  | { id: number; op: "close"; keepJournal?: boolean }
  | { id: number; op: "copy"; dir: string[]; name: string; blob: Blob }
  | { id: number; op: "text"; dir: string[]; name: string; text: string };

export type FromStorage =
  | { id: number; ok: true; bytes?: number }
  | { id: number; ok: false; error: string };

interface SyncHandle {
  write(data: AllowSharedBufferSource, options?: { at?: number }): number;
  read(data: AllowSharedBufferSource, options?: { at?: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}
type SyncCapable = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> };

async function dirOf(path: string[]): Promise<FileSystemDirectoryHandle> {
  let d = await navigator.storage.getDirectory();
  for (const part of path) d = await d.getDirectoryHandle(part, { create: true });
  return d;
}

async function handleOf(dir: FileSystemDirectoryHandle, name: string): Promise<SyncHandle> {
  const fh = (await dir.getFileHandle(name, { create: true })) as SyncCapable;
  return fh.createSyncAccessHandle();
}

let rec:
  | {
      dir: FileSystemDirectoryHandle;
      name: string;
      media: SyncHandle;
      index?: SyncHandle;
      meta: SyncHandle;
    }
  | undefined;
let indexEnd = 0;
const enc = new TextEncoder();

function writeText(h: SyncHandle, text: string) {
  const bytes = enc.encode(text);
  h.truncate(0);
  h.write(bytes, { at: 0 });
  h.flush();
}

async function handle(m: ToStorage): Promise<number | undefined> {
  switch (m.op) {
    case "open": {
      const dir = await dirOf(m.dir);
      rec = {
        dir,
        name: m.name,
        media: await handleOf(dir, m.name),
        index: m.journal ? await handleOf(dir, `${m.name}.index`) : undefined,
        meta: await handleOf(dir, `${m.name}.json`),
      };
      rec.media.truncate(0);
      rec.index?.truncate(0);
      indexEnd = 0;
      return undefined;
    }
    case "write": {
      if (!rec) throw new Error("No recording is open.");
      rec.media.write(new Uint8Array(m.data), { at: m.at });
      // Each chunk is flushed: a closed or crashed tab keeps everything handed over.
      rec.media.flush();
      return undefined;
    }
    case "journal": {
      if (!rec?.index) return undefined;
      rec.index.write(new Uint8Array(m.data), { at: indexEnd });
      indexEnd += m.data.byteLength;
      rec.index.flush();
      return undefined;
    }
    case "meta": {
      if (!rec) throw new Error("No recording is open.");
      writeText(rec.meta, m.text);
      return undefined;
    }
    case "close": {
      if (!rec) return undefined;
      const r = rec;
      rec = undefined;
      r.media.flush();
      const bytes = r.media.getSize();
      r.media.close();
      r.index?.close();
      r.meta.close();
      if (!m.keepJournal) await r.dir.removeEntry(`${r.name}.index`).catch(() => undefined);
      return bytes;
    }
    case "copy": {
      const dir = await dirOf(m.dir);
      const h = await handleOf(dir, m.name);
      try {
        h.truncate(0);
        let at = 0;
        const reader = m.blob.stream().getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          at += h.write(value, { at });
        }
        h.flush();
        return at;
      } finally {
        h.close();
      }
    }
    case "text": {
      const dir = await dirOf(m.dir);
      const h = await handleOf(dir, m.name);
      try {
        writeText(h, m.text);
      } finally {
        h.close();
      }
      return undefined;
    }
  }
}

self.onmessage = (event: MessageEvent<ToStorage>) => {
  const m = event.data;
  handle(m).then(
    (bytes) => self.postMessage({ id: m.id, ok: true, bytes } satisfies FromStorage),
    (e: unknown) =>
      self.postMessage({
        id: m.id,
        ok: false,
        error: `${(e as Error)?.name ?? "Error"}: ${(e as Error)?.message ?? String(e)}`,
      } satisfies FromStorage),
  );
};

announceReady();
