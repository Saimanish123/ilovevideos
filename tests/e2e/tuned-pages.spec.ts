import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * The older pages tuned to their own job (ADR-0016): what dominates in ready, the shortcuts each page
 * handles (feature catalog L8), and the done state confirming the result. Axe runs on every ready
 * state. Chromium only (desktop and the mobile Chrome profile): Playwright's WebKit has no WebCodecs.
 * Set PAGES_SHOTS=<dir> to save the workspace in idle, ready and done at 1280 and 390.
 */
const shots = process.env.PAGES_SHOTS;

const zone = (page: Page) => page.getByRole("region", { name: "Workspace" });

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const size = page.viewportSize();
  // The phone project runs at 412; the design checks are at 390.
  if (size && size.width < 500) await page.setViewportSize({ width: 390, height: size.height });
  const w = page.viewportSize()?.width ?? 0;
  await page.waitForTimeout(300);
  // The sticky site header would sit over a workspace taller than the viewport.
  const style = await page.addStyleTag({ content: "header { visibility: hidden !important; }" });
  await zone(page).screenshot({ path: join(shots, `${name}-${w}.png`) });
  await style.evaluate((el) => el.remove());
  if (size && size.width < 500) await page.setViewportSize(size);
};

const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).include("main").analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
};

const drop = (page: Page, fixture: string) =>
  page.locator('input[type="file"]').setInputFiles(`tests/fixtures/${fixture}`);

const video = (page: Page) => zone(page).locator("video").first();
const paused = (page: Page) => video(page).evaluate((v) => (v as HTMLVideoElement).paused);
const currentTime = (page: Page) =>
  video(page).evaluate((v) => (v as HTMLVideoElement).currentTime);
const seekTo = (page: Page, t: number) =>
  video(page).evaluate(
    (v, time) =>
      new Promise<void>((resolve) => {
        const el = v as HTMLVideoElement;
        el.addEventListener("seeked", () => resolve(), { once: true });
        el.currentTime = time;
      }),
    t,
  );

const noUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

/** Segmented and choice radios are visually hidden inside their label, which takes the click. */
const choose = (page: Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name, exact: true }) }).click();

const hint = async (page: Page, isMobile: boolean, text: RegExp) => {
  const details = zone(page).getByTestId("shortcut-hint");
  if (isMobile) {
    // Touch-only devices have no keys: the hint is hidden there.
    await expect(details).toBeHidden();
    return;
  }
  await details.locator("summary").click();
  await expect(details).toContainText(text);
  await details.locator("summary").click();
};

test.describe("tuned pages", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs is Chromium-only here");

  test("trim: key frame ticks, I and O at the playhead, Space, kept readout, result plays", async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120_000);
    const uploads = noUploads(page);
    await page.goto("/trim-video");
    await expect(zone(page)).toContainText("Drop a video to trim it");
    await shot(page, "trim-idle");
    await drop(page, "sample.mp4");
    const trim = page.getByRole("button", { name: "Trim", exact: true });
    await expect(trim).toBeVisible({ timeout: 30_000 });
    // The fixture has a key frame every second: 0, 1 and 2 s.
    await expect(zone(page).getByTestId("keyframe-tick")).toHaveCount(3);
    await expect(page.getByText(/^Kept 0:03\.0\d of 0:03\.0\d$/)).toBeVisible();

    // I at 1.2 s: the lossless cut really starts on the 1 s key frame, and the page shows it.
    await seekTo(page, 1.2);
    await page.getByRole("button", { name: "Set start" }).focus();
    await page.keyboard.press("i");
    await expect(page.locator("#start")).toHaveValue("1.2");
    await expect(zone(page).getByTestId("actual-start")).toHaveCount(1);
    await expect(page.getByText(/Starts at 0:01\.00, the key frame before 0:01\.20/)).toBeVisible();
    await seekTo(page, 2.5);
    await page.keyboard.press("o");
    await expect(page.locator("#end")).toHaveValue("2.5");
    await expect(page.getByText(/^Kept 0:01\.50 of 0:03\.0\d$/)).toBeVisible();

    // Space plays and pauses the preview from a focused handle.
    await page.getByRole("slider", { name: "Start" }).focus();
    await page.keyboard.press("Space");
    await expect.poll(() => paused(page)).toBe(false);
    await page.keyboard.press("Space");
    await expect.poll(() => paused(page)).toBe(true);
    // Never while typing in a field.
    await page.locator("#start").focus();
    await page.keyboard.press("o");
    await expect(page.locator("#end")).toHaveValue("2.5");
    await page.locator("#start").blur();

    // Frame-accurate hides the ticks (every frame is a valid cut then).
    await page.getByText("Frame-accurate cut").click();
    await expect(zone(page).getByTestId("keyframe-tick")).toHaveCount(0);
    await page.getByText("Frame-accurate cut").click();
    await hint(page, isMobile, /Set the start at the playhead/);
    await axe(page);
    await shot(page, "trim-ready");

    await trim.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/^Kept 0:01\.50 of 0:03\.0\d$/)).toBeVisible();
    await expect(
      page.getByText(/Starts at 0:01\.00, the key frame before 0:01\.20\. The streams were copied/),
    ).toBeVisible();
    // The trimmed clip plays in the preview: its duration is the kept length.
    await expect
      .poll(() => video(page).evaluate((v) => (v as HTMLVideoElement).duration), {
        timeout: 10_000,
      })
      .toBeCloseTo(1.5, 0);
    await expect(page.getByRole("link", { name: "Make a GIF of this clip" })).toBeVisible();
    await shot(page, "trim-done");
    expect(uploads).toEqual([]);
  });

  test("video-to-gif: the preview loops muted, the estimate is large, the verdict gives facts", async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/video-to-gif");
    await expect(zone(page)).toContainText("Drop a video to make a GIF from it");
    await shot(page, "gif-idle");
    await drop(page, "sample.mp4");
    const button = page.getByRole("button", { name: "Make GIF", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    // It reads like the GIF: playing by itself, muted, on repeat.
    await expect.poll(() => paused(page), { timeout: 10_000 }).toBe(false);
    expect(await video(page).evaluate((v) => (v as HTMLVideoElement).muted)).toBe(true);
    const estimate = page.getByTestId("gif-estimate");
    await expect(estimate).toContainText(/^About .*B/);
    await expect(estimate).toContainText(/36\sframes, 3\.0\ss at 12\sfps, 480×270/);
    await expect(page.getByText("Runs on this device.", { exact: true })).toBeVisible();
    // Repeat: after the end it is back near the start and still playing.
    // Poll every 100 ms: at the default back-off the samples can fall into step with the 3 s loop
    // and never see its end.
    await expect
      .poll(() => currentTime(page), { timeout: 8_000, intervals: [100] })
      .toBeGreaterThan(2.5);
    await expect
      .poll(() => currentTime(page), { timeout: 8_000, intervals: [100] })
      .toBeLessThan(1);
    expect(await paused(page)).toBe(false);
    await hint(page, isMobile, /Start the GIF at the playhead/);
    await axe(page);
    await shot(page, "gif-ready");
    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/^[\d.]+\s(kB|MB) GIF, 480×270, 36\sframes$/)).toBeVisible();
    await expect(page.getByText("It loops forever, as it plays here.")).toBeVisible();
    // Without a reduced-motion preference the GIF plays, and can always be paused.
    await expect(page.getByRole("button", { name: "Pause the GIF" })).toBeVisible();
    await shot(page, "gif-done");
  });

  test("extract-frame: arrows step from anywhere, T takes the frame, Copy image puts a PNG on the clipboard", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/extract-frame-from-video");
    await expect(zone(page)).toContainText("Drop a video to take a still from it");
    await shot(page, "frame-idle");
    await drop(page, "sample.mp4");
    const button = page.getByRole("button", { name: "Extract frame", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const slider = page.getByRole("slider", { name: "Frame time" });
    // Focus on a button, not the slider: the arrows still step one frame, Shift one second.
    await page.getByRole("button", { name: "Take this frame" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "0.033");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.033");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    // T takes the moment the preview is on.
    await seekTo(page, 2);
    await page.keyboard.press("t");
    await expect(slider).toHaveAttribute("aria-valuenow", "2");
    await expect(page.locator("#time")).toHaveValue("2");
    // Arrows in the time field move the caret, not the frame.
    await page.locator("#time").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "2");
    await page.locator("#time").blur();
    await hint(page, isMobile, /Take the frame the preview is on/);
    await axe(page);
    await shot(page, "frame-ready");

    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Frame at 0:02.00: 640×360 PNG")).toBeVisible();
    const copy = page.getByRole("button", { name: "Copy image" });
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(
      page.getByText("Copied as PNG. Paste it into a message or a document."),
    ).toBeVisible();
    const types = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.flatMap((i) => i.types);
    });
    expect(types).toContain("image/png");
    await shot(page, "frame-done");
  });

  test("extract-frame: a JPG still is copied as PNG too", async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/extract-frame-from-video");
    await drop(page, "sample.mp4");
    const button = page.getByRole("button", { name: "Extract frame", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await choose(page, "JPG");
    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Copy image" }).click();
    await expect(page.getByText(/^Copied as PNG/)).toBeVisible();
    const types = await page.evaluate(async () =>
      (await navigator.clipboard.read()).flatMap((i) => i.types),
    );
    expect(types).toContain("image/png");
  });

  test("rotate: dimensions in large type, phone rotation flag named, R turns, result plays", async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/rotate-video");
    await expect(zone(page)).toContainText("Drop a video to turn it upright");
    await shot(page, "rotate-idle");
    // A phone-style file: landscape frames with a 90° flag, shown portrait.
    await drop(page, "sample-rotated.mp4");
    const rotate = page.getByRole("button", { name: "Rotate", exact: true });
    await expect(rotate).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("sideways-note")).toContainText(
      /already carries a \d+° rotation flag/,
    );
    const dims = page.getByTestId("rotate-dimensions");
    await expect(dims).toHaveText("360×640");
    await page.getByRole("button", { name: "Rotate right" }).focus();
    await page.keyboard.press("r");
    await expect(dims).toHaveText("360×640 → 640×360");
    await expect(page.getByText(/lossless, flag only/)).toBeVisible();
    await expect(page.getByText(/^Lossless: only the rotation flag/)).toBeVisible();
    await page.keyboard.press("Shift+R");
    await expect(dims).toHaveText("360×640");
    await page.keyboard.press("h");
    await expect(page.getByRole("button", { name: "Flip horizontal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText(/A flip rewrites every pixel/)).toBeVisible();
    await page.keyboard.press("h");
    await page.keyboard.press("r");
    await hint(page, isMobile, /Rotate right/);
    await axe(page);
    await shot(page, "rotate-ready");
    await rotate.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("90° clockwise: 360×640 → 640×360")).toBeVisible();
    await expect(page.getByText(/Only the rotation flag changed/)).toBeVisible();
    // The result plays in the preview, turned: the browser applies the new flag.
    await expect
      .poll(() => video(page).evaluate((v) => (v as HTMLVideoElement).videoWidth), {
        timeout: 10_000,
      })
      .toBe(640);
    await shot(page, "rotate-done");
  });

  test("flip: the flips come first on the flip page", async ({ page }) => {
    await page.goto("/flip-video");
    await expect(zone(page)).toContainText("Drop a video to mirror it");
    await drop(page, "sample.mp4");
    await expect(page.getByRole("button", { name: "Flip", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const first = zone(page).locator("fieldset fieldset button").first();
    await expect(first).toHaveAccessibleName("Flip horizontal");
    await expect(page.getByText("Flip and rotate", { exact: true })).toBeVisible();
    await expect(page.getByTestId("rotate-dimensions")).toHaveText("640×360");
    await axe(page);
    await shot(page, "flip-ready");
  });

  test("speed: presets with meaning, the new length large, ] and [ step presets", async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/change-video-speed");
    await expect(zone(page)).toContainText("Drop a video to speed it up or slow it down");
    await shot(page, "speed-idle");
    await drop(page, "sample.mp4");
    const button = page.getByRole("button", { name: "Change speed", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const length = page.getByTestId("speed-length");
    await expect(length).toHaveText("3.0 s → 1.5 s");
    await expect(page.getByRole("radio", { name: "4×", exact: true })).toHaveAccessibleDescription(
      "Timelapse",
    );
    await choose(page, "0.5×");
    await expect(length).toHaveText("3.0 s → 6.0 s");
    await page.getByText("Speed", { exact: true }).click();
    await page.keyboard.press("]");
    await expect(length).toHaveText("3.0 s → 4.0 s");
    await page.keyboard.press("[");
    await expect(length).toHaveText("3.0 s → 6.0 s");
    await choose(page, "2×");
    await expect(page.getByText(/^Audio pitch is kept\. Re-encodes to MP4/)).toBeVisible();
    await hint(page, isMobile, /Next faster preset/);
    await axe(page);
    await shot(page, "speed-ready");
    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText("Now 1.5 s long, 2× faster")).toBeVisible();
    await expect
      .poll(() => video(page).evaluate((v) => (v as HTMLVideoElement).duration), {
        timeout: 10_000,
      })
      .toBeCloseTo(1.5, 0);
    await shot(page, "speed-done");
  });

  test("remove audio: lists what goes, plays muted, hands the source to extract audio", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/remove-audio-from-video");
    await expect(zone(page)).toContainText("Drop a video to remove its sound");
    await shot(page, "mute-idle");
    await drop(page, "sample.mp4");
    const button = page.getByRole("button", { name: "Remove audio", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await expect(zone(page).getByRole("listitem").filter({ hasText: "Audio" })).toContainText(
      /AAC · mono/,
    );
    await expect(page.getByText(/Video: H\.264, 640×360, copied bit for bit/)).toBeVisible();
    await expect.poll(() => video(page).evaluate((v) => (v as HTMLVideoElement).muted)).toBe(true);
    await expect(page.getByRole("link", { name: "Extract the audio" })).toBeVisible();
    await axe(page);
    await shot(page, "mute-ready");
    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Sound removed: one audio track")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add new sound to it" })).toBeVisible();
    await shot(page, "mute-done");
  });

  test("remove audio: a silent video is already done", async ({ page }) => {
    await page.goto("/remove-audio-from-video");
    await drop(page, "sample-silent.mp4");
    await expect(
      zone(page)
        .getByRole("paragraph")
        .filter({ hasText: /^Already silent: this video has no audio track/ }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Remove audio", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Add sound to it instead" })).toBeVisible();
    await axe(page);
    await shot(page, "mute-settled");
  });

  test("remove metadata: findings are the hero, location first with its value; the copy is read back", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/remove-metadata-from-video");
    await shot(page, "metadata-idle");
    await drop(page, "sample-tagged.mp4");
    const button = page.getByRole("button", { name: "Remove metadata", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const found = page.getByTestId("metadata-found");
    await expect(found.getByRole("listitem").first()).toContainText("Location (GPS)");
    await expect(found.getByRole("listitem").first()).toContainText("48.8584° N, 2.2945° E");
    await expect(found).toContainText("Holiday clip");
    await expect(page.getByText(/^Removes \d+ tags, including location\./)).toBeVisible();
    await axe(page);
    await shot(page, "metadata-ready");
    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^Removed \d+ tags including location$/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Left in the clean copy" })).toBeVisible();
    // Nothing identifying is left, the header recording time included (ADR-0032 clears it).
    const after = page.getByTestId("metadata-after");
    await expect(after).toBeVisible({ timeout: 20_000 });
    await expect(after).not.toContainText("Location");
    await expect(after).not.toContainText("Holiday clip");
    await expect(after).not.toContainText("Creation date");
    await expect(
      page.getByRole("link", { name: "Check every field of the clean copy" }),
    ).toBeVisible();
    await shot(page, "metadata-done");
  });

  test("video info: plain overview first, next steps from the facts", async ({ page }) => {
    await page.goto("/video-info");
    await shot(page, "info-idle");
    await drop(page, "sample.webm");
    const overview = page.getByTestId("info-overview");
    await expect(overview).toBeVisible({ timeout: 30_000 });
    await expect(overview).toContainText(/0:03 · 640×360 · 30\sfps/);
    await expect(overview).toContainText(/VP9 video with mono Opus sound/);
    await expect(overview).toContainText(/VP9 is the web's codec/);
    const next = page.getByTestId("info-next");
    await expect(next.getByRole("link", { name: "Convert WebM to MP4" })).toBeVisible();
    await axe(page);
    await shot(page, "info-ready");
  });

  test("video info: a rotation flag suggests rotate, H.264 suggests nothing", async ({ page }) => {
    await page.goto("/video-info");
    await drop(page, "sample-rotated.mp4");
    await expect(page.getByTestId("info-overview")).toContainText("360×640", { timeout: 30_000 });
    await expect(
      page.getByTestId("info-next").getByRole("link", { name: "Rotate video" }),
    ).toBeVisible();
    await expect(page.getByTestId("info-next").getByRole("link", { name: /^Convert/ })).toHaveCount(
      0,
    );
  });

  test("extract audio: the waveform is the hero, formats by purpose, the result plays there", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/extract-audio-from-video");
    await shot(page, "audio-idle");
    await drop(page, "sample.mp4");
    const button = page.getByRole("button", { name: "Extract audio", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    // No empty video box: the waveform with its own player.
    await expect(zone(page).locator("video")).toHaveCount(0);
    await expect(page.getByRole("slider", { name: "Playback position" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "M4A", exact: true })).toHaveAccessibleDescription(
      /Copied, lossless/,
    );
    await expect(page.getByRole("radio", { name: "MP3", exact: true })).toHaveAccessibleDescription(
      /Re-encodes/,
    );
    // Only a part: the timeline drives the waveform's own player.
    await page.getByText("Only a part of the video").click();
    await expect(page.getByRole("slider", { name: "Start" })).toBeVisible();
    await axe(page);
    await page.getByText("Only a part of the video").click();
    await choose(page, "M4A");
    await shot(page, "audio-ready");
    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Play the result" })).toBeVisible();
    await expect(page.getByText("Result", { exact: true })).toBeVisible();
    await shot(page, "audio-done");
  });

  test("mp4-to-mp3: waveform hero with the target locked", async ({ page }) => {
    await page.goto("/mp4-to-mp3");
    await drop(page, "sample.mp4");
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Output MP3 from AAC/)).toBeVisible();
    await expect(page.getByRole("slider", { name: "Playback position" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "M4A", exact: true })).toHaveCount(0);
    await axe(page);
    await shot(page, "mp3-ready");
  });

  test("converter: targets by purpose, each saying copy or re-encode first", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/video-converter");
    await shot(page, "convert-idle");
    await drop(page, "sample.mkv");
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    await expect(convert).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "MP4", exact: true })).toHaveAccessibleDescription(
      "Plays everywhere. Lossless copy",
    );
    await expect(
      page.getByRole("radio", { name: "WebM", exact: true }),
    ).toHaveAccessibleDescription("For the web. Re-encodes");
    await choose(page, "Other format");
    await expect(page.locator("#to")).toBeVisible();
    await choose(page, "MP4");
    await axe(page);
    await shot(page, "convert-ready");
    await convert.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Now an MP4: copied with no quality lost")).toBeVisible();
    await shot(page, "convert-done");
  });

  test("converter: an MP4 on the hub asks for another format", async ({ page }) => {
    await page.goto("/video-converter");
    await drop(page, "sample.mp4");
    await expect(
      page.getByText("This file is already an MP4. Choose another format to convert it to."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeDisabled();
  });

  test("remove audio: a batch has no preview, so the panel does not mention one", async ({
    page,
  }) => {
    await page.goto("/remove-audio-from-video");
    await page
      .locator('input[type="file"]')
      .setInputFiles(["tests/fixtures/sample.mp4", "tests/fixtures/sample-b.mp4"]);
    await expect(page.getByText("Will be removed")).toBeVisible({ timeout: 30_000 });
    // (The page's own steps mention the preview; the panel must not.)
    await expect(zone(page).getByText("The preview plays muted, as the result will.")).toHaveCount(
      0,
    );
  });

  test("video info: Copy as text announces the outcome", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/video-info");
    await drop(page, "sample.mp4");
    await page.getByRole("button", { name: "Copy as text" }).click({ timeout: 30_000 });
    await expect(
      zone(page).getByRole("status").filter({ hasText: "The report is on the clipboard." }),
    ).toHaveCount(1);
  });
});

/** Two screenshots of the picture this far apart are identical while nothing moves. */
const still = async (page: Page, gapMs = 900) => {
  const box = page.getByTestId("image-stage");
  const a = await box.screenshot();
  await page.waitForTimeout(gapMs);
  const b = await box.screenshot();
  return a.equals(b);
};

test.describe("GIFs under reduced motion", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs is Chromium-only here");
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("a finished GIF starts paused on its first frame and plays only on request", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/video-to-gif");
    await drop(page, "sample.mp4");
    const button = page.getByRole("button", { name: "Make GIF", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    // The ready preview does not play by itself either.
    expect(await paused(page)).toBe(true);
    await button.click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 90_000 });
    const play = page.getByRole("button", { name: "Play the GIF" });
    await expect(play).toBeVisible();
    await expect(page.getByRole("img", { name: /paused$/ })).toBeVisible();
    // The first frame is drawn, then nothing changes.
    await expect
      .poll(() =>
        page.getByRole("img", { name: /paused$/ }).evaluate((c) => (c as HTMLCanvasElement).width),
      )
      .toBeGreaterThan(0);
    expect(await still(page)).toBe(true);
    // 44 px, keyboard operable.
    const size = await play.boundingBox();
    expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
    await play.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Pause the GIF" })).toBeVisible();
    await expect.poll(() => still(page, 400), { timeout: 10_000 }).toBe(false);
    await page.getByRole("button", { name: "Pause the GIF" }).click();
    await expect(page.getByRole("button", { name: "Play the GIF" })).toBeVisible();
    expect(await still(page)).toBe(true);
    await axe(page);
  });

  test("the source GIF on gif-to-mp4 starts paused too", async ({ page }) => {
    await page.goto("/gif-to-mp4");
    await drop(page, "sample.gif");
    await expect(page.getByRole("button", { name: "Play the GIF" })).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() =>
        page.getByRole("img", { name: /paused$/ }).evaluate((c) => (c as HTMLCanvasElement).width),
      )
      .toBeGreaterThan(0);
    expect(await still(page)).toBe(true);
  });
});
