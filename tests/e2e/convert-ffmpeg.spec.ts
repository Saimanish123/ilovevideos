import { expect, test } from "@playwright/test";

/**
 * The ffmpeg.wasm path: containers the native engine cannot read or write. Loads the 32 MB core
 * from /wasm/ (served by Next), so the first run is slower. Chromium only (needs cross-origin isolation
 * and WebAssembly threads, which Playwright's WebKit build lacks in this configuration).
 */
test.describe("converter via ffmpeg.wasm", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "ffmpeg.wasm threads need Chromium here",
  );

  test("AVI in → MP4 out (inspect fallback + ffmpeg transcode)", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/video-converter");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.avi");
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/MPEG-4 Part 2|mpeg4/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 120_000 });
    await expect(download).toHaveAttribute("download", /\.mp4$/);
    const href = await download.getAttribute("href");
    const size = await page.evaluate(async (u) => (await (await fetch(u ?? "")).blob()).size, href);
    expect(size).toBeGreaterThan(10_000);
  });

  test("MP4 in → AVI out (Other format, then the select; ffmpeg mux)", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/video-converter");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // An MP4 is already MP4: the hub asks for another format before anything runs.
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeDisabled();
    await page
      .locator("label", { has: page.getByRole("radio", { name: "Other format", exact: true }) })
      .click();
    await page.locator("#to").click();
    await page.getByRole("option", { name: "AVI" }).click();
    await expect(page.getByText("Re-encode to AVI")).toBeVisible();
    await expect(page.getByText(/Needs a one-time download/)).toBeVisible();
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 120_000 });
    await expect(download).toHaveAttribute("download", /\.avi$/);
  });
});
