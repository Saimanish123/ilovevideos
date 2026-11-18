import { expect, type Page, test } from "@playwright/test";

/**
 * Site-wide keys, tool-page chords, the preview's player keys and the preview gestures (README design
 * system, keyboard and gestures; ADR on shortcuts). Encoding runs need WebCodecs: Chromium only.
 */

const video = (page: Page) => page.locator("section[aria-label='Workspace'] video").first();
const currentTime = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);

async function load(page: Page, slug: string, file = "tests/fixtures/sample.mp4") {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(video(page)).toBeAttached({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const v = document.querySelector("section[aria-label='Workspace'] video") as HTMLVideoElement;
    return v && Number.isFinite(v.duration) && v.duration > 0;
  });
}

test.describe("site keys", () => {
  test("? lists every shortcut and gesture; Escape closes it", async ({ page }) => {
    await page.goto("/compress-video");
    await page.waitForLoadState("networkidle"); // keys need the hydrated header
    await page.keyboard.press("Shift+?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts and gestures" });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    for (const group of ["Everywhere", "On a tool page", "Preview", "Touch and pointer"])
      await expect(dialog.getByRole("heading", { name: group })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("/ opens search, and is plain text inside a field", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle"); // keys need the hydrated header
    await page.keyboard.press("/");
    const search = page.getByRole("combobox", { name: "Search tools" });
    await expect(search).toBeFocused({ timeout: 10_000 });
    await page.keyboard.type("a/b");
    await expect(search).toHaveValue("a/b");
  });

  test("the footer link opens the same list", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("button", { name: "Shortcuts", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts and gestures" })).toBeVisible(
      {
        timeout: 10_000,
      },
    );
  });
});

test.describe("player keys", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one run is enough");

  test("K, J/L, arrows, digits, frame steps and M act on the preview", async ({ page }) => {
    await load(page, "compress-video");
    await video(page).click();
    await video(page).click(); // started then paused: the last press was in the workspace
    await page.keyboard.press("5");
    expect(await currentTime(page)).toBeCloseTo(1.5, 1);
    await page.keyboard.press("j");
    expect(await currentTime(page)).toBe(0);
    await page.keyboard.press("l");
    expect(await currentTime(page)).toBeCloseTo(3, 1);
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    expect(await currentTime(page)).toBeCloseTo(3, 1); // 5 s, clamped to the 3 s clip
    await page.keyboard.press("0");
    await page.keyboard.press(".");
    expect(await currentTime(page)).toBeCloseTo(1 / 30, 2);
    await page.keyboard.press(",");
    expect(await currentTime(page)).toBe(0);
    await page.keyboard.press("m");
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await page.keyboard.press("k");
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  });

  test("a page's own key keeps its meaning: ← on extract frame is one frame, not 5 s", async ({
    page,
  }) => {
    await load(page, "extract-frame-from-video");
    // The page's own arrow keys arrive with its panel; before that the player's keys answer.
    await expect(page.getByRole("button", { name: /Take this frame/ })).toBeVisible();
    // A press in the workspace (not on the picture, which would play) puts the keys there.
    await page.locator("section[aria-label='Workspace']").click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("5");
    await expect.poll(() => currentTime(page)).toBeCloseTo(1.5, 1);
    const before = await currentTime(page);
    await page.keyboard.press("ArrowLeft");
    const step = before - (await currentTime(page));
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.1);
  });
});

test.describe("tool chords", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding is Chromium only");

  test("⌘/Ctrl+Enter runs the action and ⌘/Ctrl+S saves the result", async ({ page }) => {
    test.setTimeout(120_000);
    await load(page, "rotate-video");
    await page.getByRole("button", { name: "Rotate right" }).click();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
      timeout: 90_000,
    });
    const download = page.waitForEvent("download");
    await page.keyboard.press("ControlOrMeta+s");
    expect((await download).suggestedFilename()).toMatch(/\.mp4$/);
  });

  test("⌘/Ctrl+O opens the picker, also with a file already in", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/compress-video");
    await page.waitForLoadState("networkidle"); // the chords need the hydrated stage
    let chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("ControlOrMeta+o");
    await (await chooser).setFiles("tests/fixtures/sample.mp4");
    await expect(page.getByRole("button", { name: "Compress", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("ControlOrMeta+o");
    await (await chooser).setFiles("tests/fixtures/sample-b.mp4");
    await expect(page.getByText("sample-b.mp4").first()).toBeVisible({ timeout: 30_000 });
  });

  test("Escape cancels a run", async ({ page }) => {
    test.setTimeout(120_000);
    // A GIF of a 12 s 720p clip takes seconds, so the run is still going when Escape arrives.
    await load(page, "video-to-gif", "tests/fixtures/sample-large.mp4");
    const make = page.getByRole("button", { name: "Make GIF", exact: true });
    await make.click();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(make).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(0);
  });

  test("Delete removes the focused clip from a list", async ({ page }) => {
    await page.goto("/merge-videos");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(["tests/fixtures/sample.mp4", "tests/fixtures/sample-b.mp4"]);
    const first = page.getByRole("button", { name: /^Clip 1, sample\.mp4/ });
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.focus();
    await page.keyboard.press("Delete");
    // One clip left: nothing to reorder, so its Remove button takes focus.
    await expect(page.getByRole("button", { name: "Remove sample-b.mp4" })).toBeFocused();
  });
});

test.describe("preview gestures", () => {
  test.skip(({ isMobile }) => !isMobile, "touch gestures run on the phone projects");

  test("a tap plays or pauses; a double tap on the right seeks 5 s and leaves playback as it was", async ({
    page,
  }) => {
    await load(page, "compress-video", "tests/fixtures/sample-large.mp4");
    const box = (await video(page).boundingBox()) ?? { x: 0, y: 0, width: 300, height: 200 };
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.touchscreen.tap(centre.x, centre.y);
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
    await page.touchscreen.tap(centre.x, centre.y);
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    const before = await currentTime(page);
    const right = { x: box.x + box.width * 0.85, y: centre.y };
    await page.touchscreen.tap(right.x, right.y);
    await page.touchscreen.tap(right.x, right.y);
    await expect(page.getByText(/^\+5\s?s$/)).toBeVisible();
    expect(await currentTime(page)).toBeCloseTo(before + 5, 0);
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  });
});
