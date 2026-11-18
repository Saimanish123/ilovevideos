/**
 * Starting our workers so that their first message is never lost (ADR-0092).
 *
 * Turbopack's worker bootstrap loads the chunks with `importScripts` and returns, which lets
 * messages through, but the worker's own module runs only after its runtime has awaited the other
 * chunks, so a job posted right after `new Worker()` can reach a worker with no handler. So each
 * worker posts `READY` as the last line of its module and the page sends nothing before it. A worker
 * that has not said it is ready within `READY_TIMEOUT_MS` (it has run none of our code) is replaced.
 * The stall of 2026-11-18 itself came from the service worker handing every worker the first
 * worker's cached bootstrap (public/sw.js `forRequest`); this guards the race that remains.
 */

/** The message a worker posts once its handler is set. */
export const READY = "worker-ready" as const;

/** How long a worker may take to say it is ready before it is replaced (cached chunks: ~60 ms). */
export const READY_TIMEOUT_MS = 4000;
/** Replacements before the last worker is left to finish loading however long it takes. */
export const READY_RETRIES = 3;

/** Posts `READY` from inside a worker (call last, after `self.onmessage` is assigned). */
export function announceReady(): void {
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: READY });
}

/** Whether a message from a worker is its `READY`. */
export const isReady = (data: unknown): boolean =>
  !!data && typeof data === "object" && (data as { type?: unknown }).type === READY;

export interface StartedWorker {
  /** Ends the worker in use (and any waiting replacement). */
  terminate(): void;
}

/**
 * Creates a worker with `create`, sends `message` once it has said it is ready, and passes every
 * later message to `onMessage`. A worker that does not say it is ready in time is terminated and
 * created again, up to `READY_RETRIES` times; `onError` hears errors of the worker in use.
 */
export function startWorker<T>(
  create: () => Worker,
  message: unknown,
  onMessage: (event: MessageEvent<T>) => void,
  onError?: (event: ErrorEvent) => void,
  transfer: Transferable[] = [],
  timeoutMs = READY_TIMEOUT_MS,
): StartedWorker {
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const spawn = (attempt: number) => {
    const w = create();
    worker = w;
    let sent = false;
    w.onmessage = (event: MessageEvent<T>) => {
      if (isReady(event.data)) {
        if (!sent) {
          sent = true;
          if (timer) clearTimeout(timer);
          w.postMessage(message, transfer);
        }
        return;
      }
      onMessage(event);
    };
    w.onerror = (event) => onError?.(event);
    if (attempt < READY_RETRIES)
      timer = setTimeout(() => {
        if (sent || stopped) return;
        console.warn(`worker-not-ready: replaced after ${timeoutMs} ms (attempt ${attempt + 1})`);
        w.terminate();
        spawn(attempt + 1);
      }, timeoutMs);
  };
  spawn(0);
  return {
    terminate() {
      stopped = true;
      if (timer) clearTimeout(timer);
      worker?.terminate();
    },
  };
}
