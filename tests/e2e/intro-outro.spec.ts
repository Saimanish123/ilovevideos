import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";
import { mean, pixels, probe, saveDownload, shootWidths, trackUploads } from "./overlay-helpers";

/**
 * Add an intro and outro, end to end. The main video is 3 s of flat grey (64) with a 440 Hz tone
 * (tests/fixtures/sample-flat.mp4, 640×360, 30 fps); the intro is a black title card for 3 s; the
 * outro is tests/fixtures/sample-intro.mp4 (480×480 light grey at 25 fps, 1 s, an 880 Hz tone,
 * mono 44.1 kHz). With 0.5 s crossfades: intro 0–2.5, fade 2.5–3, video to 5.5, fade 5–5.5, outro
 * alone 5.5–6. The result is read back: length, constant rate, the picture of each part, the blend
 * in the middle of a fade, and the pitch of the sound in each part. WebCodecs encoding: Chromium.
 */

async function open(page: Page, file = "tests/fixtures/sample-flat.mp4") {
  await page.goto("/add-intro-to-video");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  const add = page.getByRole("button", { name: /^Add (intro|outro|intro and outro)$/ });
  await expect(page.getByText(/A 3 s title card first/)).toBeVisible({
    timeout: 30_000,
  });
  return add;
}

const pick = (page: Page, group: string, name: string) =>
  page
    .getByRole("radiogroup", { name: group })
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();

/** Zero crossings per second of mono 16-bit PCM from `from` for `len` seconds: about 2 × pitch. */
function pitch(path: string, from: number, len: number) {
  const raw = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(from),
    "-t",
    String(len),
    "-i",
    path,
    "-ac",
    "1",
    "-ar",
    "48000",
    "-f",
    "s16le",
    "-",
  ]);
  const s = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  let crossings = 0;
  let energy = 0;
  for (let i = 1; i < s.length; i++) {
    if ((s[i - 1] ?? 0) < 0 !== (s[i] ?? 0) < 0) crossings++;
    energy += (s[i] ?? 0) ** 2;
  }
  return { hz: crossings / 2 / len, rms: Math.sqrt(energy / s.length) };
}

test.describe("add an intro and outro: the page", () => {
  test("renders, a readable file name becomes the title, no axe violations", async ({ page }) => {
    await page.goto("/add-intro-to-video");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Add an intro and outro to a video",
    );
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop the main video; the intro and outro come next",
    );
    await open(page);
    await expect(page.getByLabel("Intro title")).toHaveValue("sample flat");
    await expect(page.getByText(/ · 0:06 · /)).toBeVisible();
    await shootWidths(page, "intro-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await page.getByLabel("Intro title").fill("");
    await expect(
      page.getByText("Type the intro's title, or choose a picture or a clip for it."),
    ).toBeVisible();
    await pick(page, "Intro", "None");
    await expect(page.getByText("Choose an intro, an outro or both.")).toBeVisible();
    await pick(page, "Outro", "Picture");
    await page
      .locator('input[type="file"][accept*="image/png"]')
      .setInputFiles("tests/fixtures/logo.png");
    await expect(page.getByText(/A picture for 3 s last/)).toBeVisible();
    // The button names what will be added: an outro alone here, both once the intro is back.
    await expect(page.getByRole("button", { name: "Add outro", exact: true })).toBeVisible();
    // The title typed before comes back when Title is chosen again.
    await pick(page, "Intro", "Title");
    await expect(page.getByLabel("Intro title")).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Add intro and outro", exact: true }),
    ).toBeVisible();
  });
});

test.describe("add an intro and outro: results", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("title card, video and outro clip join on one grid with crossfades, picture and sound", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    const add = await open(page);
    await page.getByLabel("Intro title").fill("Our trip");
    await pick(page, "Outro", "Clip");
    await page
      .locator('input[type="file"][accept*="video/*"]')
      .last()
      .setInputFiles("tests/fixtures/sample-intro.mp4");
    await expect(page.getByText(/a 1 s clip last/)).toBeVisible();
    await expect(page.getByText(/ · 0:06 · /)).toBeVisible();
    await add.click();
    await expect(page.getByText("Intro and outro added", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await shootWidths(page, "intro-done");
    const { path, name } = await saveDownload(page);
    expect(name).toBe("sample-flat-with-intro.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.streams[1]?.codec_name).toBe("aac");
    expect(Number(p.streams[0]?.nb_read_frames)).toBe(180);
    expect(p.duration).toBeGreaterThan(5.95);
    expect(p.duration).toBeLessThan(6.1);
    const corner = { x: 8, y: 8, w: 16, h: 16 };
    const centre = { x: 300, y: 160, w: 40, h: 40 };
    // Title card: black, with white text across the middle row.
    expect(mean(pixels(path, 1.0, corner))).toBeLessThan(24);
    expect(Math.max(...pixels(path, 1.0, { x: 160, y: 150, w: 320, h: 60 }))).toBeGreaterThan(200);
    // Middle of the first fade (2.75 s): half black, half grey 64.
    const mid = mean(pixels(path, 2.75, corner));
    process.stdout.write(`crossfade midpoint: ${mid.toFixed(1)} (expected about 32 to 40)\n`);
    expect(mid).toBeGreaterThan(22);
    expect(mid).toBeLessThan(50);
    // The video alone at 4 s.
    expect(Math.abs(mean(pixels(path, 4.0, corner)) - 64)).toBeLessThan(6);
    // The outro alone at 5.75 s: 480×480 fitted to 360×360 in the middle, black bars at the sides.
    expect(mean(pixels(path, 5.75, corner))).toBeLessThan(24);
    expect(Math.abs(mean(pixels(path, 5.75, centre)) - 192)).toBeLessThan(8);
    // Sound: silence under the title card, 440 Hz under the video, 880 Hz under the outro.
    const quiet = pitch(path, 0.5, 1.5);
    const main = pitch(path, 3.3, 1.4);
    const end = pitch(path, 5.55, 0.4);
    process.stdout.write(
      `sound: title rms ${quiet.rms.toFixed(0)}, video ${main.hz.toFixed(1)} Hz, outro ${end.hz.toFixed(1)} Hz\n`,
    );
    expect(quiet.rms).toBeLessThan(30);
    expect(Math.abs(main.hz - 440)).toBeLessThan(5);
    expect(Math.abs(end.hz - 880)).toBeLessThan(10);
    expect(uploads).toEqual([]);
  });

  test("a run cancels within a second and can run again", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/add-intro-to-video");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("tests/fixtures/sample-large.mp4");
    const add = page.getByRole("button", { name: /^Add (intro|outro|intro and outro)$/ });
    await page.getByLabel("Intro title").fill("A long one");
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await add.click();
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeVisible();
    await page.waitForTimeout(800);
    const t0 = Date.now();
    await cancel.click();
    await expect(add).toBeEnabled({ timeout: 5_000 });
    const took = Date.now() - t0;
    process.stdout.write(`cancel to ready: ${took} ms\n`);
    expect(took).toBeLessThan(1500);
    await add.click();
    await expect(cancel).toBeVisible();
    await page.waitForTimeout(800);
    await shootWidths(page, "intro-processing");
    const { path } = await saveDownload(page);
    expect(probe(path).streams[0]?.codec_name).toBe("h264");
  });
});
