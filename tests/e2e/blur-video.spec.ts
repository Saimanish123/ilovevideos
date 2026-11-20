import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";
import {
  letterDetail,
  pictureToPage,
  pixels,
  probe,
  rms,
  saveDownload,
  seek,
  shootWidths,
  spread,
  trackUploads,
} from "./overlay-helpers";

/**
 * Blur part of a video, end to end. The plate fixtures are a number plate (220×64 at 210,148) on a
 * still grey 640×360 picture, in two versions that differ only in their letters; the moving one
 * slides the plate right at 100 px/s over the test pattern. A region drawn over the plate must
 * leave no trace of which letters were under it (the two results match to within the encoder's
 * own noise), key frames must carry the region with the plate, and a run must cancel. Encoding
 * needs WebCodecs: the processing tests run on Chromium; the page itself is checked everywhere.
 * OVERLAY_SHOTS=<dir> saves 390, 768 and 1280 screenshots of each state.
 */

const PLATE = { x: 210, y: 148, w: 220, h: 64 };
const region = (page: Page, n: number) =>
  page.getByRole("group", { name: new RegExp(`^Region ${n}:`) });

/** Picks a segmented option by its label (the radio itself is visually hidden). */
const pick = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true }).locator("xpath=..").click();

async function open(page: Page, file: string, startRegion = /160×160 at 240, 100/) {
  await page.goto("/blur-video");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blur part of a video");
  await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
    "Drop a video to blur part of it",
  );
  await page.locator('input[type="file"]').first().setInputFiles(file);
  const blur = page.getByRole("button", { name: "Blur", exact: true });
  await expect(blur).toBeEnabled({ timeout: 30_000 });
  // One region in the middle to start with: a quarter of the width, square.
  await expect(region(page, 1)).toHaveAttribute("aria-label", startRegion);
  return blur;
}

/** Draws a region over the plate and removes the starting one, so only the plate is covered. */
async function coverPlate(page: Page, x = PLATE.x) {
  const at = await pictureToPage(page, 640);
  const a = at(x, PLATE.y);
  const b = at(x + PLATE.w, PLATE.y + PLATE.h);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(region(page, 2)).toBeVisible();
  await page.getByRole("button", { name: "Region 1", exact: true }).click();
  await page.getByRole("button", { name: "Delete region 1" }).click();
  await expect(region(page, 2)).toHaveCount(0);
  await expect(region(page, 1)).toHaveAttribute("aria-label", /(219|220|221)×(63|64|65) at/);
}

test.describe("blur part of a video: the page", () => {
  test("renders, has no axe violations and works from the keyboard", async ({ page }) => {
    await open(page, "tests/fixtures/sample.mp4");
    await shootWidths(page, "blur-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // Keyboard: focus the region, move it, resize it, remove it, add one back from the panel.
    const r = region(page, 1);
    await r.focus();
    await page.keyboard.press("ArrowRight");
    await expect(r).toHaveAttribute("aria-label", /160×160 at 244, 100/);
    await page.keyboard.press("Shift+ArrowDown");
    await expect(r).toHaveAttribute("aria-label", /at 244, 140/);
    await page.keyboard.press("+");
    await expect(r).toHaveAttribute("aria-label", /176×176 at 236, 132/);
    await page.keyboard.press("Delete");
    await expect(r).toHaveCount(0);
    await expect(page.getByText("Draw a region on the picture first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Blur", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Add region" }).click();
    await expect(region(page, 1)).toBeVisible();
    // The effect and strength controls are plain radios.
    await pick(page, "Pixelate");
    await expect(
      page.getByText(/^1 region, medium pixelation · H\.264 640×360 · sound copied$/),
    ).toBeVisible();
    await pick(page, "Box");
    await expect(page.getByRole("radio", { name: "Strong" })).toHaveCount(0);
  });

  test("a format the page cannot open is sent to the converter first", async ({ page }) => {
    await page.goto("/blur-video");
    await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.avi");
    await expect(page.getByText(/Convert it to MP4 first/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Convert to MP4" })).toBeVisible();
  });
});

test.describe("blur part of a video: results", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("leaves no trace of which letters were under the region (default strength)", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const uploads = trackUploads(page);
    const out: string[] = [];
    for (const f of ["a", "b"]) {
      const blur = await open(page, `tests/fixtures/overlay/plate-${f}.mp4`);
      await coverPlate(page);
      if (f === "a") await shootWidths(page, "blur-plate-ready");
      await blur.click();
      if (f === "a") {
        await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
      }
      await expect(page.getByText("1 region blurred", { exact: true })).toBeVisible({
        timeout: 240_000,
      });
      if (f === "a") await shootWidths(page, "blur-done");
      const { path, name } = await saveDownload(page);
      expect(name).toBe(`plate-${f}-blurred.mp4`);
      const p = probe(path);
      expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
      expect(p.streams[1]?.codec_name).toBe("aac");
      expect(p.duration).toBeCloseTo(3, 1);
      out.push(path);
    }
    const [a, b] = out as [string, string];
    const src = (f: string) => `tests/fixtures/overlay/plate-${f}.mp4`;
    // What tells the two plates apart, at the scale of letters: the A − B difference with its
    // local average (a 17 px box, about a letter's width) taken off. Blur keeps the coarse
    // distribution of ink (the whole-difference figure), which is why Box is advised for secrets.
    const letters = (x: Uint8Array, y: Uint8Array) => letterDetail(x, y, PLATE.w, PLATE.h);
    const before = letters(pixels(src("a"), 1.5, PLATE), pixels(src("b"), 1.5, PLATE));
    const after = letters(pixels(a, 1.5, PLATE), pixels(b, 1.5, PLATE));
    // The encoder's own noise on the same still picture, two seconds apart, at the same scale.
    const noise = letters(pixels(a, 0.5, PLATE), pixels(a, 2.5, PLATE));
    const whole = rms(pixels(a, 1.5, PLATE), pixels(b, 1.5, PLATE));
    process.stdout.write(
      `plate letters A vs B, letter-scale RMS: before ${before.toFixed(2)}, after ${after.toFixed(2)}, encoder noise ${noise.toFixed(2)}; whole-difference RMS after ${whole.toFixed(2)} (before ${rms(pixels(src("a"), 1.5, PLATE), pixels(src("b"), 1.5, PLATE)).toFixed(2)}); spread left ${spread(pixels(a, 1.5, PLATE)).toFixed(2)} of ${spread(pixels(src("a"), 1.5, PLATE)).toFixed(2)}\n`,
    );
    expect(before).toBeGreaterThan(40);
    expect(after).toBeLessThan(Math.max(2, noise * 1.5));
    // Outside the region the picture is untouched (apart from the encode).
    const outside = { x: 20, y: 20, w: 100, h: 60 };
    expect(rms(pixels(a, 1.5, outside), pixels(src("a"), 1.5, outside))).toBeLessThan(2);
    expect(uploads).toEqual([]);
  });

  test("a region with key frames follows the moving plate", async ({ page }) => {
    test.setTimeout(300_000);
    const blur = await open(page, "tests/fixtures/overlay/plate-moving.mp4");
    // At 0 s the plate is at x = 100; at 2.9 s at x = 390.
    await coverPlate(page, 100);
    await page.getByLabel("Follows a moving subject").check();
    await seek(page, 2.9);
    const r = region(page, 1);
    const at = await pictureToPage(page, 640);
    const box = await r.boundingBox();
    if (!box) throw new Error("no region");
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const to = at(390 + PLATE.w / 2, PLATE.y + PLATE.h / 2);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, from.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("button", { name: /^Key frame at/ })).toHaveCount(2);
    await shootWidths(page, "blur-keyframes");
    await blur.click();
    await expect(page.getByText("1 region blurred", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    const { path } = await saveDownload(page);
    // Halfway the plate is at x = 250; its letters are gone there, and at the start and end too.
    for (const [t, x] of [
      [0.2, 120],
      [1.5, 250],
      [2.8, 380],
    ] as const) {
      const plate = { ...PLATE, x: x + 20, w: PLATE.w - 40, y: PLATE.y + 12, h: PLATE.h - 24 };
      const left = spread(pixels(path, t, plate));
      const source = spread(pixels("tests/fixtures/overlay/plate-moving.mp4", t, plate));
      process.stdout.write(
        `moving plate at ${t} s: spread ${left.toFixed(1)} (source ${source.toFixed(1)})\n`,
      );
      expect(left).toBeLessThan(source * 0.35);
    }
  });

  test("a run cancels within a second and can run again", async ({ page }) => {
    test.setTimeout(300_000);
    const blur = await open(page, "tests/fixtures/sample-large.mp4", /320×320 at 480, 200/);
    await blur.click();
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeVisible();
    const t0 = Date.now();
    await cancel.click();
    await expect(blur).toBeEnabled({ timeout: 5_000 });
    const took = Date.now() - t0;
    process.stdout.write(`cancel to ready: ${took} ms\n`);
    expect(took).toBeLessThan(1500);
    await blur.click();
    await expect(cancel).toBeVisible();
    await shootWidths(page, "blur-processing");
    const { path } = await saveDownload(page);
    expect(probe(path).streams[0]).toMatchObject({ codec_name: "h264", width: 1280, height: 720 });
  });

  test("a rotated phone clip keeps its upright picture and the region where it was drawn", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/blur-video");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("tests/fixtures/sample-rotated.mp4");
    const blur = page.getByRole("button", { name: "Blur", exact: true });
    await expect(blur).toBeEnabled({ timeout: 30_000 });
    // 640×360 turned 90° plays as 360×640: the starting region is a quarter of that width.
    await expect(region(page, 1)).toHaveAttribute("aria-label", /90×90 at 135, 275/);
    await pick(page, "Box");
    await blur.click();
    const { path } = await saveDownload(page);
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ width: 360, height: 640 });
    // The box is black where the region was; the picture beside it is not.
    const inside = pixels(path, 1, { x: 145, y: 285, w: 70, h: 70 });
    expect(Math.max(...inside)).toBeLessThan(40);
    expect(spread(pixels(path, 1, { x: 10, y: 10, w: 100, h: 100 }))).toBeGreaterThan(10);
  });
});
