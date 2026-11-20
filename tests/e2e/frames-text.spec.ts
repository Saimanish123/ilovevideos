import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Frames, stills, slideshows, metadata and text, end to end in the browser: contact sheet, image
 * sequence, images to video, audio to video, edit metadata, extract subtitles and add text. Each
 * test drives the page's own primary control, runs the real engine, and reads the output back
 * (ffprobe and ffmpeg are test-only tools on the machine running the tests). Engine runs need
 * WebCodecs encoders and are Chromium only; the idle pages are checked on every project.
 * Set FRAMES_SHOTS=<dir> for 390 and 1280 screenshots of each ready state.
 */
const shots = process.env.FRAMES_SHOTS;
const F = "tests/fixtures/";

async function shot(page: Page, name: string, focus?: Locator) {
  if (!shots) return;
  const size = page.viewportSize();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    if (focus) await focus.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, `${name}-${width}.png`), fullPage: true });
  }
  if (size) await page.setViewportSize(size);
}

const axeClean = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .include('section[aria-label="Workspace"]')
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ""}`)).toEqual([]);
};

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

const pick = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true }).locator("xpath=..").click();

/** Saves the blob behind a download link to a temporary file for ffprobe. */
async function save(
  page: Page,
  link: Locator,
): Promise<{ path: string; name: string; type: string }> {
  await expect(link).toBeVisible({ timeout: 240_000 });
  const href = await link.getAttribute("href");
  const name = (await link.getAttribute("download")) ?? "out";
  const { b64, type } = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    const b64 = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
    return { b64, type: blob.type };
  }, href);
  const path = join(mkdtempSync(join(tmpdir(), "frames-text-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return { path, name, type };
}

interface Probe {
  streams: {
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    duration?: string;
  }[];
  format: { duration?: string; tags?: Record<string, string> };
}
const probe = (path: string): Probe =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      path,
    ]).toString(),
  );
const md5 = (path: string, map: string) =>
  execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", map, "-c", "copy", "-f", "md5", "-"])
    .toString()
    .trim();

/** MD5 of the decoded frame at `t` seconds. */
const frameMd5 = (path: string, t: number) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(t),
    "-i",
    path,
    "-frames:v",
    "1",
    "-f",
    "md5",
    "-",
  ])
    .toString()
    .trim();

/** Mean brightness (0–255) of a box of the frame at `t` seconds. */
function brightness(path: string, t: number, box: { x: number; y: number; w: number; h: number }) {
  const raw = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(t),
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    `crop=${box.w}:${box.h}:${box.x}:${box.y}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ]);
  return raw.reduce((s, v) => s + v, 0) / raw.length;
}

test.describe("idle pages", () => {
  for (const [slug, h1, prompt] of [
    [
      "video-contact-sheet",
      "Make a contact sheet from a video",
      "Drop a video to lay its frames out on one sheet",
    ],
    [
      "video-to-image-sequence",
      "Convert video to an image sequence",
      "Drop a video to turn it into numbered images",
    ],
    ["images-to-video", "Make a video from images", "Drop photos or images to make a slideshow"],
    ["audio-to-video", "Turn audio into a video", "Drop an audio file to turn it into a video"],
    [
      "edit-video-metadata",
      "Edit video metadata",
      "Drop a video or audio file to edit its title, artist, date and cover",
    ],
    [
      "extract-subtitles-from-video",
      "Extract subtitles from video",
      "Drop an MKV, MP4, MOV or WebM video to take its subtitles out",
    ],
    ["add-text-to-video", "Add text to video", "Drop a video to put a title or caption on it"],
  ] as const) {
    test(`${slug} renders its idle state with no axe violations`, async ({ page }) => {
      await page.goto(`/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
      await expect(page.getByRole("region", { name: "Workspace" })).toContainText(prompt);
      await axeClean(page);
      await shot(page, `${slug}-idle`);
    });
  }
});

test.describe("frames and stills", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "WebCodecs decoding and encoding need Chromium",
  );

  test("contact sheet: live preview, 3×3 grid, a 1920-wide JPG with the computed height", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/video-contact-sheet");
    await page.locator('input[type="file"]').setInputFiles(`${F}sample.mp4`);
    const make = page.getByRole("button", { name: "Make contact sheet", exact: true });
    await expect(make).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByRole("img", {
        name: /Preview of the contact sheet: 4 by 4 frames with timestamps/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/^16 frames, one every 0\.19\ss, on a 1920×1200 JPG\./),
    ).toBeVisible();
    await pick(page, "3×3");
    await expect(
      page.getByText(/^9 frames, one every 0\.33\ss, on a 1920×1195 JPG\./),
    ).toBeVisible();
    await expect(
      page.getByText("Preview of the sheet. The frames are the ones it will hold."),
    ).toBeVisible({ timeout: 20_000 });
    await axeClean(page);
    await shot(page, "contact-sheet-ready");
    await make.click();
    const out = await save(page, page.getByRole("link", { name: "Download", exact: true }));
    expect(out.name).toBe("sample-contact-sheet.jpg");
    expect(out.type).toBe("image/jpeg");
    const p = probe(out.path);
    expect(p.streams[0]).toMatchObject({ codec_name: "mjpeg", width: 1920, height: 1195 });
    await expect(page.getByText(/^Contact sheet: 9 frames on 1920×1195/)).toBeVisible();
    await expect(page.getByRole("img", { name: "The contact sheet, 3 by 3 frames" })).toBeVisible();
    await expect(page.locator("[data-ffmpeg-command]")).toHaveAttribute(
      "data-ffmpeg-command",
      /tile=3x3/,
    );
    await shot(page, "contact-sheet-done");
    expect(uploads).toEqual([]);
  });

  test("image sequence: ticks on the timeline, one image per second, numbered JPGs in a ZIP", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/video-to-image-sequence");
    await page.locator('input[type="file"]').setInputFiles(`${F}sample.mp4`);
    const run = page.getByRole("button", { name: "Extract images", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByText(
        /^3\simages, every second from 0:00\.00 to 0:03\.00: 640×360 JPG at quality 92/,
      ),
    ).toBeVisible();
    await expect(page.getByTestId("keyframe-tick")).toHaveCount(3);
    await pick(page, "Every 10th frame");
    await expect(page.getByTestId("keyframe-tick")).toHaveCount(9);
    await expect(page.getByText(/^9\simages, every 10th frame/)).toBeVisible();
    await pick(page, "Every second");
    // The start handle is a slider: one second on with Shift and the arrow key.
    const start = page.getByRole("slider", { name: "Start" });
    await start.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByText(/^2\simages, every second from 0:01\.00/)).toBeVisible();
    await axeClean(page);
    await shot(page, "image-sequence-ready");
    await run.click();
    const zip = page.getByRole("link", { name: "Download all (ZIP)" });
    await expect(zip).toBeVisible({ timeout: 120_000 });
    await expect(zip).toHaveAttribute("download", "sample-frames.zip");
    await expect(page.getByRole("link", { name: "Download sample-0001.jpg" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download sample-0002.jpg" })).toBeVisible();
    const first = await save(page, page.getByRole("link", { name: "Download sample-0001.jpg" }));
    expect(probe(first.path).streams[0]).toMatchObject({
      codec_name: "mjpeg",
      width: 640,
      height: 360,
    });
    await expect(page.getByText(/^2\simages: 640×360 JPG/)).toBeVisible();
    await shot(page, "image-sequence-done");
  });
});

test.describe("slideshow and audio to video", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("images to video: order by keyboard, 2 s each, a 6 s silent 1920×1080 H.264 MP4", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await page.goto("/images-to-video");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles([`${F}slide-1.jpg`, `${F}slide-2.png`, `${F}slide-3.gif`]);
    const make = page.getByRole("button", { name: "Make slideshow", exact: true });
    await expect(make).toBeEnabled({ timeout: 30_000 });
    const list = page.getByRole("list", { name: "Images in order" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("listitem").first()).toContainText("800×600");
    // Keyboard reorder: the first image's handle, one place down.
    await page.getByRole("button", { name: /^Image 1, slide-1\.jpg/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(list.getByRole("listitem").first()).toContainText("slide-2.png");
    await pick(page, "2 s");
    await expect(
      page.getByText(
        /^3\simages, 2\ss each with a 0\.6\ss crossfade: 0:06 of 1920×1080 video at 30\sfps\. No sound\./,
      ),
    ).toBeVisible();
    await axeClean(page);
    await shot(page, "images-to-video-ready");
    await make.click();
    const out = await save(page, page.getByRole("link", { name: "Download", exact: true }));
    expect(out.name).toBe("slideshow.mp4");
    const p = probe(out.path);
    const v = p.streams.find((s) => s.codec_type === "video");
    expect(v).toMatchObject({ codec_name: "h264", width: 1920, height: 1080 });
    expect(p.streams.some((s) => s.codec_type === "audio")).toBe(false);
    expect(Number(p.format.duration)).toBeCloseTo(6, 1);
    // One picture per 2 s slot, each a different image (no slot repeats or is blank).
    const frames = [1, 3, 5].map((t) => frameMd5(out.path, t));
    expect(new Set(frames).size).toBe(3);
    await expect(page.getByText(/^Slideshow made: 0:06, 1920×1080/)).toBeVisible();
    await shot(page, "images-to-video-done");
    expect(uploads).toEqual([]);
  });

  test("images to video with music fitted: as long as the music, AAC copied", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/images-to-video");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles([`${F}slide-1.jpg`, `${F}slide-2.png`]);
    const make = page.getByRole("button", { name: "Make slideshow", exact: true });
    await expect(make).toBeEnabled({ timeout: 30_000 });
    await page.locator('input[type="file"][accept="audio/*"]').setInputFiles(`${F}sample.m4a`);
    await expect(page.getByText("sample.m4a", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Fit the slideshow to the music").check();
    await expect(
      page.getByText(
        /^2\simages, 2\ss each .*: 0:04 of 1920×1080 video .* sample\.m4a plays to the end\./,
      ),
    ).toBeVisible();
    await make.click();
    const out = await save(page, page.getByRole("link", { name: "Download", exact: true }));
    const p = probe(out.path);
    const a = p.streams.find((s) => s.codec_type === "audio");
    expect(a?.codec_name).toBe("aac");
    expect(Number(p.format.duration)).toBeCloseTo(4, 1);
    // The music was copied packet for packet.
    expect(md5(out.path, "0:a")).toBe(md5(`${F}sample.m4a`, "0:a"));
  });

  test("audio to video: a title card over an MP3, 1 fps H.264 and AAC at the sound's length", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await page.goto("/audio-to-video");
    await page.locator('input[type="file"]').first().setInputFiles(`${F}sample.mp3`);
    const make = page.getByRole("button", { name: "Make video", exact: true });
    await expect(make).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByRole("img", { name: "The picture the video will show, 1920×1080" }),
    ).toBeVisible();
    await expect(page.locator("#still-title")).toHaveValue("Two tones");
    await expect(page.locator("#still-line")).toHaveValue("Test signal");
    await expect(
      page.getByText(/The sound is encoded once to AAC at 192\skbps\./).first(),
    ).toBeVisible();
    await pick(page, "Square");
    await axeClean(page);
    await shot(page, "audio-to-video-ready");
    await make.click();
    const out = await save(page, page.getByRole("link", { name: "Download", exact: true }));
    expect(out.name).toBe("sample.mp4");
    const p = probe(out.path);
    expect(p.streams.find((s) => s.codec_type === "video")).toMatchObject({
      codec_name: "h264",
      width: 1080,
      height: 1080,
      r_frame_rate: "1/1",
    });
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    expect(Number(p.format.duration)).toBeCloseTo(4, 1);
    await expect(page.getByText(/^Video made: 0:04 at 1080×1080/)).toBeVisible();
    await shot(page, "audio-to-video-done");
    expect(uploads).toEqual([]);
  });

  test("audio to video: an M4A's AAC is copied as it is, with a picked image", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/audio-to-video");
    await page.locator('input[type="file"]').first().setInputFiles(`${F}sample.m4a`);
    const make = page.getByRole("button", { name: "Make video", exact: true });
    await expect(make).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByText(/The AAC sound is copied as it is, not re-encoded\./).first(),
    ).toBeVisible();
    await pick(page, "Image");
    await expect(make).toBeDisabled();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(`${F}slide-1.jpg`);
    await expect(page.getByText("slide-1.jpg")).toBeVisible();
    await expect(make).toBeEnabled();
    await make.click();
    const out = await save(page, page.getByRole("link", { name: "Download", exact: true }));
    expect(md5(out.path, "0:a")).toBe(md5(`${F}sample.m4a`, "0:a"));
    expect(probe(out.path).streams.find((s) => s.codec_type === "video")).toMatchObject({
      width: 1920,
      height: 1080,
    });
  });
});

test.describe("metadata and subtitles", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Engine runs are checked in Chromium");

  test("edit metadata: new title and artist, location and capture time kept, streams untouched", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/edit-video-metadata");
    await page.locator('input[type="file"]').first().setInputFiles(`${F}sample-tagged.mp4`);
    const save_ = page.getByRole("button", { name: "Save tags", exact: true });
    await expect(page.getByTestId("tags-before")).toContainText("Holiday clip", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("tags-before")).toContainText("Location (GPS)");
    await expect(save_).toBeDisabled();
    await expect(page.getByText("Change a field or the cover to write a new copy.")).toBeVisible();
    await page.locator("#tag-title").fill("Beach day");
    await page.locator("#tag-artist").fill("Sam");
    await expect(page.getByTestId("tags-before")).toContainText("Beach day");
    await expect(
      page.getByText(/^New title and artist\. Only the tag block is rewritten/),
    ).toBeVisible();
    await axeClean(page);
    await shot(page, "edit-metadata-ready");
    // Keyboard path to the primary action.
    await save_.focus();
    await page.keyboard.press("Enter");
    const out = await save(page, page.getByRole("link", { name: "Download", exact: true }));
    expect(out.name).toBe("sample-tagged.mp4");
    const tags = probe(out.path).format.tags ?? {};
    expect(tags.title).toBe("Beach day");
    expect(tags.artist).toBe("Sam");
    expect(tags.location).toBe("+48.8584+002.2945/");
    expect(tags.creation_time).toBe("2026-08-01T10:00:00.000000Z");
    expect(md5(out.path, "0:v")).toBe(md5(`${F}sample-tagged.mp4`, "0:v"));
    await expect(page.getByTestId("tags-after")).toContainText("Beach day");
    await shot(page, "edit-metadata-done");
  });

  test("extract subtitles: tracks listed with language, two files in a ZIP, one as SRT", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/extract-subtitles-from-video");
    await page.locator('input[type="file"]').first().setInputFiles(`${F}sample-subs.mkv`);
    const run = page.getByRole("button", { name: "Extract subtitles", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByLabel("English")).toBeChecked();
    await expect(page.getByLabel("French (forced)")).toBeChecked();
    await expect(
      page.getByText(
        /^Writes 2 files: English \(SRT\), French \(forced\) \(ASS → SRT: styles and positions dropped\)\./,
      ),
    ).toBeVisible();
    await axeClean(page);
    await shot(page, "extract-subtitles-ready");
    await run.click();
    const zip = page.getByRole("link", { name: "Download all (ZIP)" });
    await expect(zip).toBeVisible({ timeout: 60_000 });
    await expect(zip).toHaveAttribute("download", "sample-subs-subtitles.zip");
    const en = await save(page, page.getByRole("link", { name: "Download sample-subs.en.srt" }));
    expect(execFileSync("cat", [en.path]).toString()).toContain("First line of the test clip");
    await expect(page.getByText("2 subtitle tracks extracted")).toBeVisible();
    await shot(page, "extract-subtitles-done");
    // One track only: a single file, handed on to the converter.
    await page.getByRole("button", { name: "Start over" }).click();
    await page.locator('input[type="file"]').first().setInputFiles(`${F}sample-subs.mkv`);
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel("French (forced)").uncheck();
    await pick(page, "Original");
    await run.click();
    const single = page.getByRole("link", { name: "Download", exact: true });
    await expect(single).toHaveAttribute("download", "sample-subs.en.srt", { timeout: 60_000 });
    await expect(
      page.getByRole("link", { name: /Convert the subtitles to another format/ }),
    ).toBeVisible();
  });

  test("extract subtitles: a video without subtitle tracks says so", async ({ page }) => {
    await page.goto("/extract-subtitles-from-video");
    await page.locator('input[type="file"]').first().setInputFiles(`${F}sample.mp4`);
    await expect(
      page.getByText(
        "This video has no subtitle track. Subtitles drawn into the picture are part of the video and cannot be taken out as text.",
      ),
    ).toBeVisible({ timeout: 30_000 });
    // Nothing on the page can add a subtitle track: no dead button (ADR-0141).
    await expect(page.getByRole("button", { name: "Extract subtitles", exact: true })).toHaveCount(
      0,
    );
  });
});

test.describe("add text", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("text at the top left for the whole clip: drawn into the picture, sound copied", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await page.goto("/add-text-to-video");
    await page.locator('input[type="file"]').first().setInputFiles(`${F}sample.mp4`);
    const add = page.getByRole("button", { name: "Add text", exact: true });
    await expect(add).toBeDisabled({ timeout: 30_000 });
    await expect(page.getByText("Type the text first.")).toBeVisible();
    await page.locator("#overlay-text").fill("HELLO");
    await pick(page, "Box");
    await page.getByRole("radio", { name: "Top left" }).check({ force: true });
    const mark = page.getByRole("group", { name: /^Text: \d+×\d+ at/ });
    await expect(mark).toBeVisible();
    await expect(mark.locator("img")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/^Text top left, for the whole video, fading in and out over 0\.5\ss\./),
    ).toBeVisible();
    await axeClean(page);
    await shot(page, "add-text-ready");
    await add.click();
    const out = await save(page, page.getByRole("link", { name: "Download", exact: true }));
    expect(out.name).toBe("sample-text.mp4");
    const p = probe(out.path);
    expect(p.streams.find((s) => s.codec_type === "video")).toMatchObject({
      codec_name: "h264",
      width: 640,
      height: 360,
    });
    expect(Number(p.format.duration)).toBeCloseTo(3, 1);
    expect(md5(out.path, "0:a")).toBe(md5(`${F}sample.mp4`, "0:a"));
    // The dark box's bottom padding (below the letters) at 1.5 s. Its top padding overlaps the
    // fixture's own dark timecode panel (0 to 37 px down), which leaves little to darken.
    const box = { x: 30, y: 56, w: 60, h: 4 };
    expect(brightness(`${F}sample.mp4`, 1.5, box) - brightness(out.path, 1.5, box)).toBeGreaterThan(
      20,
    );
    await expect(page.getByText(/^Text added: 640×360, sound copied/)).toBeVisible();
    await shot(page, "add-text-done");
    expect(uploads).toEqual([]);
  });
});
