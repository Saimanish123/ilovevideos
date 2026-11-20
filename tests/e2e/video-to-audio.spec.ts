import { expect, type Page, test } from "@playwright/test";

/**
 * Video → audio, end to end: the native path (AAC copied into M4A, PCM written to WAV) and the
 * ffmpeg.wasm path (MP3 through libmp3lame on the mp4-to-mp3 page). Each run must yield a live blob
 * of the right MIME type, an inline audio preview, and no request body over 1 KB leaving the page.
 * Chromium engines only (desktop and the mobile Chrome profile): WebKit here lacks WebCodecs encoders
 * and cross-origin isolation for the ffmpeg threads.
 */
/** Format choices are radios visually hidden inside their label, which takes the click. */
const choose = (page: Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name, exact: true }) }).click();

test.describe("extract audio from video", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  const trackUploads = (page: Page) => {
    const uploads: number[] = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (body && body.length > 1024) uploads.push(body.length);
    });
    return uploads;
  };

  const extractAndCheck = async (
    page: Page,
    expected: { ext: RegExp; mime: string; minBytes: number; verb?: string },
  ) => {
    await page.getByRole("button", { name: expected.verb ?? "Extract audio", exact: true }).click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 120_000 });
    await expect(download).toHaveAttribute("href", /^blob:/);
    await expect(download).toHaveAttribute("download", expected.ext);
    const href = await download.getAttribute("href");
    const blob = await page.evaluate(async (u) => {
      const b = await (await fetch(u ?? "")).blob();
      return { size: b.size, type: b.type };
    }, href);
    expect(blob.size).toBeGreaterThan(expected.minBytes);
    expect(blob.type).toBe(expected.mime);
    // The result plays before download, in the waveform hero that showed the source.
    await expect(page.getByRole("button", { name: "Play the result" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Workspace" }).locator("audio").first(),
    ).toHaveAttribute("src", /^blob:/);
    return blob;
  };

  test("AAC → M4A is a lossless copy on the native engine", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/extract-audio-from-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByRole("button", { name: "Extract audio", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // The file card names the audio codec; the default (MP3) summary points at the lossless option.
    await expect(page.getByText(/AAC mono/)).toBeVisible();
    await expect(page.getByText(/Choose M4A to keep the original AAC untouched/)).toBeVisible();
    await choose(page, "M4A");
    await expect(
      page.getByText(/AAC is copied into M4A as it is, not re-encoded\. Lossless\./),
    ).toBeVisible();
    // Lossless copy: the bitrate control disappears.
    await expect(page.getByRole("radiogroup", { name: "Bitrate" })).toHaveCount(0);
    await extractAndCheck(page, { ext: /\.m4a$/, mime: "audio/mp4", minBytes: 20_000 });
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("→ WAV writes 16-bit PCM on the native engine", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/extract-audio-from-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByRole("button", { name: "Extract audio", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await choose(page, "WAV");
    await expect(page.getByText(/decoded once to WAV; nothing is lost from here on/)).toBeVisible();
    // The fixture is 3 s of mono 44.1 kHz: × 16 bit ≈ 265 KB of PCM
    await extractAndCheck(page, { ext: /\.wav$/, mime: "audio/wav", minBytes: 250_000 });
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("mp4-to-mp3 encodes with libmp3lame through ffmpeg.wasm", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/mp4-to-mp3");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    // The button matches the H1 "Convert MP4 to MP3".
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Output MP3 from AAC/)).toBeVisible();
    await expect(
      page.getByText(/AAC is re-encoded to MP3 at 192\skbps, after a one-time download of/),
    ).toBeVisible();
    // 3 s at 192 kbps ≈ 72 KB
    await extractAndCheck(page, {
      ext: /\.mp3$/,
      mime: "audio/mpeg",
      minBytes: 40_000,
      verb: "Convert",
    });
    await expect(page.getByText("The same operation with ffmpeg")).toHaveCount(0);
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("Escape cancels a run and returns to ready", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/mp4-to-mp3");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Convert", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
  });

  test("a file that is not media gets a specific unsupported-input message", async ({ page }) => {
    await page.goto("/extract-audio-from-video");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is not a video ".repeat(200)),
    });
    const alert = page.getByRole("region", { name: "Workspace" }).getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/is a text file, not a video or audio file/);
    await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
  });
});
