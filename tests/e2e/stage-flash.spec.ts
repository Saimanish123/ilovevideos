import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * The code-split stage (options/index.ts, stage-parts.ts) must never fall back to its "Reading the
 * file" shell once a file has been read, and swapping the drop zone for the workspace must not
 * collapse and regrow the page (design review 4). WebKit is skipped: no WebCodecs encoder.
 */

/** Samples the workspace every 16 ms: whether it is the "Reading the file" fallback, and whether it is ready. */
async function startSampling(page: Page, verb: string) {
  await page.evaluate((verb) => {
    const w = window as unknown as { __samples: { reading: boolean; ready: boolean }[] };
    w.__samples = [];
    setInterval(() => {
      const ws = document.querySelector('section[aria-label="Workspace"]');
      const text = ws?.textContent ?? "";
      const ready = Array.from(ws?.querySelectorAll("button") ?? []).some(
        (b) => b.textContent?.trim() === verb,
      );
      // The fallback shell: the whole workspace reduced to "Reading the file". The same words as
      // an engine's analysing phase in the status line are real progress, not the fallback.
      w.__samples.push({ reading: text.trim() === "Reading the file", ready });
    }, 16);
  }, verb);
}

async function readingAfterReady(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = (window as unknown as { __samples: { reading: boolean; ready: boolean }[] })
      .__samples;
    const first = s.findIndex((x) => x.ready);
    return first < 0 ? -1 : s.slice(first).filter((x) => x.reading).length;
  });
}

/** Drops fixtures on the workspace from script, as a real drag and drop delivers them: not input. */
async function dropWithoutInput(page: Page, names: string[]) {
  const files = names.map((name) => ({
    name,
    b64: readFileSync(`tests/fixtures/${name}`).toString("base64"),
  }));
  await page.evaluate((files) => {
    const dt = new DataTransfer();
    for (const f of files) {
      const bytes = Uint8Array.from(atob(f.b64), (ch) => ch.charCodeAt(0));
      dt.items.add(new File([bytes], f.name, { type: "video/mp4" }));
    }
    document
      .querySelector('section[aria-label="Workspace"]')
      ?.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, files);
}

test.describe("code-split stage", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding is Chromium only");

  test("rotate: the workspace never falls back to Reading the file after ready", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/rotate-video");
    await startSampling(page, "Rotate");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const rotate = page.getByRole("button", { name: "Rotate", exact: true });
    await expect(rotate).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Rotate right" }).click();
    await rotate.click();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
      timeout: 90_000,
    });
    expect(await readingAfterReady(page)).toBe(0);
  });

  test("speed and GIF: no fallback while processing or when done", async ({ page }) => {
    test.setTimeout(180_000);
    for (const [slug, verb] of [
      ["change-video-speed", "Change speed"],
      ["video-to-gif", "Make GIF"],
    ] as const) {
      await page.goto(`/${slug}`);
      await startSampling(page, verb);
      await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
      const button = page.getByRole("button", { name: verb, exact: true });
      await expect(button).toBeEnabled({ timeout: 30_000 });
      await button.click();
      await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
        timeout: 120_000,
      });
      expect(await readingAfterReady(page), slug).toBe(0);
    }
  });

  // Layout stability when a file comes in, per page and width, on a CPU throttled ×4. The files
  // arrive as a script-dispatched drop, which carries no input: a real drop is not input to Chrome's
  // layout-shift scoring, and a real picker closes seconds after the tap that opened it, past the
  // 500 ms `hadRecentInput` window. So every shift counts, as it does in the field. Figures:
  // - `all`: every shift (what a real picker or drop scores).
  // - `late`: shifts more than 500 ms after the drop.
  // - `after first step`: every shift but the first.
  // Several files are read one after another: merge's clip list and a batch queue hold a row for
  // each from the drop, so the rows that arrive later move nothing.
  const cases = [
    { name: "trim-video", slug: "trim-video", verb: "Trim", files: ["sample.mp4"] },
    { name: "compress-video", slug: "compress-video", verb: "Compress", files: ["sample.mp4"] },
    {
      name: "compress-video batch",
      slug: "compress-video",
      verb: "Compress",
      files: ["sample.mp4", "sample-b.mp4"],
    },
    {
      name: "merge-videos",
      slug: "merge-videos",
      verb: "Merge",
      files: ["sample.mp4", "sample-b.mp4"],
    },
  ];
  for (const width of [390, 1280])
    for (const c of cases)
      test(`${c.name} at ${width}, CPU ×4: a picked or dropped file shifts nothing`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== "chromium", "one throttled run per width is enough");
        test.setTimeout(180_000);
        await page.setViewportSize({ width, height: 844 });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await page.goto(`/${c.slug}`);
        // After the page is up: a phone network, so the spec and stage chunks (requested on the
        // first file) arrive well after the input window, as they would in the field.
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 600,
          downloadThroughput: 200_000,
          uploadThroughput: 90_000,
        });
        await page.evaluate(() => {
          const w = window as unknown as {
            __shifts: { t: number; v: number; input: boolean }[];
            __change: number;
            __heights: number[];
          };
          w.__shifts = [];
          w.__change = 0;
          w.__heights = [];
          document.addEventListener("drop", () => (w.__change ||= performance.now()), true);
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[])
              w.__shifts.push({ t: e.startTime, v: e.value, input: e.hadRecentInput });
          }).observe({ type: "layout-shift", buffered: true });
          setInterval(() => {
            const r = document
              .querySelector('section[aria-label="Workspace"]')
              ?.getBoundingClientRect();
            w.__heights.push(Math.round(r?.height ?? 0));
          }, 16);
        });
        await dropWithoutInput(page, c.files);
        // Enabled, not just visible: a list shows its verb while files are still being read.
        await expect(page.getByRole("button", { name: c.verb, exact: true })).toBeEnabled({
          timeout: 150_000,
        });
        await page.waitForTimeout(1000);
        const m = await page.evaluate(() => {
          const w = window as unknown as {
            __shifts: { t: number; v: number; input: boolean }[];
            __change: number;
            __heights: number[];
          };
          const sum = (xs: { v: number }[]) => xs.reduce((a, x) => a + x.v, 0);
          return {
            input: w.__shifts.some((x) => x.input),
            late: sum(w.__shifts.filter((x) => x.t > w.__change + 500)),
            all: sum(w.__shifts),
            afterFirst: sum(w.__shifts.slice(1)),
            heights: w.__heights,
          };
        });
        const steps = m.heights.filter((h, i) => i === 0 || h !== m.heights[i - 1]);
        test.info().annotations.push({
          type: "CLS",
          description: `${c.name} ${width}: all ${m.all.toFixed(3)}, late ${m.late.toFixed(3)}, after first step ${m.afterFirst.toFixed(3)}; heights ${steps.join(" → ")}`,
        });
        // The workspace never drops below the drop zone (the 71 px collapse scored 0.36 at 390).
        expect(Math.min(...steps)).toBeGreaterThanOrEqual(steps[0] ?? 0);
        // The scripted drop must not have been scored as input, or `all` would excuse the shift.
        expect(m.input).toBe(false);
        // Phones hold the stage's height from the drop zone on, so nothing visible may move there.
        expect(m.all).toBeLessThan(width < 768 ? 0.01 : 0.1);
        expect(m.late).toBeLessThan(0.1);
        expect(m.afterFirst).toBeLessThan(0.1);
      });
});
