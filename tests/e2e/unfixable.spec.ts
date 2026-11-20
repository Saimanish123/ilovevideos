import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * A block no option can clear (ADR-0141): no options, no controls on the picture, no primary
 * button; the reason says what to do next, one way out stands where the button was, and the reason
 * is announced.
 */
const fx = (name: string) => `tests/fixtures/${name}`;

async function open(page: Page, slug: string, file: string) {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').first().setInputFiles(fx(file));
}

test("a sound-only file on a picture tool: the reason, Choose another file, nothing else", async ({
  page,
}) => {
  await open(page, "rotate-video", "sample.mp3");
  const workspace = page.getByRole("region", { name: "Workspace" });
  await expect(workspace).toContainText(
    "This file has no video track to rotate. Choose a video file.",
    { timeout: 30_000 },
  );
  const again = page.getByRole("button", { name: "Choose another file", exact: true });
  await expect(again).toBeVisible();
  await expect(again).toBeInViewport();
  // No dead button and no live options for a job that cannot run.
  await expect(page.locator('[data-action="run"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rotate right" })).toHaveCount(0);
  // One live region, the status line, carries the reason; it is spoken, not duplicated.
  await expect(page.getByRole("status").filter({ hasText: "Choose a video file." })).toHaveCount(1);
  await expect(page.getByText("This file has no video track to rotate.")).toHaveCount(1);
  const a11y = await new AxeBuilder({ page }).include("main").analyze();
  expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  // The way out opens the file picker.
  const chooser = page.waitForEvent("filechooser");
  await again.click();
  await chooser;
});

test("a format the page cannot open: the converter is the way out, no controls on the picture", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "webkit", "ffmpeg inspection runs in Chromium in these tests");
  test.setTimeout(120_000);
  await open(page, "blur-video", "sample.avi");
  await expect(page.getByRole("link", { name: "Convert to MP4" })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-action="run"]')).toHaveCount(0);
  await expect(page.locator('[data-action="replace"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add region" })).toHaveCount(0);
});

test("a sound-only file on fade video points to the audio fade page", async ({ page }) => {
  await open(page, "fade-video", "sample.m4a");
  await expect(page.getByRole("link", { name: "Fade audio" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-action="run"]')).toHaveCount(0);
});
