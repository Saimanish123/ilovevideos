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
 * Clips for Shorts, Reels and TikTok, end to end, on sample-clips.mp4 (18 s, 320×180: a moving
 * pattern then still colour bars from 8 s, a tone with pauses at 4.0–4.6, 11.0–11.6 and 14.0–14.5 s).
 * The proposal must find the three pauses and the scene change and put the boundary on the scene
 * change; the clips are read back with ffmpeg. Encoding needs Chromium; the page renders everywhere.
 */
const pick = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true }).locator("xpath=..").click();

async function open(page: Page) {
  await page.goto("/cut-video-into-shorts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Cut a video into clips for Shorts, Reels and TikTok",
  );
  await shot(page, "clips-idle");
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample-clips.mp4");
  const run = page.getByRole("button", { name: "Cut clips", exact: true });
  await expect(run).toBeEnabled({ timeout: 30_000 });
  // The proposal is ready once the measuring line has gone.
  await expect(page.getByText(/^Looking for pauses and scene changes/)).toHaveCount(0, {
    timeout: 60_000,
  });
  return run;
}

test.describe("cut a video into shorts", () => {
  test("proposes the boundary at the scene change; keyboard and axe", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await expect(page.getByText(/^1 clip · /)).toBeVisible();
    await pick(page, "15\u00a0s");
    const b1 = page.getByRole("slider", { name: "Boundary 1" });
    await expect(b1).toHaveAttribute("aria-valuetext", /^0:08\.00/);
    await expect(page.getByText(/^2 clips · cuts: 1 at a scene change ·/)).toBeVisible();
    await shot(page, "clips-ready");
    await noAxeViolations(page);
    await b1.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(b1).toHaveAttribute("aria-valuetext", /^0:09\.00/);
    await expect(page.getByText(/^2 clips · boundaries by hand ·/)).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(page.getByText(/^1 clip \(1 over 15\ss\) · boundaries by hand ·/)).toBeVisible();
  });

  test("writes the clips, cropped to 9:16 where each was framed", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(300_000);
    const uploads = trackUploads(page);
    const run = await open(page);
    await pick(page, "15\u00a0s");
    await expect(page.getByRole("slider", { name: "Boundary 1" })).toHaveAttribute(
      "aria-valuetext",
      /^0:08\.00/,
    );
    // Clip 2: move its vertical frame to the right edge.
    await page.getByRole("button", { name: /^Show clip 2,/ }).click();
    const frame = page.getByRole("group", { name: /Vertical frame for clip 2/ });
    await frame.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowRight");
    await run.click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await shot(page, "clips-processing");
    await expect(page.getByText("2 clips cut", { exact: true })).toBeVisible({ timeout: 240_000 });
    await shot(page, "clips-done");
    const one = await saveLink(page, "Download sample-clips-clip-01.mp4");
    const two = await saveLink(page, "Download sample-clips-clip-02.mp4");
    const p1 = probe(one.path);
    const p2 = probe(two.path);
    expect(p1.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    // 9:16 of a 180-line picture: 100×180 (101.25 rounded down to even); the window is 100 wide.
    expect(p1.streams[0]).toMatchObject({ width: 100, height: 180 });
    expect(p1.duration).toBeCloseTo(8, 1);
    expect(p2.duration).toBeCloseTo(10, 1);
    // Clip 1 is the middle of the moving pattern; clip 2 the right edge of the bars.
    const mid = psnr(one.path, 0, "tests/fixtures/sample-clips.mp4", 0, 7.9, {
      b: "crop=100:180:110:0",
    });
    test.info().annotations.push({
      type: "psnr",
      description: `clip 1 against the source crop ${mid} dB`,
    });
    expect(mid).toBeGreaterThan(30);
    expect(
      frameDiff(
        grayFrame(two.path, 2, 20, 36),
        grayFrame("tests/fixtures/sample-clips.mp4", 10, 20, 36, "crop=100:180:220:0"),
      ),
    ).toBeLessThan(8);
    expect(rms(one.path, 0.5, 3.5)).toBeGreaterThan(0.1);
    const zip = page.getByRole("link", { name: "Download all (ZIP)" });
    await expect(zip).toHaveAttribute("download", "sample-clips-clips.zip");
    expect(uploads).toEqual([]);
  });

  test("skipped clips are not written; cancel frees the run", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const run = await open(page);
    await pick(page, "15\u00a0s");
    await pick(page, "Keep shape");
    await page.getByRole("checkbox", { name: /Clip 1/ }).uncheck();
    await expect(page.getByText(/^1 clip · .*320×180/)).toBeVisible();
    await run.click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(run).toBeEnabled({ timeout: 5_000 });
    await run.click();
    await expect(page.getByText("1 clip cut", { exact: true })).toBeVisible({ timeout: 240_000 });
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-clips-clip-02.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ width: 320, height: 180 });
    expect(p.duration).toBeCloseTo(10, 1);
  });
});
