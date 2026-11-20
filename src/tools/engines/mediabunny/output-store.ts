/**
 * Where an engine's output is written. Small outputs stay in memory (mediabunny `BufferTarget`, fast
 * start in memory). Large ones stream to the Origin Private File System through a sync access
 * handle, so nothing near their size is held in memory: an `ArrayBuffer` cannot pass 2 GiB, and
 * every output over that failed at the very end (merge of two 1.14 GB clips, a lossless trim of a
 * 2.28 GB file, a 4K reverse; QA 2026-10-08), reported as "out of memory".
 *
 * The finished file is handed on as the OPFS `File` itself (or a Blob made of slices of it plus a
 * few rewritten bytes), which the page downloads without reading it into memory. Each worker keeps
 * its files in its own directory under `outputs/`, held by a Web Lock while it lives; a new worker
 * removes the directories whose lock nobody holds (pages closed or reloaded). Cancel and failure
 * remove the partial file at once; `releaseOutputs()` removes the rest (Start over).
 *
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import {
  BlobSource,
  BufferSource,
  BufferTarget,
  Input,
  type InputAudioTrack,
  MP4,
  QTFF,
  StreamTarget,
  type StreamTargetChunk,
  type Target,
} from "mediabunny";
import { formatBytes } from "@/lib/format";
import { EngineError } from "../errors";
import { applyPrimingEdits, editTrailingMoov, type PrimingEdit } from "./edit-list";
import { type MatroskaTrackPlan, rewriteMatroska } from "./matroska-timing";
import { clearMovieTimes } from "./movie-header";

/** Outputs expected above this are streamed to OPFS when it is available. */
export const STREAM_ABOVE_BYTES = 768 * 1024 * 1024;
/** The most an in-memory output can safely reach (an ArrayBuffer stops at 2 GiB; it doubles to grow). */
export const IN_MEMORY_LIMIT_BYTES = 1.8e9;

export interface OutputStore {
  target: Target;
  /** True when the output streams to OPFS (MP4/MOV then put their index at the end). */
  streamed: boolean;
  /**
   * After `output.finalize()`: the file, in memory (an ArrayBuffer, which the caller may still edit
   * in place) or on disk (an OPFS-backed File).
   */
  finish(): Promise<ArrayBuffer | File>;
  /** On cancel or failure: frees the memory or removes the partial file. */
  discard(): Promise<void>;
}

const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const LOCK = `ilv-outputs-${sessionId}`;
let sessionDir: Promise<FileSystemDirectoryHandle | null> | undefined;

type SyncHandle = {
  write(data: BufferSource, options?: { at?: number }): number;
  flush(): void;
  close(): void;
};
type SyncCapableHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> };

/** Whether this context can stream to OPFS (a worker with sync access handles and Web Locks). */
const opfsAvailable = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.storage?.getDirectory === "function" &&
  typeof FileSystemFileHandle !== "undefined" &&
  "createSyncAccessHandle" in FileSystemFileHandle.prototype &&
  typeof navigator.locks?.request === "function";

/** This worker's output directory, created on first use; stale ones are swept then. */
function outputsDir(): Promise<FileSystemDirectoryHandle | null> {
  sessionDir ??= (async () => {
    if (!opfsAvailable()) return null;
    try {
      const root = await navigator.storage.getDirectory();
      const outputs = await root.getDirectoryHandle("outputs", { create: true });
      // Hold this session's lock for the worker's life (the promise never settles).
      let held: () => void = () => undefined;
      const holding = new Promise<void>((resolve) => {
        held = resolve;
      });
      void navigator.locks.request(LOCK, () => {
        held();
        return new Promise<void>(() => undefined);
      });
      await holding;
      await sweep(outputs);
      return await outputs.getDirectoryHandle(sessionId, { create: true });
    } catch {
      return null;
    }
  })();
  return sessionDir;
}

/** Removes the directories of sessions that have ended (nobody holds their lock). */
async function sweep(outputs: FileSystemDirectoryHandle) {
  const names: string[] = [];
  for await (const name of (outputs as unknown as { keys(): AsyncIterable<string> }).keys())
    names.push(name);
  for (const name of names) {
    if (name === sessionId) continue;
    await navigator.locks.request(`ilv-outputs-${name}`, { ifAvailable: true }, async (lock) => {
      if (lock) await outputs.removeEntry(name, { recursive: true }).catch(() => undefined);
    });
  }
}

/** Removes every output this worker wrote (Start over); results already handed on stop reading. */
export async function releaseOutputs(): Promise<void> {
  const dir = await outputsDir();
  if (!dir) return;
  const names: string[] = [];
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys())
    names.push(name);
  for (const name of names) await dir.removeEntry(name).catch(() => undefined);
}

let counter = 0;

/**
 * An output for a job expected to write about `expectedBytes`. Streams to OPFS above
 * `STREAM_ABOVE_BYTES` when it can; without OPFS, refuses before any work when the output could not
 * fit in memory.
 */
export async function openOutputStore(expectedBytes: number): Promise<OutputStore> {
  const dir = expectedBytes > STREAM_ABOVE_BYTES ? await outputsDir() : null;
  if (!dir) {
    if (expectedBytes > IN_MEMORY_LIMIT_BYTES)
      throw new EngineError(
        "resource",
        `The result would be about ${formatBytes(expectedBytes)}, more than a browser can hold in memory (about 2 GB), and this browser cannot write it to disk storage.`,
        "Use a current desktop Chrome, Edge or Firefox, or process a shorter part of the file.",
      );
    const target = new BufferTarget();
    return {
      target,
      streamed: false,
      finish: async () => {
        const buffer = target.buffer;
        if (!buffer)
          throw new EngineError("internal", "The result could not be written.", "Try again.");
        return buffer;
      },
      discard: async () => undefined,
    };
  }
  const name = `out-${++counter}`;
  const handle = (await dir.getFileHandle(name, { create: true })) as SyncCapableHandle;
  const access = await handle.createSyncAccessHandle();
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    try {
      access.flush();
    } finally {
      access.close();
    }
  };
  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      access.write(chunk.data, { at: chunk.position });
    },
  });
  return {
    target: new StreamTarget(writable, { chunked: true }),
    streamed: true,
    finish: async () => {
      close();
      return handle.getFile();
    },
    discard: async () => {
      try {
        close();
      } catch {
        // already closed
      }
      await dir.removeEntry(name).catch(() => undefined);
    },
  };
}

/** A finished output read back whole, for the rewrites that need it; refused past the memory limit. */
export async function bytesOf(blob: Blob): Promise<Uint8Array<ArrayBuffer> | null> {
  if (blob.size > IN_MEMORY_LIMIT_BYTES * 0.8) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Clears the MP4/MOV header times (remove metadata) in a finished output: in place in memory, or by
 * editing the index at the end of a streamed file. Returns the file to use from then on.
 */
export async function clearTimesIn(data: ArrayBuffer | Blob): Promise<ArrayBuffer | Blob> {
  if (data instanceof ArrayBuffer) {
    clearMovieTimes(new Uint8Array(data));
    return data;
  }
  const parts = await editTrailingMoov(data, (moov) => {
    clearMovieTimes(moov);
    return true;
  });
  return parts ? new Blob(parts) : data;
}

/**
 * Writes edit lists into a finished MP4/MOV output, in memory or streamed: `editsFor` gets the
 * output's sound tracks as read back (in the order they were added) and returns the edits. Returns
 * the file as parts, or null when there is nothing to edit.
 */
export async function editOutputSound(
  data: ArrayBuffer | Blob,
  editsFor: (tracks: InputAudioTrack[]) => PrimingEdit[],
): Promise<BlobPart[] | null> {
  const back = new Input({
    source: data instanceof ArrayBuffer ? new BufferSource(data) : new BlobSource(data),
    formats: [MP4, QTFF],
  });
  try {
    const edits = editsFor(await back.getAudioTracks());
    if (edits.length === 0) return null;
    return data instanceof ArrayBuffer
      ? applyPrimingEdits(new Uint8Array(data), edits)
      : await editTrailingMoov(data, (moov) => applyPrimingEdits(moov, edits, false));
  } finally {
    back.dispose();
  }
}

/** Matroska/WebM rewrite of a finished output (./matroska-timing), when it can be read back whole. */
export async function rewriteOutputMatroska(
  data: ArrayBuffer | Blob,
  plans: Map<number, MatroskaTrackPlan>,
): Promise<BlobPart[] | null> {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : await bytesOf(data);
  return bytes ? rewriteMatroska(bytes, plans) : null;
}
