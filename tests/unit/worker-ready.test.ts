import { afterEach, describe, expect, it, vi } from "vitest";
import {
  announceReady,
  isReady,
  READY,
  READY_RETRIES,
  READY_TIMEOUT_MS,
  startWorker,
} from "@/tools/workers/ready";

/**
 * A worker as Turbopack builds them (ADR-0092): messages are delivered as soon as the bootstrap
 * returns, but the module that sets the handler runs later, or, now and then, never; anything posted
 * before it runs is lost.
 */
class RacyWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  handlerSet = false;
  terminated = false;
  received: unknown[] = [];
  lost: unknown[] = [];
  constructor(_url?: unknown, _opts?: unknown) {
    workers.push(this);
  }
  postMessage(m: unknown) {
    if (this.handlerSet) this.received.push(m);
    else this.lost.push(m);
  }
  /** The module has run: its handler is set and it says so. */
  evaluate(ready: unknown = { type: READY }) {
    this.handlerSet = true;
    this.onmessage?.({ data: ready } as MessageEvent);
  }
  terminate() {
    this.terminated = true;
  }
  addEventListener() {}
}
const workers: RacyWorker[] = [];
const create = () => new RacyWorker() as unknown as Worker;

afterEach(() => {
  workers.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("worker ready handshake (ADR-0092)", () => {
  it("sends the job only once the worker has said it is ready, and passes later messages on", () => {
    const seen: unknown[] = [];
    const started = startWorker(create, { type: "analyze" }, (e) => seen.push(e.data));
    const w = workers[0] as RacyWorker;
    expect(w.received).toEqual([]);
    expect(w.lost).toEqual([]);
    w.evaluate();
    expect(w.received).toEqual([{ type: "analyze" }]);
    w.onmessage?.({ data: { type: "done" } } as MessageEvent);
    expect(seen).toEqual([{ type: "done" }]);
    w.onmessage?.({ data: { type: READY } } as MessageEvent);
    expect(w.received).toHaveLength(1);
    started.terminate();
    expect(w.terminated).toBe(true);
  });

  it("replaces a worker that never runs its module, and the job reaches the new one", () => {
    vi.useFakeTimers();
    startWorker(create, { type: "read" }, () => undefined);
    vi.advanceTimersByTime(READY_TIMEOUT_MS + 1);
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated).toBe(true);
    (workers[1] as RacyWorker).evaluate();
    expect(workers[1]?.received).toEqual([{ type: "read" }]);
    // No more replacements once one has answered.
    vi.advanceTimersByTime(10 * READY_TIMEOUT_MS);
    expect(workers).toHaveLength(2);
  });

  it("stops replacing after the last retry and leaves that worker to load", () => {
    vi.useFakeTimers();
    startWorker(create, { type: "read" }, () => undefined);
    vi.advanceTimersByTime(20 * READY_TIMEOUT_MS);
    expect(workers).toHaveLength(READY_RETRIES + 1);
    expect(workers.at(-1)?.terminated).toBe(false);
  });

  it("the engine client queues inspect and run until a worker is ready, replacing a silent one", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", RacyWorker);
    const { EngineClient } = await import("@/tools/workers/client");
    const client = new EngineClient();
    void client.inspect(new File(["x"], "a.mp4")).catch(() => undefined);
    void client.run("volume", new File(["x"], "a.mp4"), {}).catch(() => undefined);
    vi.advanceTimersByTime(READY_TIMEOUT_MS + 1);
    expect(workers).toHaveLength(2);
    const w = workers[1] as RacyWorker;
    expect(w.lost).toEqual([]);
    w.evaluate({ type: "ready", id: 0 });
    expect(w.received.map((m) => (m as { type: string }).type)).toEqual(["inspect", "run"]);
    expect(workers[0]?.lost).toEqual([]);
    client.dispose();
  });

  it("announces readiness with the shared message", () => {
    const posted: unknown[] = [];
    vi.stubGlobal("self", { postMessage: (m: unknown) => posted.push(m) });
    announceReady();
    expect(posted).toEqual([{ type: READY }]);
    expect(isReady(posted[0])).toBe(true);
    expect(isReady({ type: "ready", id: 0 })).toBe(false);
  });
});
