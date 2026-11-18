import { expect, test } from "@playwright/test";

/**
 * Video → GIF end to end: drop the fixture, narrow the range, change frame rate and width, make the
 * GIF, check the live blob, the inline preview and that nothing left the page. Runs on desktop
 * Chromium and the mobile Chrome profile; WebKit is skipped (no WebCodecs decoder in Playwright's build).
 */
test.describe("video-to-gif", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs is Chromium-only here");

  test("makes a GIF on-device with the chosen range, fps and width", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads: number[] = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (body && body.length > 1024) uploads.push(body.length);
    });

    await page.goto("/video-to-gif");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make a GIF from video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Make GIF", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });

    // The range is chosen on the timeline (handles are sliders); the inputs are companions.
    await expect(page.getByRole("slider", { name: "Start" })).toBeVisible();
    await page.locator("#end").fill("2");
    await page.locator("#end").press("Enter");
    await expect(page.locator("#end")).toHaveValue("2");

    await page.getByRole("radio", { name: "10", exact: true }).check({ force: true });
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /360\spx wide/ }).click();
    // Live estimate: 2 s at 10 fps = 20 frames at 360×202.
    await expect(page.getByTestId("gif-estimate")).toContainText(
      /20\sframes, 2\.0\ss at 10\sfps, 360×20[24]/,
    );
    // The result line carries the real encode facts next to before → after.

    await button.click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 90_000 });
    await expect(download).toHaveAttribute("download", "sample.gif");
    await expect(page.getByText(/→ .* · 360×20[24] · 20\sframes/)).toBeVisible();
    const href = await download.getAttribute("href");
    expect(href).toMatch(/^blob:/);
    const probe = await page.evaluate(async (u) => {
      const b = await (await fetch(u ?? "")).blob();
      const head = new Uint8Array(await b.slice(0, 6).arrayBuffer());
      return { size: b.size, type: b.type, magic: String.fromCharCode(...head) };
    }, href);
    expect(probe.size).toBeGreaterThan(1000);
    expect(probe.type).toBe("image/gif");
    expect(probe.magic).toBe("GIF89a");

    const preview = page.getByTestId("result-preview");
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBe(360);
    await expect(page.getByText("The same operation with ffmpeg")).toBeVisible();
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("Best quality runs the ffmpeg palette passes on the page", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads: number[] = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (body && body.length > 1024) uploads.push(body.length);
    });
    await page.goto("/video-to-gif");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Make GIF", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await page.getByRole("radio", { name: "Best", exact: true }).check({ force: true });
    await expect(page.getByText(/with the ffmpeg engine/)).toBeVisible();
    await button.click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 150_000 });
    const href = await download.getAttribute("href");
    const probe = await page.evaluate(async (u) => {
      const b = await (await fetch(u ?? "")).blob();
      return { size: b.size, type: b.type };
    }, href);
    expect(probe.type).toBe("image/gif");
    expect(probe.size).toBeGreaterThan(100_000);
    await expect(page.getByTestId("result-preview")).toBeVisible();
    await page.getByText("The same operation with ffmpeg").click();
    await expect(page.locator("pre")).toContainText("palettegen");
    await expect(page.locator("pre")).toContainText("paletteuse=dither=sierra2_4a");
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("Escape cancels a run and returns to ready", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/video-to-gif");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Make GIF", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    // Make the run long enough to interrupt: full clip, 30 fps, original width.
    await page.getByRole("radio", { name: "30", exact: true }).check({ force: true });
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /^Keep/ }).click();
    await button.click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
  });

  test("a non-video file gets the unsupported-input message", async ({ page }) => {
    await page.goto("/video-to-gif");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "this is not a video file, just some text to trip the reader\n".repeat(20),
      ),
    });
    const alert = page.getByRole("region", { name: "Workspace" }).getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText("is a text file, not a video or audio file");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByText("Drop a video to make a GIF from it")).toBeVisible();
  });
});
