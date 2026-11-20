import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Builder F pages (frames, stills and files): animated WebP, APNG and AVIF from video. Each test runs
 * the real engine on a fixture and checks the file with ffprobe, plus axe, the keyboard path to
 * Download and cancel. WebKit runs them where its WebCodecs build can (Playwright's WebKit 26 has a
 * VP8 and an AV1 encoder); a browser without the encoder is checked for its blocked reason instead.
 */

const fx = (name: string) => `tests/fixtures/${name}`;

const axeClean = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .include('section[aria-label="Workspace"]')
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ""}`)).toEqual([]);
};

/** The result blob behind the Download link, saved to a temp file for ffprobe. */
async function saveResult(page: Page, name: string) {
  const href = await page.getByRole("link", { name: "Download", exact: true }).getAttribute("href");
  const b64 = await page.evaluate(async (u) => {
    const b = new Uint8Array(await (await fetch(u ?? "")).arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000)
      s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  }, href);
  const dir = mkdtempSync(join(tmpdir(), "frames-files-"));
  const path = join(dir, name);
  const bytes = Buffer.from(b64, "base64");
  writeFileSync(path, bytes);
  return { path, bytes };
}

interface Stream {
  index: number;
  codec_name: string;
  width: number;
  height: number;
  nb_read_frames?: string;
}
const ffprobe = (path: string): Stream[] =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=index,codec_name,width,height,nb_read_frames",
      "-of",
      "json",
      path,
    ]).toString(),
  ).streams;

/** Whether the primary button becomes enabled (the encoder check runs after the file is read). */
const enabled = (button: ReturnType<Page["getByRole"]>) =>
  expect(button)
    .toBeEnabled({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );

/** Presses Tab until the focused element has this accessible name (the keyboard path). */
async function tabTo(page: Page, name: RegExp) {
  // WebKit moves Tab between fields and links only; Option+Tab reaches every control, as in Safari.
  const key = page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press(key);
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return (el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim();
    });
    if (name.test(focused)) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

const cases = [
  {
    slug: "video-to-webp",
    h1: "Make an animated WebP from video",
    action: "Make WebP",
    ext: "webp",
    magic: (b: Buffer) =>
      b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
    codec: "webp_anim",
  },
  {
    slug: "video-to-apng",
    h1: "Make an animated PNG from video",
    action: "Make APNG",
    ext: "png",
    magic: (b: Buffer) => b[0] === 0x89 && b.subarray(1, 4).toString() === "PNG",
    codec: "apng",
  },
  {
    slug: "video-to-avif",
    h1: "Make an animated AVIF from video",
    action: "Make AVIF",
    ext: "avif",
    magic: (b: Buffer) => b.subarray(4, 12).toString() === "ftypavis",
    codec: "av1",
  },
] as const;

for (const c of cases) {
  test.describe(c.slug, () => {
    test("makes the animation on the device: keyboard path, axe, real output", async ({ page }) => {
      test.setTimeout(150_000);
      const uploads: number[] = [];
      page.on("request", (req) => {
        const body = req.postData();
        if (body && body.length > 1024) uploads.push(body.length);
      });
      await page.goto(`/${c.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.h1);
      await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
      await expect(page.getByTestId("animation-estimate")).toBeVisible({ timeout: 30_000 });
      const button = page.getByRole("button", { name: c.action, exact: true });
      const canEncode = await enabled(button);
      if (!canEncode) {
        // A browser without the encoder says why instead of failing later.
        await expect(
          page.getByRole("region", { name: "Workspace" }).getByText(/cannot encode|no AV1 encoder/),
        ).toBeVisible();
        test.skip(true, "This browser has no encoder for the format");
      }
      // Two seconds at 10 fps, 360 px: 20 frames.
      await page.locator("#end").fill("2");
      await page.locator("#end").press("Enter");
      await page.getByRole("radio", { name: "10", exact: true }).check({ force: true });
      await page.getByRole("combobox").click();
      await page.getByRole("option", { name: /360\spx wide/ }).click();
      await expect(page.getByTestId("animation-estimate")).toContainText(
        /20\sframes, 2\.0\ss at 10\sfps, 360×20[24]/,
      );
      await axeClean(page);
      await tabTo(page, new RegExp(`^${c.action}$`));
      await page.keyboard.press("Enter");
      const download = page.getByRole("link", { name: "Download", exact: true });
      await expect(download).toBeVisible({ timeout: 120_000 });
      await expect(download).toHaveAttribute("download", `sample.${c.ext}`);
      await tabTo(page, /^Download$/);
      const saved = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      expect((await saved).suggestedFilename()).toBe(`sample.${c.ext}`);

      const { path, bytes } = await saveResult(page, `out.${c.ext}`);
      expect(c.magic(bytes)).toBe(true);
      const streams = ffprobe(path);
      // AVIF: the still item (one frame) and the sequence track; the others have one stream.
      const anim = streams.find((s) => Number(s.nb_read_frames) > 1) ?? streams[0];
      expect(anim?.codec_name).toBe(c.codec);
      expect(anim?.width).toBe(360);
      // Frames that did not change are folded into the one before (WebP, APNG), so at most 20.
      const frames = Number(anim?.nb_read_frames);
      expect(frames).toBeGreaterThan(c.ext === "avif" ? 19 : 2);
      expect(frames).toBeLessThanOrEqual(20);
      const preview = page.getByTestId("result-preview");
      await expect
        .poll(() => preview.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBe(360);
      await expect(page.getByRole("button", { name: "Pause the animation" })).toBeVisible();
      expect(uploads, "no request carried a body over 1 KB").toEqual([]);
    });

    test("Escape cancels a run and returns to ready", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/${c.slug}`);
      await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
      const button = page.getByRole("button", { name: c.action, exact: true });
      await expect(page.getByTestId("animation-estimate")).toBeVisible({ timeout: 30_000 });
      test.skip(!(await enabled(button)), "No encoder");
      await page.getByRole("radio", { name: "30", exact: true }).check({ force: true });
      await page.getByRole("combobox").click();
      await page.getByRole("option", { name: /^Keep/ }).click();
      await button.click();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(button).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(0);
    });
  });
}

test("an audio-only file is refused on the animated WebP page", async ({ page }) => {
  await page.goto("/video-to-webp");
  await page.locator('input[type="file"]').setInputFiles(fx("sample.m4a"));
  await expect(page.getByText(/no video track to turn into an animated WebP/)).toBeVisible({
    timeout: 30_000,
  });
});

test.describe("sharpest-frame-from-video", () => {
  test("finds the one sharp frame among blurred ones; keyboard path; axe", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/sharpest-frame-from-video");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Get the sharpest frame from a video",
    );
    await page.locator('input[type="file"]').setInputFiles(fx("sample-blur.mp4"));
    const button = page.getByRole("button", { name: "Find sharpest frame", exact: true });
    test.skip(!(await enabled(button)), "No WebCodecs decoder here");
    await expect(page.getByText(/90\sframes scored · best saved as PNG 640×360/)).toBeVisible();
    await axeClean(page);
    await tabTo(page, /^Find sharpest frame$/);
    await page.keyboard.press("Enter");
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 60_000 });
    // Frame 47 of 30 fps is the only unblurred one (scripts/make-fixtures.sh).
    await expect(download).toHaveAttribute("download", "sample-blur-0m01s57.png");
    await expect(page.getByText(/frame at 0:01\.57 · sharpest of 90/)).toBeVisible();
    const { path } = await saveResult(page, "sharp.png");
    const s = ffprobe(path)[0];
    expect([s?.codec_name, s?.width, s?.height]).toEqual(["png", 640, 360]);
    await tabTo(page, /^Download$/);
  });
});

test.describe("change-video-creation-date", () => {
  test("shifts the recording date one hour earlier and reads it back", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/change-video-creation-date");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Change a video's creation date",
    );
    await page.locator('input[type="file"]').setInputFiles(fx("sample-dated.mov"));
    await expect(page.getByTestId("recorded-now")).toContainText("1 Jun 2023, 12:34:56 UTC+2", {
      timeout: 30_000,
    });
    const button = page.getByRole("button", { name: "Change date", exact: true });
    await expect(button).toBeDisabled();
    // The form starts at the file's own date once the panel has read it.
    await expect(page.locator("#date-local")).toHaveValue("2023-06-01T12:34:56");
    // The visible segment, as a finger would tap it (a forced click on the hidden input can land on
    // the phone's sticky action bar).
    await page.locator("label", { hasText: "Shift by" }).click();
    await page.locator("label", { hasText: "Earlier" }).click();
    await expect(page.getByRole("radio", { name: "Earlier" })).toBeChecked();
    // Minutes roll over into hours when committed: 90 min is 1 h 30 min.
    await page.locator("#shift-m").fill("90");
    await page.locator("#shift-m").press("Enter");
    await expect(page.locator("#shift-h")).toHaveValue("1");
    await expect(page.locator("#shift-m")).toHaveValue("30");
    await expect(page.getByTestId("recorded-after")).toContainText("1 Jun 2023, 11:04:56 UTC+2");
    await page.locator("#shift-m").fill("0");
    await page.locator("#shift-m").press("Enter");
    await expect(page.getByTestId("recorded-after")).toContainText("1 Jun 2023, 11:34:56 UTC+2");
    await axeClean(page);
    await button.click();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("recorded-now")).toContainText("1 Jun 2023, 11:34:56 UTC+2");
    const { path } = await saveResult(page, "dated.mov");
    const tags = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format_tags:stream_tags=creation_time",
        "-of",
        "json",
        path,
      ]).toString(),
    );
    expect(tags.format.tags["com.apple.quicktime.creationdate"]).toBe("2023-06-01T11:34:56+0200");
    expect(tags.streams[0].tags.creation_time).toBe("2023-06-01T09:34:56.000000Z");
  });

  test("sets a date and time zone", async ({ page }) => {
    await page.goto("/change-video-creation-date");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    await expect(page.getByTestId("recorded-now")).toBeVisible({ timeout: 30_000 });
    await page.locator("#date-local").fill("2019-12-25T08:30");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "UTC−5", exact: true }).click();
    await expect(page.getByTestId("recorded-after")).toContainText("25 Dec 2019, 08:30:00 UTC−5");
    await page.getByRole("button", { name: "Change date", exact: true }).click();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const { path } = await saveResult(page, "set.mp4");
    const tags = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format_tags=creation_time",
        "-of",
        "json",
        path,
      ]).toString(),
    );
    expect(tags.format.tags.creation_time).toBe("2019-12-25T13:30:00.000000Z");
  });

  test("an MKV is refused with a way forward", async ({ page }) => {
    await page.goto("/change-video-creation-date");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mkv"));
    await expect(page.getByText(/Only MP4 and MOV files carry a recording date/)).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("repair-video", () => {
  test("recovers the complete part of a cut-off MP4; axe; decodes cleanly", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/repair-video");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Repair a video file");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-cut.mp4"));
    await expect(page.getByTestId("diagnosis-title")).toContainText("Stops early", {
      timeout: 30_000,
    });
    await expect(page.getByText(/2\.4\ss of 4\.0\ss can be saved/)).toBeVisible();
    await axeClean(page);
    await page.getByRole("button", { name: "Repair", exact: true }).click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/2\.4\ss of 4\.0\ss saved · nothing re-encoded/)).toBeVisible();
    const { path } = await saveResult(page, "fixed.mp4");
    const errors = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"], {
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    expect(errors).toBe("");
    expect(ffprobe(path).map((s) => s.codec_name)).toEqual(["h264", "aac"]);
  });

  test("a cut-off MKV and a fragmented MP4 are repaired; a file without an index is explained", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    for (const [name, title] of [
      ["sample-cut.mkv", /never finished/],
      ["sample-frag-cut.mp4", /last part is cut off/],
    ] as const) {
      await page.goto("/repair-video");
      await page.locator('input[type="file"]').setInputFiles(fx(name));
      await expect(page.getByTestId("diagnosis-title")).toContainText(title, { timeout: 30_000 });
      await page.getByRole("button", { name: "Repair", exact: true }).click();
      await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
        timeout: 30_000,
      });
    }
    await page.goto("/repair-video");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-nomoov.mp4"));
    await expect(page.getByTestId("diagnosis-title")).toHaveText("Cannot be repaired here", {
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Repair", exact: true })).toBeDisabled();
  });
});

test.describe("video-thumbnail-maker", () => {
  test("suggests frames from both scenes, skips black, makes a 16:9 JPG; axe; keyboard", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/video-thumbnail-maker");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Make a thumbnail from a video",
    );
    await page.locator('input[type="file"]').setInputFiles(fx("sample-fade.mp4"));
    const button = page.getByRole("button", { name: "Make thumbnail", exact: true });
    test.skip(!(await enabled(button)), "No WebCodecs decoder here");
    const tiles = page.getByTestId("suggestions").getByRole("button");
    await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
    const times = await tiles.evaluateAll((els) =>
      els.map((e) => {
        const m = (e.getAttribute("aria-label") ?? "").match(/(\d+):(\d+)(?:\.(\d+))?/);
        return m ? Number(m[1]) * 60 + Number(m[2]) + Number(`0.${m[3] ?? 0}`) : -1;
      }),
    );
    // Nothing from the 1.5 s of black; something from the pattern (1.5–4 s) and the bars (4–6 s).
    expect(times.every((t) => t >= 1.5)).toBe(true);
    expect(times.some((t) => t < 4)).toBe(true);
    expect(times.some((t) => t >= 4)).toBe(true);
    await expect(page.getByText(/JPG 320×180 · from 320×180$/)).toBeVisible();
    await axeClean(page);
    await tabTo(page, /^Make thumbnail$/);
    await page.keyboard.press("Enter");
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 60_000 });
    const { path } = await saveResult(page, "thumb.jpg");
    const s = ffprobe(path)[0];
    expect([s?.codec_name, s?.width, s?.height]).toEqual(["mjpeg", 320, 180]);
  });

  test("a square crop at crop size", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/video-thumbnail-maker");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    const button = page.getByRole("button", { name: "Make thumbnail", exact: true });
    test.skip(!(await enabled(button)), "No WebCodecs decoder here");
    await page.locator("label", { hasText: "1:1" }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /^Crop size/ }).click();
    await expect(page.getByText(/JPG 360×360 · from 360×360/)).toBeVisible();
    await button.click();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
      timeout: 60_000,
    });
    const { path } = await saveResult(page, "square.jpg");
    const s = ffprobe(path)[0];
    expect([s?.width, s?.height]).toEqual([360, 360]);
  });
});

test.describe("change-video-thumbnail", () => {
  test("stores the chosen frame as the MP4's cover; picture copied", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/change-video-thumbnail");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Change a video file's thumbnail",
    );
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    const button = page.getByRole("button", { name: "Set thumbnail", exact: true });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByText(/Thumbnail 640×360 JPEG · picture and sound unchanged/),
    ).toBeVisible();
    await axeClean(page);
    await button.click();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("cover-after").getByRole("img")).toBeVisible();
    await expect(
      page.getByText(/MP4 · thumbnail stored · picture and sound unchanged/),
    ).toBeVisible();
    const { path } = await saveResult(page, "covered.mp4");
    const streams = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,width,height:stream_disposition=attached_pic",
        "-of",
        "json",
        path,
      ]).toString(),
    ).streams as { codec_name: string; width: number; disposition: { attached_pic: number } }[];
    const cover = streams.find((x) => x.disposition.attached_pic === 1);
    expect(cover?.codec_name).toBe("mjpeg");
    expect(cover?.width).toBe(640);
  });

  test("the last frame can be chosen: the button waits for it, then enables", async ({ page }) => {
    // Nothing is encoded here, so WebKit runs it too; its seeks can land off the asked frame.
    test.setTimeout(60_000);
    await page.goto("/change-video-thumbnail");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    const button = page.getByRole("button", { name: "Set thumbnail", exact: true });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    const slider = page.getByRole("slider", { name: "Frame time" });
    await slider.focus();
    await page.keyboard.press("End");
    await expect(button).toBeEnabled({ timeout: 15_000 });
    // The stored frame is the last one or within a frame of it (3 s at 30 fps).
    const t = Number(await slider.getAttribute("aria-valuenow"));
    expect(t).toBeGreaterThan(2.9);
    await button.click();
    await expect(page.getByText(/MP4 · thumbnail stored/)).toBeVisible({ timeout: 30_000 });
  });

  test("an MKV gets a way forward", async ({ page }) => {
    await page.goto("/change-video-thumbnail");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mkv"));
    await expect(page.getByText(/Only MP4 and MOV files have a place for a thumbnail/)).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByRole("link", { name: "Convert to MP4" })).toBeVisible();
  });
});
