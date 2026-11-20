import { copyFileSync, readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import AxeBuilder from "./axe-builder";
import { soundCheck } from "./sound";

/**
 * Split and merge, end to end in Chromium (desktop and the mobile Chrome profile): the first
 * multi-output and multi-input flows. Each run must yield real downloads, no request body over 1 KB
 * leaving the page, and outputs whose streams and durations check out when read back in Node.
 * WebKit is skipped: Playwright's WebKit has no WebCodecs encoder. Set SHOTS_DIR to save screenshots.
 */
test.describe("split and merge", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  const trackUploads = (page: Page) => {
    const uploads: string[] = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (body && body.length > 1024) uploads.push(`${req.method()} ${req.url()} ${body.length}`);
    });
    return uploads;
  };

  const shot = async (page: Page, name: string) => {
    const dir = process.env.SHOTS_DIR;
    if (!dir) return;
    const w = page.viewportSize()?.width ?? 0;
    await page.screenshot({ path: `${dir}/${name}-${w}.png`, fullPage: true, caret: "initial" });
  };

  /** Streams, packet counts and track durations of a downloaded file, read with mediabunny. */
  const probe = async (path: string) => {
    const input = new Input({ source: new BufferSource(readFileSync(path)), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const count = async (t: typeof video | typeof audio) => {
      if (!t) return 0;
      let n = 0;
      for await (const _ of new EncodedPacketSink(t).packets(undefined, undefined, {
        metadataOnly: true,
      }))
        n++;
      return n;
    };
    const out = {
      format: (await input.getFormat()).name,
      duration: await input.computeDuration(),
      videoCodec: video?.codec,
      width: video?.displayWidth,
      height: video?.displayHeight,
      frames: await count(video),
      audioCodec: audio?.codec,
      sampleRate: audio?.sampleRate,
      videoDuration: video ? await video.computeDuration() : 0,
      audioDuration: audio ? await audio.computeDuration() : 0,
    };
    input.dispose();
    return out;
  };

  const save = async (page: Page, link: ReturnType<Page["getByRole"]>) => {
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const path = await download.path();
    // Keep a copy next to the screenshots for manual ffprobe checks.
    const dir = process.env.SHOTS_DIR;
    const w = page.viewportSize()?.width ?? 0;
    if (dir) copyFileSync(path, `${dir}/${w}-${download.suggestedFilename()}`);
    return { path, name: download.suggestedFilename() };
  };

  test("split into equal parts copies the streams and the parts add up", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/split-video");
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace.getByText("Drop a video to split it into parts")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Split", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });

    // Three equal parts of a 3 s clip with a key frame every second: cuts at 1 s and 2 s, lossless.
    await page.getByLabel("Number of parts").fill("3");
    await page.getByLabel("Number of parts").press("Enter");
    await expect(page.getByText(/3 parts, 1\.0\ss each\. Cuts sit on key frames/)).toBeVisible();
    await expect(page.getByRole("slider", { name: "Cut 1" })).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByRole("slider", { name: "Cut 2" })).toHaveAttribute("aria-valuenow", "2");
    await page.getByLabel("Name of part 2").fill("middle");
    await shot(page, "split-ready");

    // Keyboard: the first cut steps to the next key frame and cannot pass the second cut.
    const cut1 = page.getByRole("slider", { name: "Cut 1" });
    await cut1.focus();
    await page.keyboard.press("ArrowRight");
    await expect(cut1).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("slider", { name: "Cut 1" })).toHaveCount(1);
    // Moving the cut left had nowhere to go but the first key frame (0 s), so it stays at 1 s.
    await expect(cut1).toHaveAttribute("aria-valuenow", "1");

    await button.click();
    const all = page.getByRole("link", { name: "Download all (ZIP)" });
    await expect(all).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/3 parts · streams copied/)).toBeVisible();
    await shot(page, "split-done");

    const names: string[] = [];
    let total = 0;
    let bytes = 0;
    for (const name of ["sample-part-01.mp4", "middle.mp4", "sample-part-03.mp4"]) {
      const file = await save(page, page.getByRole("link", { name: `Download ${name}` }));
      bytes += readFileSync(file.path).length;
      names.push(file.name);
      const p = await probe(file.path);
      expect(p.videoCodec).toBe("avc");
      expect(p.audioCodec).toBe("aac");
      expect(p.width).toBe(640);
      expect(p.frames).toBe(30);
      expect(p.videoDuration).toBeCloseTo(1, 2);
      total += p.videoDuration;
    }
    expect(names).toEqual(["sample-part-01.mp4", "middle.mp4", "sample-part-03.mp4"]);
    // A stream copy adds only container overhead; a silent re-encode would change the total.
    expect(Math.abs(bytes - readFileSync("tests/fixtures/sample.mp4").length)).toBeLessThan(4096);
    expect(total).toBeCloseTo(3, 2);

    const zip = await save(page, all);
    expect(zip.name).toBe("sample-parts.zip");
    const zipBytes = readFileSync(zip.path);
    expect(zipBytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(zipBytes.readUInt16LE(zipBytes.length - 12)).toBe(3);

    // Play a part: it takes the preview slot.
    await page.getByRole("button", { name: "Play middle.mp4 in the preview" }).click();
    await expect(
      page.getByRole("button", { name: "Play middle.mp4 in the preview" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: /Compress this part/ })).toHaveAttribute(
      "href",
      "/compress-video",
    );
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("split at a custom point with frame-accurate cuts re-encodes", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/split-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByRole("button", { name: "Split", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("label", { hasText: /^Custom$/ }).click();
    await expect(page.getByRole("radio", { name: "Custom" })).toBeChecked();
    await page.getByRole("checkbox", { name: /Frame-accurate cuts/ }).check();
    // Remove the seeded cut, then place one at 1.5 s with the playhead.
    await page.getByRole("slider", { name: "Cut 1" }).focus();
    await page.keyboard.press("Delete");
    await expect(page.getByText("Add a cut: scrub the preview")).toBeVisible();
    await page.locator("video").evaluate((v: HTMLVideoElement) => {
      v.currentTime = 1.5;
    });
    await page.getByRole("button", { name: "Split here" }).click();
    await expect(page.getByRole("slider", { name: "Cut 1" })).toHaveAttribute(
      "aria-valuenow",
      "1.5",
    );
    await expect(page.getByText(/2 parts, 1\.5\ss each\. Frame-accurate cuts/)).toBeVisible();
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await expect(page.getByRole("link", { name: "Download all (ZIP)" })).toBeVisible({
      timeout: 150_000,
    });
    await expect(page.getByText(/2 parts · re-encoded, frame-accurate/)).toBeVisible();
    let total = 0;
    for (const name of ["sample-part-01.mp4", "sample-part-02.mp4"]) {
      const file = await save(page, page.getByRole("link", { name: `Download ${name}` }));
      const p = await probe(file.path);
      expect(p.videoCodec).toBe("avc");
      expect(p.videoDuration).toBeCloseTo(1.5, 1);
      total += p.videoDuration;
    }
    expect(total).toBeCloseTo(3, 1);
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("merge matching clips joins them without re-encoding", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/merge-videos");
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace.getByText("Drop two or more videos")).toBeVisible();
    await shot(page, "merge-idle");
    await page
      .locator('input[type="file"]')
      .setInputFiles(["tests/fixtures/sample.mp4", "tests/fixtures/sample-b.mp4"]);
    const button = page.getByRole("button", { name: "Merge", exact: true });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText(/Lossless: the 2 clips share codec/)).toBeVisible();
    await expect(page.getByText(/2 clips · 0:05 in total/)).toBeVisible();

    // Reorder with the buttons, then back with the keyboard on the thumbnail handle.
    await page.getByRole("button", { name: "Move sample-b.mp4 up" }).click();
    await expect(
      page.getByRole("list", { name: "Clips in order" }).getByRole("listitem").first(),
    ).toContainText("sample-b.mp4");
    await page.getByRole("button", { name: /^Clip 1, sample-b\.mp4/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("list", { name: "Clips in order" }).getByRole("listitem").first(),
    ).toContainText("sample.mp4");
    await expect(page.getByRole("button", { name: /^Clip 2, sample-b\.mp4/ })).toBeFocused();

    // Later files add to the list.
    await page.locator('input[type="file"][multiple]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByText(/3 clips · 0:08 in total/)).toBeVisible({ timeout: 30_000 });
    await shot(page, "merge-ready");

    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/3 clips · 0:08 · streams copied/)).toBeVisible();
    // The merged video plays in the preview slot.
    await expect(page.locator("video")).toHaveCount(1);
    await shot(page, "merge-done");
    const file = await save(page, download);
    expect(file.name).toBe("sample-merged.mp4");
    const p = await probe(file.path);
    expect(p.videoCodec).toBe("avc");
    expect(p.audioCodec).toBe("aac");
    // Copied, not re-encoded: every source frame is there (90 + 60 + 90) and the length is the sum.
    expect(p.frames).toBe(240);
    expect(p.videoDuration).toBeCloseTo(8, 2);
    expect(Math.abs(p.audioDuration - p.videoDuration)).toBeLessThan(0.03);
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("merge clips that differ re-encodes and names the clip", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/merge-videos");
    await page
      .locator('input[type="file"]')
      .setInputFiles(["tests/fixtures/sample.mp4", "tests/fixtures/sample-square.mp4"]);
    const button = page.getByRole("button", { name: "Merge", exact: true });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByText(/Re-encodes\. Clip 2 is 480×480; clip 1 is 640×360\./),
    ).toBeVisible();
    await expect(page.getByText("Differs from clip 1, so the merge re-encodes.")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Black bars" })).toBeChecked();
    await shot(page, "merge-reencode");
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText(/2 clips · 0:05 · re-encoded at 640×360/)).toBeVisible();
    const file = await save(page, download);
    const p = await probe(file.path);
    expect(p.format).toMatch(/MP4/i);
    expect(p.videoCodec).toBe("avc");
    expect(p.width).toBe(640);
    expect(p.height).toBe(360);
    expect(p.videoDuration).toBeCloseTo(5, 1);
    expect(p.sampleRate).toBe(44_100);
    // The AAC encoder's priming is signalled in an edit list (mediabunny/priming): before it the sound
    // started 59 ms late and ran to 5.085 s. mediabunny ignores the edit's end, so ffmpeg checks it.
    const sound = soundCheck(file.path);
    if (sound) {
      expect(sound.start).toBeCloseTo(0, 3);
      expect(sound.seconds).toBeCloseTo(5, 2);
      // Each clip's sound decodes with pre-roll, so the first frame is whole (before: 10.8 ms).
      expect(sound.onset).toBeLessThan(0.001);
    } else {
      expect(Math.abs(p.audioDuration - 5)).toBeLessThan(0.1);
    }
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("merge names a file it cannot read and keeps the rest", async ({ page }) => {
    await page.goto("/merge-videos");
    await page.locator('input[type="file"]').setInputFiles([
      {
        name: "sample.mp4",
        mimeType: "video/mp4",
        buffer: readFileSync("tests/fixtures/sample.mp4"),
      },
      { name: "notes.mp4", mimeType: "video/mp4", buffer: Buffer.from("not a video") },
    ]);
    await expect(page.getByText(/notes\.mp4 could not be read\./)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Add at least one more video to merge.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Merge", exact: true })).toBeDisabled();
  });

  test("both pages have no axe violations when idle, ready and done", async ({ page }) => {
    test.setTimeout(120_000);
    const axe = async () => {
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    };
    await page.goto("/split-video");
    await page.waitForLoadState("networkidle");
    await axe();
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    await expect(page.getByRole("button", { name: "Split", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await axe();
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await expect(page.getByRole("link", { name: "Download all (ZIP)" })).toBeVisible({
      timeout: 60_000,
    });
    await axe();

    await page.goto("/merge-videos");
    await page.waitForLoadState("networkidle");
    await axe();
    await page
      .locator('input[type="file"]')
      .setInputFiles(["tests/fixtures/sample.mp4", "tests/fixtures/sample-b.mp4"]);
    await expect(page.getByRole("button", { name: "Merge", exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await axe();
    await page.getByRole("button", { name: "Merge", exact: true }).click();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await axe();
  });
});
