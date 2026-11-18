import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  mean,
  pixels,
  probe,
  rms,
  saveDownload,
  shootWidths,
  trackUploads,
} from "./overlay-helpers";

/**
 * Add an image to a video, end to end, on the 640×360 test pattern. Two layers: a still sticker
 * with transparency (a dark ring with a light centre, 120×120) and an animated GIF (or APNG) that
 * blinks black then white, half a second each. The GIF is moved right, turned and shown from 1 s,
 * and the result is read back: the ring where it was placed, the GIF absent before 1 s and on the
 * right frame after (black at 1.25 s, white at 1.75 s, from the moment it appears). Encoding needs
 * WebCodecs, so the run is Chromium only; the page is checked everywhere.
 */

const layer = (page: Page, n: number) =>
  page.getByRole("group", { name: new RegExp(`^Image ${n}:`) });

async function open(page: Page) {
  await page.goto("/add-image-to-video");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add an image to a video");
  await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
    "Drop a video to put images or stickers on it",
  );
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.mp4");
  const add = page.getByRole("button", { name: "Add to video", exact: true });
  await expect(add).toBeDisabled({ timeout: 30_000 });
  await expect(page.getByText("Add an image first.")).toBeVisible();
  return add;
}

const images = (page: Page) => page.locator('input[type="file"][accept*="image/gif"]');

test.describe("add an image to a video: the page", () => {
  test("layers are placed, turned, stacked and removed from the pointer and keyboard", async ({
    page,
  }) => {
    const add = await open(page);
    await images(page).setInputFiles([
      "tests/fixtures/overlay/sticker.png",
      "tests/fixtures/overlay/blink.gif",
    ]);
    await expect(add).toBeEnabled();
    // 30% of 640 = 192 px wide, centred; the second one stepped 5% down and right.
    await expect(layer(page, 1)).toHaveAttribute("aria-label", /192×192 at 224, 84/);
    await expect(layer(page, 2)).toHaveAttribute("aria-label", /192×192 at 256, 102/);
    await expect(page.getByText("blink.gif")).toBeVisible();
    await expect(page.getByText(/80×80 · animated/)).toBeVisible();
    await shootWidths(page, "image-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // Keyboard on the picture: move, resize, turn.
    const two = layer(page, 2);
    await two.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(two).toHaveAttribute("aria-label", /at 252, 102/);
    await page.keyboard.press("]");
    await expect(two).toHaveAttribute("aria-label", /turned 5°/);
    await page.keyboard.press("-");
    await expect(two).toHaveAttribute("aria-label", /175×175/);
    // Stack order: move image 2 down, so the GIF is now first in the list.
    await page.getByRole("button", { name: "Move image 2 down the stack" }).click();
    await expect(
      page.getByRole("list", { name: "Images" }).getByRole("listitem").first(),
    ).toContainText("sticker.png");
    // Remove from the keyboard: Delete on the focused layer.
    await layer(page, 2).focus();
    await page.keyboard.press("Delete");
    await expect(layer(page, 2)).toHaveCount(0);
    await expect(add).toBeEnabled();
  });

  test("a file that is not an image is refused with its name", async ({ page }) => {
    await open(page);
    await images(page).setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.getByRole("region", { name: "Workspace" }).getByRole("alert")).toContainText(
      "notes.txt is not a PNG, JPEG, WebP, GIF, AVIF or SVG image.",
    );
  });
});

test.describe("add an image to a video: results", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  for (const sticker of ["blink.gif", "blink-apng.png"]) {
    test(`a still sticker and an animated ${sticker.endsWith(".gif") ? "GIF" : "APNG"} land where placed, at the right frame`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const uploads = trackUploads(page);
      const add = await open(page);
      await images(page).setInputFiles([
        "tests/fixtures/overlay/sticker.png",
        `tests/fixtures/overlay/${sticker}`,
      ]);
      await expect(layer(page, 2)).toBeVisible();
      // Move the animated one right by 160 px (4 × 40 with Shift) and turn it 45°.
      const two = layer(page, 2);
      await two.focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
      await expect(two).toHaveAttribute("aria-label", /at 416, 102/);
      await page.getByText("More options", { exact: true }).click();
      await page.getByLabel("Turn in degrees").fill("45");
      await page.getByLabel("Turn in degrees").press("Enter");
      await expect(two).toHaveAttribute("aria-label", /turned 45°/);
      // Shown from 1 s: Shift moves the start handle one second.
      await page.getByRole("slider", { name: "Image 2 start" }).focus();
      await page.keyboard.press("Shift+ArrowRight");
      await expect(page.getByText(/Image 2: 0:01\.00 to 0:03\.00/)).toBeVisible();
      await add.click();
      await expect(page.getByText("2 images added", { exact: true })).toBeVisible({
        timeout: 240_000,
      });
      await shootWidths(page, "image-done");
      const { path, name } = await saveDownload(page);
      expect(name).toBe("sample-with-image.mp4");
      const p = probe(path);
      expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
      expect(p.streams[1]?.codec_name).toBe("aac");
      // The ring of the still sticker (radius 30 to 54 of 60, scaled 1.6×) right of its centre.
      expect(mean(pixels(path, 0.5, { x: 320 + 60, y: 175, w: 10, h: 10 }))).toBeLessThan(40);
      // Its light centre.
      expect(mean(pixels(path, 0.5, { x: 315, y: 175, w: 10, h: 10 }))).toBeGreaterThan(200);
      // The animated one, centred at 512, 198: not there before 1 s (the test pattern shows),
      // black 0.25 s after it appears, white 0.75 s after, black again after a loop.
      const centre = { x: 492, y: 178, w: 40, h: 40 };
      expect(
        rms(pixels(path, 0.5, centre), pixels("tests/fixtures/sample.mp4", 0.5, centre)),
      ).toBeLessThan(6);
      expect(mean(pixels(path, 1.25, centre))).toBeLessThan(30);
      expect(mean(pixels(path, 1.75, centre))).toBeGreaterThan(225);
      expect(mean(pixels(path, 2.25, centre))).toBeLessThan(30);
      expect(uploads).toEqual([]);
    });
  }
});
