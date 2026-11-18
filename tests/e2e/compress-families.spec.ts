import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Generated compress families: compress for a platform and compress to under N MB. Zero interaction
 * must produce a file under the page's limit, on-device. `sample-large.mp4` (about 12 MB of grainy
 * 720p, from `pnpm fixtures`) sits over the 8 and 10 MB targets; `sample.mp4` (about 300 kB) is
 * already under every limit, so the page must say so instead of re-encoding.
 * WebKit is skipped: Playwright's WebKit build has no WebCodecs encoder.
 */
const MB = 1_000_000;

function trackUploads(page: Page): number[] {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
}

const cases = [
  { slug: "compress-video-for-discord", limitMb: 10, idle: "Discord limit" },
  { slug: "compress-video-under-8mb", limitMb: 8, idle: "already small enough" },
];

for (const c of cases) {
  test(`${c.slug} lands under ${c.limitMb} MB with zero interaction`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding is only available in Chromium here");
    test.setTimeout(180_000);
    const uploads = trackUploads(page);

    await page.goto(`/${c.slug}`);
    // Idle states the target before any file is chosen.
    const stage = page.getByRole("region", { name: "Workspace" });
    await expect(stage.getByText(c.idle)).toBeVisible();
    await expect(stage.getByText(`Drop a video to fit it under ${c.limitMb}`)).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample-large.mp4");
    // Ready: the fit check leads with the source size against the limit.
    await expect(page.getByText("Your file")).toBeVisible({ timeout: 30_000 });
    const button = page.getByRole("button", { name: "Compress", exact: true });
    await expect(button).toBeEnabled();
    await button.click();

    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText(`Fits under ${c.limitMb}`)).toBeVisible();
    const href = await download.getAttribute("href");
    const size = await page.evaluate(async (u) => (await (await fetch(u ?? "")).blob()).size, href);
    expect(size).toBeGreaterThan(c.limitMb * MB * 0.5);
    expect(size).toBeLessThanOrEqual(c.limitMb * MB);
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });
}

test("a file already under the limit is not re-encoded", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "WebCodecs inspection path is exercised in Chromium here");
  await page.goto("/compress-video-for-discord");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
  await expect(
    page.getByRole("paragraph").filter({ hasText: /Already fits Discord.s 10\sMB/ }),
  ).toBeVisible({ timeout: 30_000 });
  // Settled: the job is already done, so there is no primary to press (not a disabled one).
  await expect(page.getByRole("button", { name: "Compress", exact: true })).toHaveCount(0);
});

test("the idle tier choice sets the target", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "WebCodecs inspection path is exercised in Chromium here");
  await page.goto("/compress-video-for-discord");
  await page.getByText("Nitro Basic · 50 MB").click();
  await expect(page.getByText("Drop a video to fit it under 50")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample-large.mp4");
  // 12 MB is under Nitro Basic's 50 MB, so there is nothing to do.
  await expect(
    page.getByRole("paragraph").filter({ hasText: /Already fits Discord.s 50\sMB/ }),
  ).toBeVisible({ timeout: 30_000 });
  // The secondary route: shrink it anyway, which lowers the target and enables Compress.
  await page.getByRole("button", { name: "Make it smaller anyway" }).click();
  await expect(page.getByRole("button", { name: "Compress", exact: true })).toBeEnabled();
});

for (const slug of ["compress-video-for-email", "compress-video-under-25mb"]) {
  test(`${slug} has no axe violations idle or ready`, async ({ page, browserName }) => {
    test.skip(
      browserName !== "chromium",
      "WebCodecs inspection path is exercised in Chromium here",
    );
    await page.goto(`/${slug}`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample-large.mp4");
    await expect(page.getByText("Your file")).toBeVisible({ timeout: 30_000 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
