import { expect, test } from "@playwright/test";

/** The trim timeline: dragging the start handle moves the range, snaps to frames and updates the inputs. */
test("trim timeline handle drag updates the range", async ({ page, browserName }) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit cannot decode the H.264 fixture for the filmstrip",
  );
  await page.goto("/trim-video");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
  await expect(page.getByRole("button", { name: "Trim", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const start = page.getByRole("slider", { name: "Start" });
  await expect(start).toBeVisible();
  await start.scrollIntoViewIfNeeded();
  // Wait for layout: the track must have real width before we compute drag distances.
  await expect
    .poll(async () => (await start.locator("..").boundingBox())?.width ?? 0)
    .toBeGreaterThan(100);
  // Pointer capture can lose the first gesture while frames are still decoding under parallel test
  // load; the interaction itself is deterministic, so retry the drag up to three times.
  let value = 0;
  for (let attempt = 0; attempt < 3 && value < 0.5; attempt++) {
    const track = await start.locator("..").boundingBox();
    const box = await start.boundingBox();
    if (!track || !box) throw new Error("timeline not laid out");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + track.width * 0.25, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(150);
    value = Number(await page.locator("#start").inputValue());
  }
  expect(value).toBeGreaterThan(0.5);
  expect(value).toBeLessThan(1.2);
  // The input shows hundredths; aria-valuenow carries thousandths of the same frame-snapped time.
  const now = Number(await start.getAttribute("aria-valuenow"));
  expect(Math.abs(now - value)).toBeLessThan(0.01);
  await expect(start).toHaveAttribute("aria-valuetext", /^\d+:\d\d\.\d\d$/);

  // Keyboard: one frame right at 30 fps
  await start.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => Number(await page.locator("#start").inputValue()))
    .toBeGreaterThan(value);
  const after = Number(await page.locator("#start").inputValue());
  expect(after - value).toBeLessThan(0.05);
});
