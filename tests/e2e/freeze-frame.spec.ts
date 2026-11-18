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
 * Freeze frame, end to end, on sample.mp4 (640×360, 3 s at 30 fps, a moving test pattern, a 440 Hz
 * tone): the default hold (2 s on the middle frame), read back with ffmpeg: the held frames are one
 * picture, the sound is silent under the hold in pause mode and plays on in over mode. Encoding runs
 * in Chromium only (Playwright's WebKit has no H.264 encoder); the page itself is checked everywhere.
 */
const open = async (page: Page, fixture = "tests/fixtures/sample.mp4") => {
  await page.goto("/freeze-frame-video");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Freeze a frame in a video");
  await shot(page, "freeze-idle");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  const run = page.getByRole("button", { name: "Freeze", exact: true });
  await expect(run).toBeEnabled({ timeout: 30_000 });
  return run;
};

test.describe("freeze frame", () => {
  test("renders, has no axe violations and moves a hold by keyboard", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    const hold = page.getByRole("slider", { name: "Hold 1" });
    await expect(hold).toHaveAttribute("aria-valuetext", /Frame at 0:01\.50, held 2\ss/);
    await expect(
      page.getByText(/^0:03 → 0:05 · 640×360 · ≈ .* · H\.264, silence in the hold, AAC$/),
    ).toBeVisible();
    await shot(page, "freeze-ready");
    await noAxeViolations(page);
    await hold.focus();
    await page.keyboard.press("ArrowRight");
    await expect(hold).toHaveAttribute("aria-valuetext", /Frame at 0:01\.53/);
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(hold).toHaveAttribute("aria-valuetext", /Frame at 0:00\.53/);
    // The length field takes free text and commits on Enter.
    const length = page.getByLabel(/Hold at 0:00\.53, length in seconds/);
    await length.fill("3.5");
    await length.press("Enter");
    await expect(hold).toHaveAttribute("aria-valuetext", /held 3\.5\ss/);
    // A hold cannot pass its neighbour, so focus stays on it.
    await page.getByRole("button", { name: "Hold the last frame" }).click();
    const second = page.getByRole("slider", { name: "Hold 2" });
    await expect(second).toHaveAttribute("aria-valuetext", /Frame at 0:02\.97/);
    await hold.focus();
    await page.keyboard.press("End");
    await expect(hold).toHaveAttribute("aria-valuetext", /Frame at 0:02\.93/);
    await expect(hold).toBeFocused();
    await expect(second).toHaveAttribute("aria-valuetext", /Frame at 0:02\.97/);
    await page.keyboard.press("Delete");
    await expect(page.getByRole("slider", { name: "Hold 2" })).toHaveCount(0);
    // The last hold stays: Delete is ignored with one hold, as the panel offers no remove for it.
    const only = page.getByRole("slider", { name: "Hold 1" });
    await only.focus();
    await page.keyboard.press("Delete");
    await expect(only).toHaveAttribute("aria-valuetext", /Frame at 0:02\.97/);
    await expect(page.getByRole("button", { name: "Freeze", exact: true })).toBeEnabled();
  });

  test("pause: the frame holds for 2 s in silence, then the video carries on", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    const run = await open(page);
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await shot(page, "freeze-processing");
    await expect(page.getByText("Frame frozen", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await shot(page, "freeze-done");
    const link = page.getByRole("link", { name: "Download" }).first();
    await link.focus();
    await expect(link).toBeFocused();
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-freeze.mp4");
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.streams[0]).toMatchObject({ width: 640, height: 360 });
    expect(p.duration).toBeCloseTo(5, 1);
    // Frame 45 (1.5 s) is shown from 1.5 s to 3.533 s of the output.
    const held = grayFrame(path, 1.6);
    expect(frameDiff(held, grayFrame(path, 2.5))).toBeLessThan(1.5);
    expect(frameDiff(held, grayFrame(path, 3.45))).toBeLessThan(1.5);
    expect(frameDiff(held, grayFrame("tests/fixtures/sample.mp4", 1.5))).toBeLessThan(3);
    // After the hold the video goes on from the next frame: output 4.0 s is source 2.0 s.
    expect(
      frameDiff(grayFrame(path, 4.0), grayFrame("tests/fixtures/sample.mp4", 1.967)),
    ).toBeLessThan(3);
    // Quality of the re-encoded picture outside the hold, against the source (ADR-0062 measurement).
    const before = psnr(path, 0, "tests/fixtures/sample.mp4", 0, 1.5);
    const after = psnr(path, 3.5333, "tests/fixtures/sample.mp4", 1.5333, 1.4);
    test.info().annotations.push({
      type: "psnr",
      description: `${before} dB before, ${after} dB after the hold`,
    });
    expect(before).toBeGreaterThan(35);
    expect(after).toBeGreaterThan(35);
    expect(rms(path, 1.62, 3.45)).toBeLessThan(0.002);
    expect(rms(path, 0.2, 1.4)).toBeGreaterThan(0.05);
    expect(rms(path, 3.65, 4.8)).toBeGreaterThan(0.05);
    expect(uploads).toEqual([]);
  });

  test("sound plays on: the picture stops, the length and the sound stay", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const run = await open(page);
    await page.getByRole("radio", { name: "Sound plays on" }).locator("xpath=..").click();
    await expect(page.getByText(/^0:03 · 640×360 · ≈ .* · H\.264, sound copied$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Hold the last frame" })).toHaveCount(0);
    await run.click();
    await expect(page.getByText("Frame frozen", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    const { path } = await saveLink(page);
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.duration).toBeCloseTo(3, 1);
    const held = grayFrame(path, 1.6);
    expect(frameDiff(held, grayFrame(path, 2.9))).toBeLessThan(1.5);
    expect(rms(path, 1.6, 2.9)).toBeGreaterThan(0.05);
  });

  test("hold the last frame of a clip without sound, and cancel a run", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const run = await open(page, "tests/fixtures/sample-silent.mp4");
    await page.getByRole("button", { name: "Remove hold 1" }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Hold the last frame" }).click();
    await page.getByRole("button", { name: /Remove hold 1/ }).click();
    await expect(page.getByRole("slider", { name: "Hold 1" })).toHaveAttribute(
      "aria-valuetext",
      /Frame at 0:02\.97/,
    );
    await expect(page.getByText(/· H\.264, no sound$/)).toBeVisible();
    // Cancel frees the run and returns to ready.
    await run.click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(run).toBeEnabled({ timeout: 5_000 });
    await run.click();
    await expect(page.getByText("Frame frozen", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    const { path } = await saveLink(page);
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264"]);
    expect(p.duration).toBeCloseTo(5, 1);
    expect(frameDiff(grayFrame(path, 3.1), grayFrame(path, 4.9))).toBeLessThan(1.5);
  });

  test("a phone video keeps its rotation", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const run = await open(page, "tests/fixtures/sample-rotated.mp4");
    await run.click();
    await expect(page.getByText("Frame frozen", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    const { path } = await saveLink(page);
    // Displayed upright: the frame as ffmpeg shows it (rotation applied) is 360×640.
    const raw = grayFrame(path, 0.5, 36, 64);
    expect(raw.length).toBe(36 * 64);
    const src = grayFrame("tests/fixtures/sample-rotated.mp4", 0.5, 36, 64);
    expect(frameDiff(raw, src)).toBeLessThan(4);
  });

  test("an odd-sized WebM is written as even H.264 in MP4", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const run = await open(page, "tests/fixtures/sample-odd.webm");
    await expect(page.getByText(/641×361 → 640×360 ·/)).toBeVisible();
    await run.click();
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-odd-freeze.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
  });
});
