import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Crop and change aspect ratio, end to end: drop a fixture (640×360, 3 s, H.264 + AAC), shape it
 * with the frame, the fields or the presets, and check the downloaded file with ffprobe (codec,
 * dimensions, even edges, duration). Chromium only: Playwright's WebKit has no WebCodecs encoder.
 * Set GEOMETRY_SHOTS=<dir> to also save 390 and 1280 screenshots of each state.
 */
const shots = process.env.GEOMETRY_SHOTS;

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

/** Choose a preset card: the radio is visually hidden, so click its card (the label), as a person would. */
const pick = (page: Page, name: RegExp | string) =>
  page.getByRole("radio", { name }).locator("xpath=..").click();

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

interface Probe {
  codec: string;
  width: number;
  height: number;
  duration: number;
  audio?: string;
}

/** Saves the Download link's blob and reads it back with ffprobe. */
async function probeDownload(page: Page): Promise<Probe> {
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 180_000 });
  const href = await download.getAttribute("href");
  const name = (await download.getAttribute("download")) ?? "out.mp4";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const dir = mkdtempSync(join(tmpdir(), "geometry-"));
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  const out = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height:format=duration",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
    format: { duration: string };
  };
  const v = out.streams.find((s) => s.codec_type === "video");
  const a = out.streams.find((s) => s.codec_type === "audio");
  return {
    codec: v?.codec_name ?? "",
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    duration: Number(out.format.duration),
    audio: a?.codec_name,
  };
}

test.describe("geometry tools", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("idle names the job and shows the frame", async ({ page }) => {
    await page.goto("/crop-video");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("Drop a video to crop it");
    await expect(zone).toContainText("Drag a frame over the picture");
    await shot(page, "crop-idle");
    await page.goto("/change-video-aspect-ratio");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop a video to reshape it",
    );
    await pick(page, /1:1/);
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop a video to make it 1:1",
    );
    await shot(page, "aspect-idle");
  });

  test("crop: shape, typed size, drag and keys, then an even H.264 file", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/crop-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const crop = page.getByRole("button", { name: "Crop", exact: true });
    await expect(crop).toBeVisible({ timeout: 30_000 });
    // Whole frame: nothing to do yet, and the reason says what to do.
    await expect(crop).toBeDisabled();
    await expect(page.getByText(/Drag the frame's edges or corners/)).toBeVisible();
    // The source is 16:9, so the 16:9 preset would do nothing and is not offered.
    await expect(page.getByRole("radio", { name: /^16:9/ })).toHaveCount(0);
    const frame = page.getByRole("group", { name: /Crop frame/ });
    await expect(frame).toBeVisible();
    await shot(page, "crop-ready");

    await pick(page, /^1:1/);
    await expect(page.getByText(/Output 360×360/)).toBeVisible();
    await expect(frame).toHaveAttribute("aria-label", /360×360 at 140, 0/);

    // An odd width snaps to even and says why; the lock carries the height.
    await page.getByLabel("Width").fill("301");
    await page.getByLabel("Width").press("Enter");
    await expect(
      page.getByText("Width snapped to 302 px: H.264 needs even numbers."),
    ).toBeVisible();
    await expect(page.getByLabel("Height")).toHaveValue("302");

    // Drag the frame body left, then nudge it with the keyboard.
    await frame.scrollIntoViewIfNeeded();
    const box = await frame.boundingBox();
    if (!box) throw new Error("no frame box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 400, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(frame).toHaveAttribute("aria-label", /302×302 at 0, /);
    await frame.focus();
    await page.keyboard.press("ArrowRight");
    await expect(frame).toHaveAttribute("aria-label", /302×302 at 4, /);
    await shot(page, "crop-framed");

    await expect(crop).toBeEnabled();
    await crop.click();
    const p = await probeDownload(page);
    expect(p).toMatchObject({ codec: "h264", width: 302, height: 302, audio: "aac" });
    expect(p.duration).toBeGreaterThan(2.8);
    expect(p.duration).toBeLessThan(3.2);
    await expect(page.getByText("Cropped to 302×302")).toBeVisible();
    await expect(page.getByText(/640×360 → 302×302/).first()).toBeVisible();
    await shot(page, "crop-done");
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("crop: a corner handle resizes with a 44px target", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/crop-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const frame = page.getByRole("group", { name: /Crop frame/ });
    await expect(frame).toBeVisible({ timeout: 30_000 });
    const handle = page.locator('[data-handle="se"]');
    await handle.scrollIntoViewIfNeeded();
    const hb = await handle.boundingBox();
    if (!hb) throw new Error("no handle");
    expect(hb.width).toBeGreaterThanOrEqual(44);
    expect(hb.height).toBeGreaterThanOrEqual(44);
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - 120, hb.y + hb.height / 2 - 60, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Crop", exact: true })).toBeEnabled();
    const label = (await frame.getAttribute("aria-label")) ?? "";
    const m = /(\d+)×(\d+) at (\d+), (\d+)/.exec(label);
    expect(m).not.toBeNull();
    const [w, h, x, y] = (m ?? []).slice(1).map(Number);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(w).toBeLessThan(640);
    expect(h).toBeLessThan(360);
    expect(((w ?? 1) % 2) + ((h ?? 1) % 2)).toBe(0);
  });

  test("aspect ratio: 16:9 to 9:16 with bars keeps the whole picture", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/change-video-aspect-ratio");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const go = page.getByRole("button", { name: "Change aspect ratio", exact: true });
    await expect(go).toBeVisible({ timeout: 30_000 });
    // A landscape source defaults to 9:16 with black bars, and its own shape is not offered.
    await expect(page.getByRole("radio", { name: /^9:16/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^16:9/ })).toHaveCount(0);
    await expect(page.getByText(/Output 360×640/)).toBeVisible();
    await expect(page.getByText(/black bars above and below/)).toBeVisible();
    // The preview is scaled by (9/16)² = 0.316; whole-pixel layout moves it in the third decimal.
    const scale = await page
      .locator("video")
      .evaluate((v) => new DOMMatrix(getComputedStyle(v).transform).a);
    expect(scale).toBeCloseTo(0.3164, 2);
    await shot(page, "aspect-ready");
    await go.click();
    const p = await probeDownload(page);
    expect(p).toMatchObject({ codec: "h264", width: 360, height: 640, audio: "aac" });
    expect(p.duration).toBeGreaterThan(2.8);
    await expect(page.getByText("Now 9:16: 360×640")).toBeVisible();
    await shot(page, "aspect-done");
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("aspect ratio: crop to fill 1:1 with the window moved", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/change-video-aspect-ratio");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const go = page.getByRole("button", { name: "Change aspect ratio", exact: true });
    await expect(go).toBeVisible({ timeout: 30_000 });
    await pick(page, /^1:1/);
    await pick(page, "Crop to fill");
    await expect(page.getByRole("radio", { name: "Black" })).toHaveCount(0);
    const win = page.getByRole("group", { name: /Kept window/ });
    await expect(win).toHaveAttribute("aria-label", /360×360 at 140, 0/);
    await win.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(win).toHaveAttribute("aria-label", /360×360 at 100, 0/);
    await expect(page.getByText(/44% of it is cut off/)).toBeVisible();
    await shot(page, "aspect-fill");
    await go.click();
    const p = await probeDownload(page);
    expect(p).toMatchObject({ codec: "h264", width: 360, height: 360 });
  });

  test("crop an AVI through the ffmpeg fallback", async ({ page }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await page.goto("/crop-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.avi");
    const crop = page.getByRole("button", { name: "Crop", exact: true });
    await expect(crop).toBeVisible({ timeout: 120_000 });
    await pick(page, /^9:16/);
    await expect(page.getByText(/Saved as MP4/)).toBeVisible();
    await crop.click();
    const p = await probeDownload(page);
    // 9:16 inside 640×360: 202×360 (even floor of 202.5).
    expect(p).toMatchObject({ codec: "h264", width: 202, height: 360, audio: "aac" });
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("ready state has no axe violations", async ({ page }) => {
    for (const slug of ["crop-video", "change-video-aspect-ratio"]) {
      await page.goto(`/${slug}`);
      await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
      await expect(page.getByRole("region", { name: "Workspace" }).locator("video")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("radio").first()).toBeVisible();
      const results = await new AxeBuilder({ page }).include("main").analyze();
      expect(results.violations, slug).toEqual([]);
    }
  });
});
