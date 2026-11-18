import { expect, test } from "@playwright/test";

/**
 * Extract a frame (video → image) and video info (inspector), end to end on the fixture.
 * Runs on desktop Chromium and the mobile Chrome profile; WebKit is skipped (no WebCodecs decoder
 * in Playwright's build). The fixture is 640×360 H.264 + mono AAC in MP4, 3 s at 30 fps.
 */
const noUploads = (page: import("@playwright/test").Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

test.describe("extract-frame-from-video", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs is Chromium-only here");

  test("saves the frame at 1.5 s as a full-size PNG", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = noUploads(page);
    await page.goto("/extract-frame-from-video");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Extract a frame from video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Extract frame", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });

    // The playhead on the filmstrip is the primary control; the input is its companion.
    const slider = page.getByRole("slider", { name: "Frame time" });
    await expect(slider).toBeVisible();
    await page.locator("#time").fill("1.5");
    await page.locator("#time").press("Enter");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.5");
    await expect(page.getByText("Frame at 0:01.50", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/^640×360 PNG of the frame at 0:01\.50\. PNG is lossless/),
    ).toBeVisible();

    await button.click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 60_000 });
    await expect(download).toHaveAttribute("download", "sample-0m01s50.png");
    // A still is not a smaller video: its own facts and size, no before → after (design review 4).
    await expect(page.getByText(/^640×360 · PNG · frame at 0:01\.50 · [\d.]+\skB$/)).toBeVisible();
    const href = await download.getAttribute("href");
    expect(href).toMatch(/^blob:/);
    const probe = await page.evaluate(async (u) => {
      const b = await (await fetch(u ?? "")).blob();
      const head = new Uint8Array(await b.slice(0, 8).arrayBuffer());
      return { size: b.size, type: b.type, magic: Array.from(head) };
    }, href);
    expect(probe.type).toBe("image/png");
    expect(probe.size).toBeGreaterThan(1000);
    expect(probe.magic).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const preview = page.getByTestId("result-preview");
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBe(640);
    await expect
      .poll(() => preview.evaluate((el) => (el as HTMLImageElement).naturalHeight))
      .toBe(360);
    await page.getByText("The same operation with ffmpeg").click();
    await expect(page.locator("pre")).toContainText("-ss 1.500 -i sample.mp4 -frames:v 1");
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("saves a JPG with the chosen quality", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/extract-frame-from-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Extract frame", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    // Quality only appears for lossy formats.
    await expect(page.getByRole("radio", { name: "High 92" })).toHaveCount(0);
    await page.getByRole("radio", { name: "JPG", exact: true }).check({ force: true });
    await page.getByRole("radio", { name: "Medium 80" }).check({ force: true });
    await expect(page.getByText(/JPG at quality 80\./)).toBeVisible();
    await button.click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 60_000 });
    await expect(download).toHaveAttribute("download", "sample-0m00s00.jpg");
    const href = await download.getAttribute("href");
    const probe = await page.evaluate(async (u) => {
      const b = await (await fetch(u ?? "")).blob();
      const head = new Uint8Array(await b.slice(0, 3).arrayBuffer());
      return { size: b.size, type: b.type, magic: Array.from(head) };
    }, href);
    expect(probe.type).toBe("image/jpeg");
    expect(probe.magic).toEqual([0xff, 0xd8, 0xff]);
    expect(probe.size).toBeGreaterThan(1000);
    await expect(page.locator("pre")).toContainText("-q:v 8");
  });

  test("keyboard moves the playhead one frame, Shift one second, and seeks the preview", async ({
    page,
  }) => {
    await page.goto("/extract-frame-from-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const slider = page.getByRole("slider", { name: "Frame time" });
    await expect(slider).toBeVisible({ timeout: 30_000 });
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "0.033");
    await expect(slider).toHaveAttribute("aria-valuetext", "0:00.03");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.033");
    await expect(page.locator("#time")).toHaveValue("1.03");
    await expect
      .poll(() => page.locator("video").evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeCloseTo(1.033, 2);
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "2.967");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  test("a non-video file gets the unsupported-input message", async ({ page }) => {
    await page.goto("/extract-frame-from-video");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is not a video file, just text to trip the reader\n".repeat(20)),
    });
    const alert = page.getByRole("region", { name: "Workspace" }).getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText("is a text file, not a video or audio file");
    // A video page names its own formats, not the audio ones the site also reads.
    await expect(alert).not.toContainText("WAV");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByText("Drop a video to take a still from it")).toBeVisible();
  });
});

test.describe("video-info", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs is Chromium-only here");

  test("shows the file's facts with no primary action and copies them as text", async ({
    page,
    context,
  }) => {
    const uploads = noUploads(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/video-info");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check video info");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const panel = page.getByTestId("video-info");
    await expect(panel).toBeVisible({ timeout: 30_000 });

    const row = (label: string) =>
      panel
        .locator("dt", { hasText: new RegExp(`^${label}$`) })
        .locator("xpath=following-sibling::dd[1]");
    await expect(row("Container")).toHaveText("MP4");
    await expect(row("Codec").first()).toHaveText("H.264");
    await expect(row("Codec string").first()).toHaveText(/^avc1\./);
    await expect(row("Resolution")).toHaveText("640×360");
    await expect(row("Aspect ratio")).toHaveText("16:9");
    await expect(row("Frame rate")).toHaveText(/^30\sfps$/);
    await expect(row("Codec").nth(1)).toHaveText("AAC");
    await expect(row("Channels")).toHaveText("mono");
    await expect(row("Sample rate")).toHaveText(/^44\.1\skHz$/);
    await expect(row("Duration")).toHaveText(/^0:03 \(3\.00\ss\)$/);

    // Nothing to run: no primary button, no summary line, no Download.
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace.locator("button.bg-accent")).toHaveCount(0);
    await expect(workspace.getByRole("button", { name: "Inspect" })).toHaveCount(0);
    await expect(workspace.getByRole("link", { name: "Download" })).toHaveCount(0);
    await expect(page.getByText(/container is the box/)).toBeVisible();

    const copy = page.getByRole("button", { name: "Copy as text" });
    await copy.click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    if (clipboard) {
      expect(clipboard).toContain("Name: sample.mp4");
      expect(clipboard).toContain("Codec: H.264");
      expect(clipboard).toContain("Resolution: 640×360");
    }
    await expect(page.getByRole("button", { name: "Copy as text" })).toBeVisible({
      timeout: 5_000,
    });
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("a non-media file gets the unsupported-input message", async ({ page }) => {
    await page.goto("/video-info");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is not a video file, just text to trip the reader\n".repeat(20)),
    });
    const alert = page.getByRole("region", { name: "Workspace" }).getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText("is a text file, not a video or audio file");
  });
});
