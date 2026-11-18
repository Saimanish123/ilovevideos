import { describe, expect, it, vi } from "vitest";
import { breather, paced, pacedRatio } from "@/tools/engines/sound/pace";

/**
 * Long sound jobs stay cancellable and do not flood the page (2026-10-08: a 3-hour WAV sent a
 * progress message per decoded block and never yielded, so Cancel waited for the whole job).
 */
describe("sound pacing", () => {
  it("breather lets a queued macrotask (a cancel message) run during a microtask-only loop", async () => {
    let cancelled = false;
    setTimeout(() => {
      cancelled = true;
    }, 0);
    const breathe = breather(0);
    let steps = 0;
    // A loop of resolved awaits never reaches the timer queue on its own.
    while (!cancelled && steps < 100_000) {
      await Promise.resolve();
      await breathe();
      steps++;
    }
    expect(cancelled).toBe(true);
    expect(steps).toBeLessThan(10);
  });

  it("paced passes one report per interval and every change of phase", () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const report = paced((p) => seen.push(`${p.phase}:${p.ratio}`), 100);
    for (let i = 0; i < 1000; i++) report({ phase: "processing", ratio: i / 1000 });
    report({ phase: "finishing", ratio: 1 });
    expect(seen).toEqual(["processing:0", "finishing:1"]);
    vi.advanceTimersByTime(150);
    report({ phase: "finishing", ratio: 1 });
    expect(seen).toHaveLength(3);
    vi.useRealTimers();
  });

  it("pacedRatio always passes the last step", () => {
    const seen: number[] = [];
    const report = pacedRatio((r) => seen.push(r), 1000);
    for (let i = 0; i <= 100; i++) report?.(i / 100);
    expect(seen).toEqual([0, 1]);
  });
});
