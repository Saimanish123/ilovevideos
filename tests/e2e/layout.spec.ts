import { expect, type Page, test } from "@playwright/test";
import {
  frameDiff,
  grayFrame,
  noAxeViolations,
  probe,
  psnr,
  rms,
  saveLink,
  shot,
  trackUploads,
} from "./time-layout-helpers";

/**
 * Picture in picture and side by side, end to end. Fixtures: sample.mp4 (640×360, 30 fps, 3 s, 440 Hz),
 * sample-b.mp4 (the same pattern inverted, 2 s, 660 Hz), sample-square.mp4 (480×480, 25 fps, 2 s,
 * 48 kHz mono). The output is read back with ffmpeg: where each picture is, how long it lasts and
 * which sound it carries. Encoding needs Chromium; the pages render everywhere.
 */
const pick = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true }).locator("xpath=..").click();

async function open(page: Page, slug: string, files: string[]) {
  await page.goto(`/${slug}`);
  await shot(page, `${slug}-idle`);
  await page.locator('input[type="file"]').first().setInputFiles(files);
  const run = page.getByRole("button", { name: "Combine", exact: true });
  await expect(run).toBeEnabled({ timeout: 30_000 });
  return run;
}

test.describe("picture in picture", () => {
  test("renders, places the inset by corner, drag and keys, axe clean", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, "picture-in-picture-video", [
      "tests/fixtures/sample.mp4",
      "tests/fixtures/sample-b.mp4",
    ]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Make a picture in picture video",
    );
    // The file rows name each video's place, and Swap exchanges them.
    const rowB = page.getByRole("listitem").filter({ hasText: "sample-b.mp4" });
    await expect(rowB).toContainText("Inset");
    await page.getByRole("button", { name: "Swap main picture and inset" }).click();
    await expect(rowB).toContainText("Main picture");
    await page.getByRole("button", { name: "Swap main picture and inset" }).click();
    await expect(rowB).toContainText("Inset");
    const inset = page.getByRole("group", { name: /^Inset at/ });
    await expect(inset).toBeVisible();
    // Bottom right by default: 0.33 × 640 = 211 wide, 4% of 360 = 14 from the edges.
    await expect(inset).toHaveAttribute("aria-label", /Inset at 414, 227, 211×119/);
    await pick(page, "Top left");
    await expect(inset).toHaveAttribute("aria-label", /Inset at 14, 14, 211×119/);
    await shot(page, "pip-ready");
    await noAxeViolations(page);
    await inset.focus();
    await page.keyboard.press("ArrowRight");
    await expect(inset).toHaveAttribute("aria-label", /Inset at 18, 14/);
    await page.keyboard.press("Shift+ArrowDown");
    await expect(inset).toHaveAttribute("aria-label", /Inset at 18, 32/);
    const box = await inset.boundingBox();
    if (!box) throw new Error("no inset box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 3000, box.y + box.height / 2 + 3000, {
      steps: 4,
    });
    await page.mouse.up();
    await expect(inset).toHaveAttribute("aria-label", /Inset at 429, 241/);
  });

  test("writes the inset in its corner with the main sound", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    const run = await open(page, "picture-in-picture-video", [
      "tests/fixtures/sample.mp4",
      "tests/fixtures/sample-b.mp4",
    ]);
    await pick(page, "Top left");
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await shot(page, "pip-processing");
    await expect(page.getByText("Picture in picture made", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await shot(page, "pip-done");
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-pip.mp4");
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.streams[0]).toMatchObject({ width: 640, height: 360 });
    expect(p.duration).toBeCloseTo(3, 1);
    // Away from the inset the main picture is untouched (bottom right quarter).
    const away = "crop=320:180:320:180";
    expect(
      frameDiff(
        grayFrame(path, 1, 64, 36, away),
        grayFrame("tests/fixtures/sample.mp4", 1, 64, 36, away),
      ),
    ).toBeLessThan(3);
    // The inset (211×119 at 14, 14) is sample-b scaled down: compare its middle.
    const inner = "crop=180:100:30:24";
    const ref = grayFrame(
      "tests/fixtures/sample-b.mp4",
      1,
      64,
      36,
      "scale=211:119,crop=180:100:16:10",
    );
    expect(frameDiff(grayFrame(path, 1, 64, 36, inner), ref)).toBeLessThan(6);
    // After sample-b ends (2 s) its last frame is held.
    expect(
      frameDiff(grayFrame(path, 2.3, 64, 36, inner), grayFrame(path, 2.9, 64, 36, inner)),
    ).toBeLessThan(1.5);
    const main = psnr(path, 0, "tests/fixtures/sample.mp4", 0, 3, { a: away, b: away });
    test.info().annotations.push({ type: "psnr", description: `main picture ${main} dB` });
    expect(main).toBeGreaterThan(35);
    expect(rms(path, 0.2, 2.8)).toBeGreaterThan(0.05);
    expect(uploads).toEqual([]);
  });
});

test.describe("side by side", () => {
  test("side by side and stacked, lined up, both sounds mixed", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(300_000);
    const run = await open(page, "side-by-side-video", [
      "tests/fixtures/sample.mp4",
      "tests/fixtures/sample-square.mp4",
    ]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Put two videos side by side");
    await expect(page.getByText(/^1000×360 · 0:03 ·/)).toBeVisible();
    // Committed on Enter; negative starts are allowed.
    const start = page.getByLabel("Right video starts, seconds");
    await start.fill("-0.25");
    await start.press("Enter");
    await expect(start).toHaveValue("-0.25");
    await start.fill("0.5");
    await start.press("Enter");
    await expect(page.getByRole("listitem").filter({ hasText: "sample-square.mp4" })).toContainText(
      "Right",
    );
    await pick(page, "Both");
    await shot(page, "side-ready");
    await noAxeViolations(page);
    await run.click();
    await expect(page.getByText("Side by side made", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await shot(page, "side-done");
    const { path } = await saveLink(page);
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.streams[0]).toMatchObject({ width: 1000, height: 360 });
    expect(p.duration).toBeCloseTo(3, 1);
    // Left: sample.mp4 at its own size, re-encoded once.
    const left = psnr(path, 0, "tests/fixtures/sample.mp4", 0, 3, { a: "crop=640:360:0:0" });
    test.info().annotations.push({ type: "psnr", description: `left picture ${left} dB` });
    expect(left).toBeGreaterThan(35);
    // Right: sample-square scaled to 360×360, starting 0.5 s late (held on its first frame before).
    const right = "crop=360:360:640:0";
    expect(
      frameDiff(
        grayFrame(path, 1.5, 36, 36, right),
        grayFrame("tests/fixtures/sample-square.mp4", 1.0, 36, 36),
      ),
    ).toBeLessThan(6);
    // Both sounds: louder than either alone where they overlap.
    expect(rms(path, 0.7, 2.3)).toBeGreaterThan(rms("tests/fixtures/sample.mp4", 0.7, 2.3) * 1.1);

    // Again, stacked in a 9:16 frame with bars, after Start over keeps nothing.
    await page.getByRole("button", { name: "Start over" }).click();
    const again = await open(page, "side-by-side-video", [
      "tests/fixtures/sample.mp4",
      "tests/fixtures/sample-square.mp4",
    ]);
    await pick(page, "Top and bottom");
    await pick(page, "9:16");
    await expect(page.getByText(/^480×854 · 0:03 ·/)).toBeVisible();
    await again.click();
    await expect(page.getByText("Stacked", { exact: true })).toBeVisible({ timeout: 240_000 });
    const s = probe((await saveLink(page)).path);
    expect(s.streams[0]).toMatchObject({ width: 480, height: 854 });
  });

  test("cancel frees the run", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    const run = await open(page, "side-by-side-video", [
      "tests/fixtures/sample.mp4",
      "tests/fixtures/sample-b.mp4",
    ]);
    await run.click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(run).toBeEnabled({ timeout: 5_000 });
  });
});
