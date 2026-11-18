/**
 * Where a recording is written while it runs. A recording has no expected size, so it always
 * streams: to an Origin Private File System file through `createWritable()` on the page (the media
 * sources need the page's MediaStream tracks, so the muxer runs here, not in the engine worker),
 * and only where the browser has no OPFS to a growing buffer in memory, capped below what one
 * `ArrayBuffer` can hold. Either way the recorder sees the bytes written so far, which the page
 * shows as the live size.
 *
 * Files sit in `outputs/<session>/`, held by a Web Lock while the page lives, the convention of
 * the engine worker's output store (../mediabunny/output-store): whichever starts next removes the
 * directories nobody holds, so a closed or reloaded page leaves nothing behind.
 *
 * No network access (README.md#privacy-and-processing §2).
 */
import { StreamTarget, type StreamTargetChunk, type Target } from "mediabunny";

/** The most an in-memory recording may reach before the recorder stops it (an ArrayBuffer ends at 2 GiB). */
export const MEMORY_LIMIT_BYTES = 1.8e9;

export interface CaptureSink {
  target: Target;
  /** True when the recording goes to disk storage rather than memory. */
  onDisk: boolean;
  /** Bytes in the file so far (the furthest byte written). */
  bytes(): number;
  /** After `output.finalize()`: the finished file. */
  finish(type: string): Promise<Blob>;
  /** On cancel or failure: removes the partial file or frees the memory. */
  discard(): Promise<void>;
}

const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let sessionDir: Promise<FileSystemDirectoryHandle | null> | undefined;

type WritableHandle = FileSystemFileHandle & {
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
};

const opfsOnPage = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.storage?.getDirectory === "function" &&
  typeof FileSystemFileHandle !== "undefined" &&
  "createWritable" in FileSystemFileHandle.prototype &&
  typeof navigator.locks?.request === "function";

/** This page's recordings directory, created on first use; stale ones are swept then. */
function recordingsDir(): Promise<FileSystemDirectoryHandle | null> {
  sessionDir ??= (async () => {
    if (!opfsOnPage()) return null;
    try {
      const root = await navigator.storage.getDirectory();
      const outputs = await root.getDirectoryHandle("outputs", { create: true });
      let held: () => void = () => undefined;
      const holding = new Promise<void>((resolve) => {
        held = resolve;
      });
      void navigator.locks.request(`ilv-outputs-${sessionId}`, () => {
        held();
        return new Promise<void>(() => undefined);
      });
      await holding;
      const names: string[] = [];
      for await (const name of (outputs as unknown as { keys(): AsyncIterable<string> }).keys())
        names.push(name);
      for (const name of names) {
        if (name === sessionId) continue;
        await navigator.locks.request(
          `ilv-outputs-${name}`,
          { ifAvailable: true },
          async (lock) => {
            if (lock) await outputs.removeEntry(name, { recursive: true }).catch(() => undefined);
          },
        );
      }
      return await outputs.getDirectoryHandle(sessionId, { create: true });
    } catch {
      return null;
    }
  })();
  return sessionDir;
}

/** Removes this page's earlier recordings (a new one starts; the old result is gone from the page). */
export async function releaseRecordings(): Promise<void> {
  const dir = await recordingsDir();
  if (!dir) return;
  const names: string[] = [];
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys())
    names.push(name);
  for (const name of names) await dir.removeEntry(name).catch(() => undefined);
}

let counter = 0;

/** A sink for one recording: on disk where the browser allows, else in memory. */
export async function openCaptureSink(): Promise<CaptureSink> {
  const dir = await recordingsDir();
  let size = 0;
  const grow = (chunk: StreamTargetChunk) => {
    size = Math.max(size, chunk.position + chunk.data.byteLength);
  };
  if (dir) {
    const name = `recording-${++counter}`;
    try {
      const handle = (await dir.getFileHandle(name, { create: true })) as WritableHandle;
      const file = await handle.createWritable({ keepExistingData: false });
      const writer = file.getWriter();
      const writable = new WritableStream<StreamTargetChunk>({
        async write(chunk) {
          grow(chunk);
          await writer.write({ type: "write", position: chunk.position, data: chunk.data });
        },
        async close() {
          await writer.close();
        },
        async abort(reason) {
          await writer.abort(reason).catch(() => undefined);
        },
      });
      return {
        // Chunks of 2 MiB: a crash loses at most that much buffered, and writes stay few.
        target: new StreamTarget(writable, { chunked: true, chunkSize: 2 * 1024 * 1024 }),
        onDisk: true,
        bytes: () => size,
        finish: async (type) => {
          const f = await handle.getFile();
          return f.type === type ? f : new File([f], f.name, { type });
        },
        discard: async () => {
          await writer.abort().catch(() => undefined);
          await dir.removeEntry(name).catch(() => undefined);
        },
      };
    } catch {
      // Storage refused (quota, private mode): fall through to memory.
    }
  }
  let buffer = new Uint8Array(8 * 1024 * 1024);
  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      const end = chunk.position + chunk.data.byteLength;
      if (end > MEMORY_LIMIT_BYTES) throw new RangeError("The recording no longer fits in memory.");
      if (end > buffer.byteLength) {
        let next = buffer.byteLength;
        while (next < end) next *= 2;
        const grown = new Uint8Array(Math.min(next, MEMORY_LIMIT_BYTES));
        grown.set(buffer.subarray(0, size));
        buffer = grown;
      }
      buffer.set(chunk.data, chunk.position);
      grow(chunk);
    },
  });
  return {
    target: new StreamTarget(writable),
    onDisk: false,
    bytes: () => size,
    finish: async (type) => new Blob([buffer.subarray(0, size)], { type }),
    discard: async () => {
      buffer = new Uint8Array(0);
    },
  };
}
