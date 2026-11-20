import { expect, type Page, test } from "@playwright/test";

/**
 * The converter's WebAssembly file arriving cut short (ADR-0147): measured under load at 27.4 of
 * 32.7 MB, which used to fail with a compile error. A cut-off download is continued from where it
 * stopped and the file is made; a download that never completes says so with Try again, which works
 * once the connection does, both during a run and while a file is being read. The service worker is
 * blocked so the route sees every request (its own store checks lengths in sw.js).
 */
test.use({ serviceWorkers: "block" });

const CUT = 27_375_357;

/** Cuts every converter download short while `cutting()` is true; counts the requests. */
async function cutWasm(page: Page, cutting: () => boolean) {
  const seen: (string | undefined)[] = [];
  await page.route("**/ffmpeg-core.wasm", async (route) => {
    seen.push(route.request().headers().range);
    if (!cutting()) return route.continue();
    const response = await route.fetch();
    const body = await response.body();
    // A Range request is cut too, by the same share, so it never completes either.
    await route.fulfill({ response, body: body.subarray(0, Math.min(body.length - 1, CUT)) });
  });
  return seen;
}

async function run(page: Page, slug: string, fixture: string) {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').first().setInputFiles(`tests/fixtures/${fixture}`);
}

test("a cut-off converter download is continued and the file is made", async ({ page }) => {
  test.setTimeout(180_000);
  let first = true;
  const seen = await cutWasm(page, () => {
    const cut = first;
    first = false;
    return cut;
  });
  await run(page, "wav-to-mp3", "sample.wav");
  const start = page.locator('[data-action="run"]');
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(page.locator('[data-action="download"]').first()).toBeVisible({ timeout: 150_000 });
  // The second request asked only for the rest.
  expect(seen).toEqual([undefined, `bytes=${CUT}-`]);
});

test("a download that never completes says so, and Try again works", async ({ page }) => {
  test.setTimeout(240_000);
  let cutting = true;
  const seen = await cutWasm(page, () => cutting);
  await run(page, "wav-to-mp3", "sample.wav");
  const start = page.locator('[data-action="run"]');
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  const failure = page.getByRole("region", { name: "Workspace" }).getByRole("alert");
  await expect(failure).toContainText("The converter did not finish downloading.", {
    timeout: 150_000,
  });
  await expect(failure).toContainText("Check the connection and try again.");
  expect(seen.length).toBe(3);
  // Focus goes to the way out, not to the page.
  await expect(failure.getByRole("button", { name: "Try again" })).toBeFocused();
  cutting = false;
  await failure.getByRole("button", { name: "Try again" }).click();
  await page.locator('[data-action="run"]').click();
  await expect(page.locator('[data-action="download"]').first()).toBeVisible({ timeout: 150_000 });
});

test("reading a file that needs the converter offers Try again too", async ({ page }) => {
  test.setTimeout(240_000);
  let cutting = true;
  await cutWasm(page, () => cutting);
  await page.goto("/avi-to-mp4");
  // Nothing moves when the read fails late (CLS 0): layout shift where the browser reports it, and
  // the workspace's height every frame everywhere.
  await page.evaluate(() => {
    const w = window as unknown as { __shift: number; __h: number[] };
    w.__shift = 0;
    w.__h = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!e.hadRecentInput) w.__shift += e.value;
      }).observe({ type: "layout-shift" });
    } catch {
      // WebKit reports no layout shifts.
    }
    const tick = () => {
      const ws = document.querySelector('section[aria-label="Workspace"]');
      const col = ws?.querySelector(".grid > div");
      if (col) w.__h.push(Math.round(col.getBoundingClientRect().height));
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.avi");
  // The read waits for the converter, and says how far its download has come.
  await expect(
    page
      .getByRole("region", { name: "Workspace" })
      .getByText(/^Loading the converter/)
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  const failure = page.getByRole("region", { name: "Workspace" }).getByRole("alert");
  await expect(failure).toContainText("The converter did not finish downloading.", {
    timeout: 150_000,
  });
  await expect(failure.getByRole("button", { name: "Try again" })).toBeFocused();
  const { shift, heights } = await page.evaluate(() => {
    const w = window as unknown as { __shift: number; __h: number[] };
    // From the first frame the preview column was laid out at its reading height.
    const settled = w.__h.slice(w.__h.findIndex((h) => h > 200));
    return { shift: w.__shift, heights: [...new Set(settled)] };
  });
  expect(shift).toBe(0);
  expect(heights, `preview column heights: ${heights.join(", ")}`).toHaveLength(1);
  cutting = false;
  await failure.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator('[data-action="run"]')).toBeEnabled({ timeout: 120_000 });
});
