import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Measures what each Playwright browser provides for the engines, on the page and in a worker
 * (/dev/support, src/lib/browser-support/probe.ts, ADR-0145). With CAPABILITIES_OUT=1 the facts are
 * written to src/lib/browser-support/measured/<project>.json, from which
 * `pnpm tsx scripts/capability-matrix.ts` writes the matrix in README.md#feature-catalog.
 */
test("the browser support probe measures this browser", async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  await page.goto("/dev/support");
  const pre = page.locator("pre[data-facts]");
  await expect(pre).not.toHaveAttribute("data-facts", "", { timeout: 60_000 });
  const facts = JSON.parse((await pre.getAttribute("data-facts")) ?? "{}");
  expect(facts.error).toBeUndefined();
  expect(facts.window.scope).toBe("window");
  expect(facts.worker.scope).toBe("worker");
  // Every browser the site supports reads H.264 and runs the converter (isolation is on every page).
  expect(facts.worker.decode.avc).toBe(true);
  expect(facts.window.crossOriginIsolated).toBe(true);
  if (process.env.CAPABILITIES_OUT === "1") {
    mkdirSync("src/lib/browser-support/measured", { recursive: true });
    writeFileSync(
      `src/lib/browser-support/measured/${info.project.name}.json`,
      `${JSON.stringify(
        {
          project: info.project.name,
          browser: `${browser.browserType().name()} ${browser.version()}`,
          measured: new Date().toISOString().slice(0, 10),
          ...facts,
        },
        null,
        2,
      )}\n`,
    );
  }
});

/**
 * How much slower the ffmpeg.wasm path is than the native one for the most used tools (ADR-0147),
 * with the converter already loaded. Opt in with BENCH=1: it takes minutes.
 */
const jobs: [engine: string, fixture: string, options: Record<string, unknown>][] = [
  ["compress", "sample-30s.mp4", { preset: "balanced" }],
  ["compress", "sample-large.mp4", { preset: "target", targetMb: 8, maxHeight: "auto" }],
  ["convert-video", "sample.webm", { to: "mp4", videoCodec: "avc" }],
  ["aspect-ratio", "sample-30s.mp4", { ratio: "9:16", maxWidth: 1080, maxHeight: 1920 }],
  ["video-to-gif", "sample-30s.mp4", { start: 0, end: 5 }],
  ["convert-audio", "sample.wav", { to: "m4a" }],
];
test("the slower path's speed", async ({ page }, info) => {
  test.skip(process.env.BENCH !== "1", "BENCH=1 runs it");
  test.setTimeout(900_000);
  await page.goto("/dev/support");
  await expect(page.locator("pre[data-facts]")).not.toHaveAttribute("data-facts", "", {
    timeout: 60_000,
  });
  for (const [engine, fixture, options] of jobs) {
    await page.locator("input[data-bench-file]").setInputFiles(`tests/fixtures/${fixture}`);
    const r = await page.evaluate(
      async ([e, o]) => {
        const input = document.querySelector<HTMLInputElement>("input[data-bench-file]");
        const file = input?.files?.[0];
        const bench = (window as unknown as { __bench: (...a: unknown[]) => Promise<unknown> })
          .__bench;
        return file ? bench(e, file, o) : null;
      },
      [engine, options] as const,
    );
    process.stdout.write(`bench ${info.project.name} ${engine} ${fixture}: ${JSON.stringify(r)}\n`);
  }
});
