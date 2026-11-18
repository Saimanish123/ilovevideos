import { expect, test } from "@playwright/test";

/**
 * The next-step link hands the result to the next tool in memory (lib/handoff): the next page opens
 * with the file already read, with no download and no re-upload. WebKit is skipped: no WebCodecs encoder.
 */
test.describe("next step hands the result on", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "needs WebCodecs encode");

  test("a split part opens in compress already loaded", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/split-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const split = page.getByRole("button", { name: "Split", exact: true });
    await expect(split).toBeVisible({ timeout: 30_000 });
    await split.click();
    await expect(page.getByText("Split into 2 parts")).toBeVisible({ timeout: 90_000 });

    await page.getByRole("link", { name: "Compress this part to share it" }).click();
    await expect(page).toHaveURL(/\/compress-video$/);
    // The stage skips idle: the part is read and the page answers for it. A 1.5 s part is already
    // smaller than Balanced would make it, so compress settles instead of offering a button.
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace).toContainText("sample-part-01", { timeout: 30_000 });
    await expect(workspace.getByRole("status")).toContainText("Already smaller than this setting");
    await expect(workspace.getByText(/Drop a video/)).toHaveCount(0);
  });

  test("a converted subtitle file goes into add subtitles' subtitle slot", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/srt-to-vtt");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/subtitles/sample.srt");
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page
      .getByRole("region", { name: "Workspace" })
      .getByRole("link", { name: "Add subtitles to a video" })
      .click();
    await expect(page).toHaveURL(/\/add-subtitles-to-video$/);
    // The subtitle waits in its slot; the drop zone asks only for the video it belongs to.
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace).toContainText("Drop the video for sample.vtt", { timeout: 15_000 });
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(workspace.getByText("sample.vtt")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Choose the subtitle file" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add subtitles", exact: true })).toBeEnabled();
  });

  test("a reload does not bring a handed-on file back", async ({ page }) => {
    await page.goto("/compress-video");
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace.getByText(/Drop a video/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Compress", exact: true })).toHaveCount(0);
  });
});
