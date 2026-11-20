/**
 * Where a recording is written while it runs. A recording has no expected size, so it always
 * streams: to an Origin Private File System file written in place by the storage worker's sync
 * access handle (ADR-0130), so what was written survives a closed, crashed or reloaded tab; where a
 * worker cannot hold one, through the page's `createWritable()` (kept only once the stream closes);
 * and where there is no OPFS at all, to a growing buffer in memory, capped below what one
 * `ArrayBuffer` can hold. Either way the recorder sees the bytes written so far, which the page
 * shows as the live size.
 *
 * Files sit in `recordings/<session>/`, held by a Web Lock while the page lives. Each recording is
 * `<n>` (the media), `<n>.json` (what it is, ./journal `RecordingMeta`) and, for MP4 and M4A,
 * `<n>.index` (one entry per packet). Whichever recorder page opens next removes the directories
 * nobody holds, except an unfinished recording, which it offers to recover (./recover).
 *
 * No network access (README.md#privacy-and-processing §2).
 */
import { StreamTarget, type StreamTargetChunk, type Target } from "mediabunny";
import { opfsWritable, StorageWorker } from "@/lib/storage/opfs";
import { encodeEntries, type JournalEntry, type RecordingMeta } from "./journal";
import { RECORDINGS_DIR, recordingsDir, sessionId } from "./recordings";

export {
  adoptRecording,
  currentSession,
  lockName,
  RECORDINGS_DIR,
  recordingsRoot,
  releaseRecordings,
  sweepRecordings,
} from "./recordings";

/** The most an in-memory recording may reach before the recorder stops it (an ArrayBuffer ends at 2 GiB). */
export const MEMORY_LIMIT_BYTES = 1.8e9;

export interface CaptureSink {
  target: Target;
  /** True when the recording goes to disk storage rather than memory. */
  onDisk: boolean;
  /** True when what is written survives the tab closing (in place, through the storage worker). */
  durable: boolean;
  /** Bytes in the file so far (the furthest byte written). */
  bytes(): number;
  /** Records one encoded packet in the index (MP4 and M4A; batched, written about once a second). */
  journal(entry: JournalEntry): void;
  /** Rewrites the recording's description. */
  describe(meta: RecordingMeta): void;
  /** After `output.finalize()`: the finished file. */
  finish(type: string): Promise<Blob>;
  /** On cancel or failure: removes the partial file or frees the memory. */
  discard(): Promise<void>;
}

type WritableHandle = FileSystemFileHandle & {
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
};

let counter = 0;

/** A sink for one recording: in place on disk where the browser allows, else in memory. */
export async function openCaptureSink(opts: { journal?: boolean } = {}): Promise<CaptureSink> {
  const dir = await recordingsDir();
  let size = 0;
  const grow = (chunk: StreamTargetChunk) => {
    size = Math.max(size, chunk.position + chunk.data.byteLength);
  };
  const name = `recording-${++counter}`;
  if (dir && opfsWritable()) {
    const worker = new StorageWorker();
    try {
      await worker.request({
        op: "open",
        dir: [RECORDINGS_DIR, sessionId],
        name,
        journal: !!opts.journal,
      });
      let pending: JournalEntry[] = [];
      let last = 0;
      const flushJournal = () => {
        if (pending.length === 0) return;
        const data = encodeEntries(pending);
        pending = [];
        last = performance.now();
        void worker.request({ op: "journal", data }, [data]).catch(() => undefined);
      };
      let closed = false;
      const close = async (keepJournal = false) => {
        if (closed) return;
        closed = true;
        flushJournal();
        await worker.request({ op: "close", keepJournal }).catch(() => undefined);
        worker.terminate();
      };
      const writable = new WritableStream<StreamTargetChunk>({
        async write(chunk) {
          grow(chunk);
          // A copy goes to the worker (transferred): the muxer reuses its chunk buffers.
          const data = chunk.data.slice().buffer;
          await worker.request({ op: "write", at: chunk.position, data }, [data]);
        },
      });
      return {
        // Not chunked: the muxer's writes go to disk as it makes them (a chunk of media about every
        // half second), so a crash loses about that much rather than a whole buffer.
        target: new StreamTarget(writable),
        onDisk: true,
        durable: true,
        bytes: () => size,
        journal(entry) {
          if (!opts.journal || closed) return;
          pending.push(entry);
          if (pending.length >= 256 || performance.now() - last > 1000) flushJournal();
        },
        describe(meta) {
          if (closed) return;
          void worker.request({ op: "meta", text: JSON.stringify(meta) }).catch(() => undefined);
        },
        finish: async (type) => {
          await close();
          const f = await (await dir.getFileHandle(name)).getFile();
          return f.type === type ? f : new File([f], f.name, { type });
        },
        discard: async () => {
          await close();
          for (const n of [name, `${name}.json`, `${name}.index`])
            await dir.removeEntry(n).catch(() => undefined);
        },
      };
    } catch {
      worker.terminate();
      await dir.removeEntry(name).catch(() => undefined);
      // The worker could not open the file: the page's own stream below.
    }
  }
  if (dir) {
    try {
      const handle = (await dir.getFileHandle(name, { create: true })) as WritableHandle;
      if (!("createWritable" in handle)) throw new Error("No writable streams.");
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
        // Chunks of 2 MiB: this stream is kept only once closed, so writes stay few.
        target: new StreamTarget(writable, { chunked: true, chunkSize: 2 * 1024 * 1024 }),
        onDisk: true,
        durable: false,
        bytes: () => size,
        journal: () => undefined,
        describe: () => undefined,
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
    durable: false,
    bytes: () => size,
    journal: () => undefined,
    describe: () => undefined,
    finish: async (type) => new Blob([buffer.subarray(0, size)], { type }),
    discard: async () => {
      buffer = new Uint8Array(0);
    },
  };
}
