import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";
import { type Box, probe, rms, saveDownload, shootWidths, trackUploads } from "./overlay-helpers";

/**
 * Progress bar and timer, end to end. Results are read back frame by frame from the output with the
 * local ffmpeg on a flat grey fixture (tests/fixtures/sample-flat.mp4, 3 s, 30 fps, 640×360), so the
 * bar's length and the timer's changes can be measured on every frame: the bar against the length
 * it should have (empty on frame 0, full on frame 89), the timer against the frames where its value
 * must change. Encoding needs WebCodecs, so runs are Chromium only; the pages are checked everywhere.
 */

/** Every frame of a box of the video, grey, as one buffer per frame. */
function allFrames(path: string, box: Box): Buffer[] {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `format=gray,crop=${box.w}:${box.h}:${box.x}:${box.y}`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 1 << 30 },
  );
  const n = box.w * box.h;
  const out: Buffer[] = [];
  for (let i = 0; i + n <= raw.length; i += n) out.push(raw.subarray(i, i + n));
  return out;
}

/** Pixels that moved by more than 60 levels: a digit changing, not encoder noise. */
const meanAbs = (a: Buffer, b: Buffer) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > 60) n++;
  return n;
};

/** Presses Tab until the focused element has this accessible name (the keyboard path). */
async function tabTo(page: Page, name: RegExp) {
  const key = page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press(key);
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return (el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim();
    });
    if (name.test(focused)) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

async function open(page: Page, slug: string, file = "tests/fixtures/sample-flat.mp4") {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').first().setInputFiles(file);
}

const pick = (page: Page, name: string) =>
  page
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first()
    .click();

test.describe("add a progress bar: the page", () => {
  test("renders, has no axe violations, and reaches the button from the keyboard", async ({
    page,
  }) => {
    await page.goto("/add-progress-bar-to-video");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Add a progress bar to a video",
    );
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop a video to put a progress bar on it",
    );
    await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.mp4");
    const add = page.getByRole("button", { name: "Add progress bar", exact: true });
    await expect(page.getByText(/4\s?px bar along the bottom · whole video/)).toBeVisible({
      timeout: 30_000,
    });
    await shootWidths(page, "bar-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await pick(page, "Thick");
    await expect(page.getByText(/7\s?px bar along the bottom/)).toBeVisible();
    await pick(page, "Top");
    await expect(page.getByText(/bar along the top/)).toBeVisible();
    await page.getByLabel("Thickness in pixels").fill("12");
    await page.getByLabel("Thickness in pixels").press("Enter");
    await expect(page.getByText(/12\s?px bar along the top/)).toBeVisible();
    await page.getByRole("slider", { name: /start/i }).first().focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByText(/0:01(\.00)? to 0:03/)).toBeVisible();
    if ((await add.isEnabled()) === false) return; // the encoder check failed (WebKit without H.264 encode)
    await tabTo(page, /^Add progress bar$/);
  });

  test("a format the page cannot open is sent to the converter", async ({ page }) => {
    await open(page, "add-progress-bar-to-video", "tests/fixtures/sample.avi");
    await expect(page.getByText(/This tool cannot open this format/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "Convert to MP4" })).toBeVisible();
  });
});

test.describe("add a timer: the page", () => {
  test("renders, has no axe violations, and works from the keyboard", async ({ page }) => {
    await page.goto("/add-timer-to-video");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a timer to a video");
    await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByText(/Counts up 0:00 to 0:02 · top right · whole video/)).toBeVisible({
      timeout: 30_000,
    });
    const box = page.getByRole("group", { name: /^Timer:/ });
    await expect(box).toBeVisible();
    await shootWidths(page, "timer-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // Keyboard on the picture: move it off its anchor, then size it.
    await box.focus();
    const before = await box.getAttribute("aria-label");
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(box).not.toHaveAttribute("aria-label", before ?? "");
    await expect(page.getByText(/placed by hand/)).toBeVisible();
    await page.keyboard.press("+");
    await pick(page, "Down");
    await expect(page.getByText(/Counts down 0:03 to 0:00/)).toBeVisible();
    await page.getByLabel("Start at").fill("1:30");
    await page.getByLabel("Start at").press("Enter");
    await expect(page.getByText(/Counts down 1:30 to 1:28/)).toBeVisible();
    await page.getByText("More options", { exact: true }).click();
    await pick(page, "s.t");
    await expect(page.getByText(/Counts down 90.0 to 87.1/)).toBeVisible();
  });
});

test.describe("progress bar and timer: results", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("the bar has the right length on every frame", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await open(page, "add-progress-bar-to-video");
    const add = page.getByRole("button", { name: "Add progress bar", exact: true });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await pick(page, "Thick"); // 7 px at 360
    await page.getByRole("radio", { name: "White" }).check();
    await add.click();
    await expect(page.getByText("Progress bar added", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await shootWidths(page, "bar-done");
    const { path, name } = await saveDownload(page);
    expect(name).toBe("sample-flat-progress-bar.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.streams[1]?.codec_name).toBe("aac");
    expect(Number(p.streams[0]?.nb_read_frames)).toBe(90);
    // The bar's middle row: 360 − 7 = 353 to 359, read at 356. Track (black 40% over grey 64) ≈ 38,
    // bar white 255: the filled length is the sum of each column's share between the two, up to
    // the bar's anti-aliased end.
    const rows = allFrames(path, { x: 0, y: 356, w: 640, h: 1 });
    const track = 0.6 * 64;
    let worst = 0;
    let total = 0;
    rows.forEach((row, i) => {
      // Up to the edge only: past it, encoder noise in the dark track is not bar.
      let len = 0;
      for (const v of row) {
        const share = Math.min(1, Math.max(0, (v - track) / (255 - track)));
        if (share < 0.1) break;
        len += share;
      }
      const want = (640 * i) / 89;
      const err = Math.abs(len - want);
      if (err > 2)
        process.stdout.write(`frame ${i}: ${len.toFixed(1)} px, want ${want.toFixed(1)}\n`);
      worst = Math.max(worst, err);
      total += err;
    });
    process.stdout.write(
      `progress bar length error: worst ${worst.toFixed(2)} px, mean ${(total / rows.length).toFixed(2)} px over ${rows.length} frames\n`,
    );
    expect(rows.length).toBe(90);
    expect(worst).toBeLessThan(2);
    expect(uploads).toEqual([]);
  });

  test("the timer changes on the right frames, counting up and down", async ({ page }) => {
    test.setTimeout(240_000);
    const crops: Record<string, Buffer[]> = {};
    for (const direction of ["Up", "Down"]) {
      await open(page, "add-timer-to-video");
      const add = page.getByRole("button", { name: "Add timer", exact: true });
      await expect(add).toBeEnabled({ timeout: 30_000 });
      await pick(page, direction);
      await page.getByText("More options", { exact: true }).click();
      await pick(page, "Box");
      await add.click();
      await expect(page.getByText("Timer added", { exact: true })).toBeVisible({
        timeout: 120_000,
      });
      if (direction === "Down") await shootWidths(page, "timer-done");
      const { path } = await saveDownload(page);
      // The block at the top right: 4 % of 360 = 14 px in; read the whole corner.
      crops[direction] = allFrames(path, { x: 500, y: 8, w: 132, h: 56 });
    }
    const up = crops.Up ?? [];
    const down = crops.Down ?? [];
    expect(up.length).toBe(90);
    expect(down.length).toBe(90);
    const changes = (frames: Buffer[]) => {
      const d = frames.slice(1).map((f, i) => ({ i: i + 1, d: meanAbs(f, frames[i] as Buffer) }));
      process.stdout.write(`frame-to-frame change: ${d.map((x) => x.d.toFixed(1)).join(" ")}\n`);
      return d.filter((x) => x.d > 40).map((x) => x.i);
    };
    // Up: 0:00 → 0:01 at 1 s (frame 30), → 0:02 at frame 60. Down from 2.967 s: 0:03 until frame 28,
    // 0:02 from 29, 0:01 from 59, 0:00 on the last frame (89).
    expect(changes(up)).toEqual([30, 60]);
    expect(changes(down)).toEqual([29, 59, 89]);
    // The same value draws the same digits in both runs: 0:01 (up frame 45, down frame 70) and 0:00
    // (up frame 10, down frame 89); different values do not.
    const same = rms(up[45] as Buffer, down[70] as Buffer);
    const same0 = rms(up[10] as Buffer, down[89] as Buffer);
    const differ = rms(up[45] as Buffer, down[40] as Buffer);
    process.stdout.write(
      `timer digits: same value rms ${same.toFixed(2)} / ${same0.toFixed(2)}, different ${differ.toFixed(2)}\n`,
    );
    expect(same).toBeLessThan(3);
    expect(same0).toBeLessThan(3);
    expect(differ).toBeGreaterThan(10);
  });

  test("a rotated phone clip gets the bar along its displayed bottom", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "add-progress-bar-to-video", "tests/fixtures/sample-rotated.mp4");
    const add = page.getByRole("button", { name: "Add progress bar", exact: true });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await add.click();
    await expect(page.getByText("Progress bar added", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    const { path } = await saveDownload(page);
    expect(probe(path).streams[0]).toMatchObject({ width: 360, height: 640 });
    // Medium on a 360 px shorter side: 4 px at the bottom; full white near the end, left half.
    const row = allFrames(path, { x: 0, y: 638, w: 180, h: 1 });
    const last = row[row.length - 1] as Buffer;
    expect(last.reduce((s, v) => s + v, 0) / last.length).toBeGreaterThan(200);
  });

  test("a run cancels within a second and can run again", async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, "add-timer-to-video", "tests/fixtures/sample-large.mp4");
    const add = page.getByRole("button", { name: "Add timer", exact: true });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await add.click();
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeVisible();
    await page.waitForTimeout(500);
    const t0 = Date.now();
    await cancel.click();
    await expect(add).toBeEnabled({ timeout: 5_000 });
    const took = Date.now() - t0;
    process.stdout.write(`cancel to ready: ${took} ms\n`);
    expect(took).toBeLessThan(1500);
    await add.click();
    await expect(cancel).toBeVisible();
    await page.waitForTimeout(800);
    await shootWidths(page, "timer-processing");
    const { path } = await saveDownload(page);
    expect(probe(path).streams[0]?.codec_name).toBe("h264");
  });
});
