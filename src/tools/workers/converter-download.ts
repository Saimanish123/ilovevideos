/**
 * Fetches a self-hosted converter file and proves it arrived whole before ffmpeg.wasm compiles it
 * (ADR-0147). Lives with the workers because only they may fetch, and only our own files
 * (`pnpm lint:privacy`). A connection that drops mid-download can hand over a short body without an error
 * (measured 2026-11-19 under load in Playwright's mobile Chrome: 27.4 of 32.7 MB), and compiling it
 * fails with "section extends past end of the module", which says nothing a person can act on. Here
 * the byte count is checked against the size kept with the files (engines/ffmpeg/size); a short or long file is
 * dropped from every Cache Storage cache this site keeps, so a partial copy is never served again,
 * and fetched once more. Real progress is reported as the bytes arrive. Our own origin only.
 */
import { formatBytes } from "@/lib/format";
import { EngineError } from "@/tools/engines/errors";

/** Why a download is not the file, or undefined when it is. Pure. */
export function lengthProblem(
  received: number,
  expected: number,
  contentLength: number | undefined,
): "short" | "long" | undefined {
  // The size kept with the files is the truth; a Content-Length that disagrees with the bytes read
  // means the body was cut, whatever the expected size says.
  if (contentLength !== undefined && contentLength > 0 && received !== contentLength)
    return received < contentLength ? "short" : "long";
  if (received < expected) return "short";
  if (received > expected) return "long";
  return undefined;
}

/** The failure a person sees when the file never arrives whole. */
export const downloadFailed = () =>
  new EngineError(
    "resource",
    "The converter did not finish downloading.",
    "Check the connection and try again.",
  );

export interface DownloadProgress {
  received: number;
  total: number;
}

/** Removes `url` from every Cache Storage cache, so the next request goes to the network. */
async function forget(url: string): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const absolute = new URL(url, globalThis.location?.href).href;
    for (const name of await caches.keys()) await (await caches.open(name)).delete(absolute);
  } catch {
    // Storage blocked: nothing cached to remove.
  }
}

/** One request's body: from the start (`from` 0) or the rest of the file from `from` (a Range). */
export interface Piece {
  bytes: Uint8Array;
  /** Content-Length of this response, when the body was not sent compressed. */
  contentLength?: number;
  /** True when the server answered the Range with 206: `bytes` start at `from`. */
  partial: boolean;
}

export async function readAll(
  url: string,
  onProgress: (got: number) => void,
  fresh: boolean,
  from = 0,
): Promise<Piece> {
  // Our own static files only: a converter file, never user data, never another origin.
  if (new URL(url, globalThis.location?.href).origin !== globalThis.location?.origin)
    throw downloadFailed();
  const init: RequestInit = {
    ...(fresh ? { cache: "reload" as const } : {}),
    ...(from > 0 ? { headers: { Range: `bytes=${from}-` } } : {}),
  };
  const response = await fetch(url, init); // privacy-allow: our own converter file, same origin
  if (!response.ok || !response.body) throw downloadFailed();
  // A compressed body's Content-Length counts the compressed bytes, not the ones read here.
  const header = response.headers.get("content-encoding")
    ? Number.NaN
    : Number(response.headers.get("content-length") ?? "");
  const contentLength = Number.isFinite(header) && header > 0 ? header : undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = await reader.read();
    } catch {
      // The connection dropped: what arrived is short.
      break;
    }
    if (step.done) break;
    chunks.push(step.value);
    received += step.value.byteLength;
    onProgress(received);
  }
  return { bytes: join(chunks, received), contentLength, partial: response.status === 206 };
}

const join = (chunks: Uint8Array[], length: number) => {
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return bytes;
};

/** Tries in all: the first request and up to two that continue where the last one stopped. */
const TRIES = 3;

/**
 * The file at `url` as a Blob, `expected` bytes long, or `downloadFailed()`. A body cut short is
 * continued from where it stopped with a Range request (a dropped connection was measured to stop
 * at the same byte under load, so starting over can fail the same way); a server that ignores the
 * Range starts it over. Before each retry any cached copy is dropped, so a partial file stored by
 * an earlier visit is not served again.
 */
export async function downloadWhole(
  url: string,
  expected: number,
  type: string,
  onProgress: (p: DownloadProgress) => void,
  fetchOnce: typeof readAll = readAll,
  dropCached: (url: string) => Promise<void> = forget,
): Promise<Blob> {
  let have: Uint8Array[] = [];
  let size = 0;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    if (attempt > 0) await dropCached(url);
    const from = size;
    let piece: Piece;
    try {
      piece = await fetchOnce(
        url,
        (got) => onProgress({ received: from + got, total: expected }),
        attempt > 0,
        from,
      );
    } catch {
      continue;
    }
    // A cut inside this response (its own length disagrees) still keeps what arrived.
    if (piece.partial && from > 0) {
      have.push(piece.bytes);
      size += piece.bytes.byteLength;
    } else {
      have = [piece.bytes];
      size = piece.bytes.byteLength;
    }
    const problem =
      lengthProblem(size, expected, undefined) ??
      (piece.contentLength !== undefined && piece.bytes.byteLength !== piece.contentLength
        ? "short"
        : undefined);
    if (!problem) return new Blob(have as BlobPart[], { type });
    console.warn(
      `converter-download: ${url} came to ${formatBytes(size)} of ${formatBytes(expected)} (${problem})`,
    );
    // Longer than the file: what arrived is not this file; start over.
    if (problem === "long") {
      have = [];
      size = 0;
    }
  }
  await dropCached(url);
  throw downloadFailed();
}
