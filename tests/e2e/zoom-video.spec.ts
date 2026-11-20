import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { noAxeViolations, probe, psnr, saveLink, shot, trackUploads } from "./time-layout-helpers";

/**
 * Zoom video, end to end, on sample.mp4 (640×360, 3 s, moving test pattern): the default push-in
 * from 1× to 1.5×, then the output against the ffmpeg command the page shows (run with the local
 * ffmpeg on the same file): every frame must match it closely. Encoding needs Chromium.
 */
const open = async (page: Page, fixture = "tests/fixtures/sample.mp4") => {
  await page.goto("/zoom-video");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zoom in on a video");
  await shot(page, "zoom-idle");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  const run = page.getByRole("button", { name: "Zoom", exact: true });
  await expect(run).toBeEnabled({ timeout: 30_000 });
  return run;
};

/** Runs the result's ffmpeg command (kept on the result, not shown) with the local ffmpeg. */
async function runShownCommand(page: Page, fixture: string): Promise<string> {
  const cmd =
    (await page.locator("[data-ffmpeg-command]").first().getAttribute("data-ffmpeg-command")) ?? "";
  const out = join(mkdtempSync(join(tmpdir(), "zoom-ref-")), "ref.mp4");
  const name = fixture.split("/").pop() ?? "";
  const quoted = (f: string) => `'${f.replace(/'/g, "'\\''")}'`;
  const local = cmd
    .replace(
      new RegExp(`-i ('${name}'|${name.replace(".", "\\.")}) `),
      `-i ${quoted(resolve(fixture))} `,
    )
    .replace(/ ('[^']+-zoom\.mp4'|\S+-zoom\.mp4)$/, ` ${quoted(out)}`)
    .replace(/^ffmpeg /, "ffmpeg -y -v error ");
  execSync(local, { stdio: "pipe" });
  return out;
}

test.describe("zoom video", () => {
  test("renders with a push-in, has no axe violations, key frames move by keyboard", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await open(page);
    await expect(page.getByText(/closest 1\.5×, 240 of 360 lines of detail/)).toBeVisible();
    const second = page.getByRole("slider", { name: "Key frame 2" });
    await expect(second).toHaveAttribute("aria-valuetext", /0:02\.97, 1\.5× zoom/);
    await shot(page, "zoom-ready");
    await noAxeViolations(page);
    await second.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(second).toHaveAttribute("aria-valuetext", /0:01\.97/);
    // On the key frame, the panel edits it: 2× there.
    await expect(page.getByText("Key frame at 0:01.97")).toBeVisible();
    await page.getByRole("radio", { name: "2×" }).locator("xpath=..").click();
    await expect(page.getByText(/closest 2×, 180 of 360/)).toBeVisible();
    // Typing a zoom commits once, on Enter: one key frame, edited, not one per keystroke.
    const factor = page.getByLabel("Zoom factor");
    await factor.fill("2.5");
    await expect(page.getByText(/closest 2×, 180 of 360/)).toBeVisible();
    await factor.press("Enter");
    await expect(page.getByText(/closest 2\.5×, 144 of 360/)).toBeVisible();
    await expect(page.getByRole("slider", { name: /Key frame/ })).toHaveCount(2);
    // The result preview draws the zoomed picture.
    await page.getByRole("radio", { name: "Result" }).locator("xpath=..").click();
    await expect(page.getByRole("img", { name: "Preview of the zoomed result" })).toBeVisible();
    await shot(page, "zoom-result-preview");
  });

  test("the output matches ffmpeg's scale and crop of the same key frames", async ({
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
    await shot(page, "zoom-processing");
    await expect(page.getByText("Zoom added", { exact: true })).toBeVisible({ timeout: 240_000 });
    await shot(page, "zoom-done");
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-zoom.mp4");
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.streams[0]).toMatchObject({ width: 640, height: 360 });
    expect(p.duration).toBeCloseTo(3, 1);
    const ref = await runShownCommand(page, "tests/fixtures/sample.mp4");
    const whole = psnr(path, 0, ref, 0, 3);
    const start = psnr(path, 0, "tests/fixtures/sample.mp4", 0, 0.1);
    test.info().annotations.push({
      type: "psnr",
      description: `against ffmpeg scale+crop ${whole} dB; first frames against the source ${start} dB`,
    });
    expect(start).toBeGreaterThan(35);
    // FFmpeg rounds the scaled size and the crop to whole pixels each frame; this page does not.
    expect(whole).toBeGreaterThan(28);
    expect(uploads).toEqual([]);
  });

  test("a steady 2× zoom matches FFmpeg's exact crop and Lanczos scale", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    test.setTimeout(240_000);
    const run = await open(page);
    await expect(page.getByText("Key frame at 0:00.00")).toBeVisible();
    await page.getByRole("radio", { name: "2×" }).locator("xpath=..").click();
    await page.getByRole("slider", { name: "Key frame 2" }).click();
    await expect(page.getByText("Key frame at 0:02.97")).toBeVisible();
    await page.getByRole("radio", { name: "2×" }).locator("xpath=..").click();
    await run.click();
    await expect(page.getByText("Zoom added", { exact: true })).toBeVisible({ timeout: 240_000 });
    const { path } = await saveLink(page);
    const exact = psnr(path, 0, "tests/fixtures/sample.mp4", 0, 3, {
      b: "crop=320:180:160:90,scale=640:360:flags=lanczos",
    });
    test.info().annotations.push({
      type: "psnr",
      description: `steady 2× against FFmpeg crop+lanczos ${exact} dB`,
    });
    expect(exact).toBeGreaterThan(32);
  });

  test("cancel returns to the ready state", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");
    const run = await open(page);
    await run.click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(run).toBeEnabled({ timeout: 5_000 });
  });
});
