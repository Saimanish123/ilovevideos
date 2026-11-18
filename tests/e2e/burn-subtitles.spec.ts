import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { type Box, probe, saveDownload, shootWidths, trackUploads } from "./overlay-helpers";

/**
 * Styled burn-in on add subtitles: the looks, the position band, the cue list, short phrases,
 * tracks already inside the video, and right-to-left and non-Latin text. Results are read back
 * frame by frame with the local ffmpeg on a flat grey fixture (tests/fixtures/sample-flat.mp4), so
 * every frame with text can be found and compared with when the cues say it should show, and with
 * FFmpeg's own subtitles filter (libass) on the same file. Encoding needs WebCodecs: runs are
 * Chromium only; the page is checked everywhere.
 */

const fx = (name: string) => `tests/fixtures/subtitles/${name}`;

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

/** Pixels far from the flat grey (64): text, outline or box. */
const ink = (f: Buffer) => f.reduce((n, v) => n + (Math.abs(v - 64) > 40 ? 1 : 0), 0);

/** Frames (at 30 fps) that show text, as [first, last] runs. */
function runs(frames: Buffer[], min = 30): [number, number][] {
  const out: [number, number][] = [];
  frames.forEach((f, i) => {
    if (ink(f) < min) return;
    const last = out[out.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else out.push([i, i]);
  });
  return out;
}

const pick = (page: Page, name: string) =>
  page
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first()
    .click();

async function open(page: Page, video = "tests/fixtures/sample-flat.mp4", subs = fx("timed.srt")) {
  await page.goto("/add-subtitles-to-video");
  await page.locator('input[type="file"]').first().setInputFiles(video);
  const add = page.getByRole("button", { name: "Add subtitles", exact: true });
  await expect(page.getByText("Add the subtitle file first.")).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="file"][accept*=".srt"]').setInputFiles(subs);
  return add;
}

test.describe("burn subtitles in with a look: the page", () => {
  test("looks, the position band and the cue list work from the keyboard; no axe violations", async ({
    page,
  }) => {
    await open(page);
    await pick(page, "Burn in");
    // The cue count is on the file card only; the list waits behind "Cues (2)".
    await expect(page.getByText(/SRT · 2 cues/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Cues" })).toBeHidden();
    const band = page.getByRole("slider", { name: "Subtitle position" });
    // 6% above the bottom edge.
    await expect(band).toHaveAttribute("aria-valuenow", "6");
    await shootWidths(page, "subs-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await band.focus();
    await page.keyboard.press("Shift+ArrowUp");
    await expect(band).toHaveAttribute("aria-valuenow", "11");
    await page.keyboard.press("PageDown");
    await expect(band).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowUp");
    await expect(band).toHaveAttribute("aria-valuenow", "2");
    await expect(
      page.getByLabel("Bottom of the text, in percent of the picture above its bottom edge"),
    ).toHaveValue("2");
    // The cue list jumps the preview into a cue.
    await page.getByText("Cues (2)").click();
    await expect(page.getByRole("list", { name: "Cues" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: /The second cue/ }).click();
    await expect(page.getByText("Cue 2 of 2").first()).toBeVisible();
    await page.getByRole("button", { name: "Previous cue" }).click();
    await expect(page.getByText("Cue 1 of 2").first()).toBeVisible();
    // Bold social: short phrases on, the band moves to the lower third of a landscape picture.
    await pick(page, "Bold social");
    await expect(band).toHaveAttribute("aria-valuenow", "15");
    await expect(page.getByLabel("Short phrases")).toBeChecked();
    await expect(page.getByText(/Bold social · short phrases, estimated timing/)).toBeVisible();
    await expect(page.getByText("Phrases (4)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next phrase" })).toBeVisible();
    await shootWidths(page, "subs-social");
  });

  test("a track already inside the video can be burned in", async ({ page }) => {
    await page.goto("/add-subtitles-to-video");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("tests/fixtures/sample-subs.mkv");
    await expect(page.getByText("Or burn in a subtitle track this video already has:")).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    const tracks = page
      .getByRole("list", { name: /Or burn in a subtitle track/ })
      .getByRole("button");
    expect(await tracks.count()).toBeGreaterThanOrEqual(1);
    await tracks.first().click();
    await expect(page.getByRole("radio", { name: "Burn in" })).toBeChecked();
    await expect(page.getByText(/^Burned in · /)).toBeVisible();
  });

  test("UTF-16 and Windows-1252 files read with their letters", async ({ page }) => {
    await open(page, "tests/fixtures/sample.mp4", fx("utf16.srt"));
    await expect(page.getByText(/SRT · \d+ cues?/)).toBeVisible();
    await page.getByRole("button", { name: "Remove utf16.srt" }).click();
    await page.locator('input[type="file"][accept*=".srt"]').setInputFiles(fx("windows-1252.srt"));
    await expect(page.getByText(/SRT · \d+ cues?/)).toBeVisible();
  });
});

test.describe("burn subtitles in with a look: results", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("cues show on exactly their frames, where the band put them, like libass", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    const add = await open(page);
    await pick(page, "Burn in");
    await pick(page, "Boxed");
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByText("Subtitles burned in", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await shootWidths(page, "subs-done");
    const { path } = await saveDownload(page);
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.streams[1]?.codec_name).toBe("aac");
    // The lower half of the picture, every frame.
    const box = { x: 0, y: 180, w: 640, h: 180 };
    const ours = runs(allFrames(path, box));
    // Cue 1: 0.5–1.5 s = frames 15–44; cue 2: 2.0–2.8 s = frames 60–83.
    process.stdout.write(`burned frames: ${JSON.stringify(ours)}\n`);
    expect(ours).toEqual([
      [15, 44],
      [60, 83],
    ]);
    // FFmpeg's subtitles filter (libass) on the same file gives the same frames; only where the
    // local ffmpeg was built with libass (the frames above are the rule libass follows: a frame
    // shows a cue when its time is inside the cue).
    const filters = execFileSync("ffmpeg", ["-hide_banner", "-filters"]).toString();
    if (/\ssubtitles\s/.test(filters)) {
      const ref = `${path}.libass.mp4`;
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        "tests/fixtures/sample-flat.mp4",
        "-vf",
        `subtitles=filename=${fx("timed.srt")}`,
        "-c:v",
        "libx264",
        "-an",
        ref,
      ]);
      const theirs = runs(allFrames(ref, box));
      process.stdout.write(`libass frames: ${JSON.stringify(theirs)}\n`);
      expect(ours).toEqual(theirs);
    } else process.stdout.write("local ffmpeg has no libass: compared with the cue times only\n");
    // Where the text sits: the box's bottom edge on the band (94% of 360 = 338) within a few px.
    const f = allFrames(path, { x: 0, y: 0, w: 640, h: 360 })[30] as Buffer;
    let bottom = 0;
    let top = 360;
    for (let y = 0; y < 360; y++)
      for (let x = 0; x < 640; x++)
        if (Math.abs((f[y * 640 + x] ?? 64) - 64) > 20) {
          bottom = Math.max(bottom, y);
          top = Math.min(top, y);
        }
    process.stdout.write(`cue 1 box rows ${top}–${bottom}\n`);
    expect(Math.abs(bottom - 338)).toBeLessThanOrEqual(6);
    expect(uploads).toEqual([]);
  });

  test("right-to-left and non-Latin scripts are drawn, not as empty boxes", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/add-subtitles-to-video");
    // Coverage of the font stack the renderer uses, on this machine: each script's text drawn on a
    // canvas against the same text in a code point no font has (the missing-glyph box).
    const coverage = await page.evaluate(() => {
      const stack = 'Geist, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
      const draw = (s: string) => {
        const c = new OffscreenCanvas(400, 60);
        const x = c.getContext("2d");
        if (!x) return "";
        x.font = `40px ${stack}`;
        x.fillText(s, 4, 44);
        return Array.from(x.getImageData(0, 0, 400, 60).data.filter((_, i) => i % 4 === 3)).join(
          ",",
        );
      };
      const tofu = draw("\u{10FFFD}");
      const samples: Record<string, string> = {
        Arabic: "م",
        Hebrew: "ש",
        Chinese: "你",
        Japanese: "こ",
        Korean: "안",
        Devanagari: "न",
        Thai: "ส",
        Greek: "Γ",
        Cyrillic: "П",
        Vietnamese: "ế",
      };
      return Object.fromEntries(Object.entries(samples).map(([k, s]) => [k, draw(s) !== tofu]));
    });
    process.stdout.write(`script coverage here: ${JSON.stringify(coverage)}\n`);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("tests/fixtures/sample-flat.mp4");
    await page.locator('input[type="file"][accept*=".srt"]').setInputFiles(fx("scripts.srt"));
    await expect(page.getByText(/SRT · 10 cues/)).toBeVisible();
    await pick(page, "Burn in");
    const add = page.getByRole("button", { name: "Add subtitles", exact: true });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await add.click();
    await expect(page.getByText("Subtitles burned in", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    const { path } = await saveDownload(page);
    const frames = allFrames(path, { x: 0, y: 260, w: 640, h: 100 });
    // Each script's cue (0.3 s each) has text in its middle frame.
    for (let k = 0; k < 10; k++) {
      const f = frames[k * 9 + 4] as Buffer;
      expect(ink(f), `cue ${k + 1}`).toBeGreaterThan(200);
    }
    for (const [script, ok] of Object.entries(coverage)) expect(ok, script).toBe(true);
  });
});
