import { expect, type Page, test } from "@playwright/test";

/**
 * Rotate/flip, change speed and remove metadata, end to end in Chromium (desktop and the mobile
 * Chrome profile). Each run must yield a live blob over 1 KB, a result line with real output facts,
 * and no request body over 1 KB leaving the page. WebKit is skipped: no WebCodecs encoder, no
 * cross-origin isolation for the ffmpeg threads.
 */

/** Segmented radios are visually hidden inside their label, which takes the click, as it does for a user. */
const segment = (page: Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name, exact: true }) }).click();

test.describe("edit tools", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  const trackUploads = (page: Page) => {
    const uploads: number[] = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (body && body.length > 1024) uploads.push(body.length);
    });
    return uploads;
  };

  const runAndCheck = async (page: Page, verb: string, minBytes = 1000) => {
    await page.getByRole("button", { name: verb, exact: true }).click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 120_000 });
    await expect(download).toHaveAttribute("href", /^blob:/);
    const href = await download.getAttribute("href");
    const size = await page.evaluate(async (u) => (await (await fetch(u ?? "")).blob()).size, href);
    expect(size).toBeGreaterThan(minBytes);
    return size;
  };

  test("rotate 90° copies the stream and reports swapped dimensions", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/rotate-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const rotate = page.getByRole("button", { name: "Rotate", exact: true });
    await expect(rotate).toBeVisible({ timeout: 30_000 });
    // Nothing selected yet: the primary is disabled with a reason.
    await expect(rotate).toBeDisabled();
    await expect(page.getByText("Choose a rotation or a flip first.")).toBeVisible();
    await page.getByRole("button", { name: "Rotate right" }).click();
    await expect(page.getByText(/90° clockwise/)).toBeVisible();
    await expect(page.getByTestId("rotate-dimensions")).toHaveText("640×360 → 360×640");
    await expect(page.getByText(/video is copied as it is/)).toBeVisible();
    // The preview turns live.
    // rotate(90deg) scale(k) → matrix(0, k, -k, 0, 0, 0) with k = 360/640. toHaveCSS retries, so the
    // assertion waits out the preview's rotate transition instead of sampling it mid-flight.
    await expect(page.locator("video")).toHaveCSS(
      "transform",
      /^matrix\(0, 0\.5625, -0\.5625, 0, 0, 0\)$/,
    );
    await runAndCheck(page, "Rotate");
    await expect(page.getByText(/360×640 · video copied/)).toBeVisible();
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("Change settings returns to the same file with the options just used", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/rotate-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await page.getByRole("button", { name: "Rotate right" }).click();
    await runAndCheck(page, "Rotate");
    // Results stack in one column: Download, then the two quiet ways back, all full width.
    const download = await page.getByRole("link", { name: "Download" }).boundingBox();
    const change = await page.getByRole("button", { name: "Change settings" }).boundingBox();
    expect(change?.y).toBeGreaterThan((download?.y ?? 0) + (download?.height ?? 0) - 1);
    expect(change?.width).toBeCloseTo(download?.width ?? 0, 0);
    await page.getByRole("button", { name: "Change settings" }).focus();
    await page.keyboard.press("Enter");
    // Focus lands on the panel's first control, not on <body>.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest("fieldset") !== null))
      .toBe(true);
    // Ready again, no new drop: the same file and the rotation still chosen.
    const rotate = page.getByRole("button", { name: "Rotate", exact: true });
    await expect(rotate).toBeEnabled();
    await expect(page.getByTestId("rotate-dimensions")).toHaveText("640×360 → 360×640");
    // A second run from there works like the first.
    await runAndCheck(page, "Rotate");
    await expect(page.getByText(/360×640 · video copied/)).toBeVisible();
  });

  test("on a phone the status line rides in the sticky action bar", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the bar is static from lg up");
    await page.goto("/rotate-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByText("Choose a rotation or a flip first.")).toBeVisible({
      timeout: 30_000,
    });
    // One column: the job's controls come straight under the picture, the file card after them.
    const control = await page.getByRole("button", { name: "Rotate right" }).boundingBox();
    const card = await page.getByText("sample.mp4", { exact: true }).boundingBox();
    expect(card?.y ?? 0).toBeGreaterThan(control?.y ?? Number.POSITIVE_INFINITY);
    const bar = page.locator("[data-action-bar]");
    await expect(bar.getByRole("status")).toHaveText("Choose a rotation or a flip first.");
    await expect(bar.getByRole("button", { name: "Rotate", exact: true })).toBeVisible();
    // Focus moves stop above the bar: scroll-padding-bottom is the bar's measured height plus air.
    const [pad, height] = await page.evaluate(() => [
      Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
      (document.querySelector("[data-action-bar]") as HTMLElement).offsetHeight,
    ]);
    expect(pad).toBe(height + 8);
  });

  test("flip horizontal re-encodes on the flip page", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/flip-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const flip = page.getByRole("button", { name: "Flip", exact: true });
    await expect(flip).toBeVisible({ timeout: 30_000 });
    // Preset: horizontal flip is on.
    await expect(page.getByRole("button", { name: "Flip horizontal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText(/A flip rewrites every pixel/)).toBeVisible();
    await expect(page.locator("video")).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
    await runAndCheck(page, "Flip", 10_000);
    await expect(page.getByText(/640×360 · re-encoded/)).toBeVisible();
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("change speed 2× halves the length through ffmpeg.wasm", async ({ page }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await page.goto("/change-video-speed");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Change speed", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    // Default 2×: the estimate and the live preview rate.
    await expect(page.getByTestId("speed-length")).toHaveText("3.0 s → 1.5 s");
    await expect(page.getByText(/^Audio pitch is kept\./)).toBeVisible();
    await expect
      .poll(() => page.locator("video").evaluate((el) => (el as HTMLVideoElement).playbackRate))
      .toBe(2);
    // Presets drive both the estimate and the preview.
    await segment(page, "0.5×");
    await expect(page.getByTestId("speed-length")).toHaveText("3.0 s → 6.0 s");
    await expect
      .poll(() => page.locator("video").evaluate((el) => (el as HTMLVideoElement).playbackRate))
      .toBe(0.5);
    await segment(page, "2×");
    await runAndCheck(page, "Change speed", 10_000);
    await expect(page.getByText(/3\.0\ss → 1\.5\ss · pitch kept/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      /-2x\.mp4$/,
    );
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("remove metadata lists the tags and writes a clean copy", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/remove-metadata-from-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample-tagged.mp4");
    const button = page.getByRole("button", { name: "Remove metadata", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const list = page
      .getByRole("region", { name: "Workspace" })
      .getByRole("list")
      .filter({ hasText: "Title" });
    await expect(list).toContainText("Holiday clip");
    await expect(list).toContainText("Comment");
    await expect(list).toContainText("Location (GPS)");
    await expect(list).toContainText("Creation date");
    await expect(page.getByText(/^Removes \d+ tags, including location\./)).toBeVisible();
    await runAndCheck(page, "Remove metadata");
    await expect(page.getByText(/tags removed · streams copied/)).toBeVisible();
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("a clean file is still processed and says so", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/remove-metadata-from-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.webm");
    const button = page.getByRole("button", { name: "Remove metadata", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await expect(button).toBeEnabled();
  });

  test("Escape cancels a speed run and returns to ready", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/change-video-speed");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Change speed", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
  });

  test("a file that is not media gets a specific unsupported-input message", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/rotate-video");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is not a video ".repeat(200)),
    });
    const alert = page.getByRole("region", { name: "Workspace" }).getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/is a text file, not a video or audio file/);
    await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
    // The card agrees with the error, and there is no empty player for a file that cannot be read.
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace).toContainText("Could not read");
    await expect(workspace).not.toContainText("Reading the file");
    await expect(workspace.locator("video")).toHaveCount(0);
    if (isMobile) {
      const box = await page.getByRole("button", { name: "Start over" }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
