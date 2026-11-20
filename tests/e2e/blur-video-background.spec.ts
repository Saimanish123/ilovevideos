import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";
import { probe, saveDownload, shootWidths, trackUploads } from "./overlay-helpers";

/**
 * Background without a green screen (blur-video-background, remove-background-from-video), end to
 * end, on fixtures with a known answer (scripts/make-person-fixtures.sh): a real person, cut out by
 * hand from a public-domain NASA portrait, laid over varied backgrounds with known motion, with the
 * person mask frame for frame. The mask the page writes is compared with it (IoU, edge error, and
 * how much it changes between frames beyond the true motion); the blurred and replaced results are
 * checked where the answer is certain (deep inside the person and far outside). The model and its
 * runtime may load only from this origin, and only after a file is chosen. Encoding needs
 * WebCodecs: the processing tests run on Chromium; the pages themselves are checked everywhere.
 * OVERLAY_SHOTS=<dir> saves 390, 768 and 1280 screenshots of each state.
 */

const WIDE = "tests/fixtures/person/person-16x9.mp4";
const WIDE_MASK = "tests/fixtures/person/person-16x9-mask.mkv";
const TALL = "tests/fixtures/person/person-9x16.mp4";
const TALL_MASK = "tests/fixtures/person/person-9x16-mask.mkv";
/** Dim, with fresh noise and an exposure flicker on every frame: where the model wavers. */
const LOW = "tests/fixtures/person/person-lowlight.mp4";
const LOW_MASK = "tests/fixtures/person/person-lowlight-mask.mkv";

const pick = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true }).locator("xpath=..").click();

/** Every frame of a video as gray bytes. */
function grayFrames(path: string, w: number, h: number): Uint8Array[] {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 30 },
  );
  const out: Uint8Array[] = [];
  for (let o = 0; o + w * h <= raw.length; o += w * h) out.push(raw.subarray(o, o + w * h));
  return out;
}

function rgbFrame(path: string, t: number) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
}

/** Pixels within `r` of the truth's edge, as 1s. */
function edgeBand(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const band = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = (g[y * w + x] ?? 0) > 127;
      let differs = false;
      for (let dy = -r; dy <= r && !differs; dy += r)
        for (let dx = -r; dx <= r && !differs; dx += r) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          if ((g[yy * w + xx] ?? 0) > 127 !== inside) differs = true;
        }
      band[y * w + x] = differs ? 1 : 0;
    }
  return band;
}

interface MaskScore {
  iou: number;
  minIou: number;
  edgeError: number;
  excessChange: number;
}

/** IoU (at one half), mean error on the edge band, and change between frames beyond the truth's. */
function scoreMask(pred: Uint8Array[], truth: Uint8Array[], w: number, h: number): MaskScore {
  const n = Math.min(pred.length, truth.length);
  let iouSum = 0;
  let minIou = 1;
  let edgeSum = 0;
  let edgeN = 0;
  let exSum = 0;
  let exN = 0;
  let prevBand: Uint8Array | undefined;
  for (let f = 0; f < n; f++) {
    const p = pred[f] as Uint8Array;
    const g = truth[f] as Uint8Array;
    let inter = 0;
    let union = 0;
    for (let i = 0; i < w * h; i++) {
      const a = (p[i] ?? 0) > 127;
      const b = (g[i] ?? 0) > 127;
      if (a && b) inter++;
      if (a || b) union++;
    }
    const iou = union ? inter / union : 1;
    iouSum += iou;
    minIou = Math.min(minIou, iou);
    const band = edgeBand(g, w, h, 6);
    for (let i = 0; i < w * h; i++) {
      if (!band[i]) continue;
      edgeSum += Math.abs((p[i] ?? 0) - (g[i] ?? 0)) / 255;
      edgeN++;
    }
    if (f > 0 && prevBand) {
      const p0 = pred[f - 1] as Uint8Array;
      const g0 = truth[f - 1] as Uint8Array;
      for (let i = 0; i < w * h; i++) {
        if (!band[i] && !prevBand[i]) continue;
        exSum += Math.abs((p[i] ?? 0) - (p0[i] ?? 0) - ((g[i] ?? 0) - (g0[i] ?? 0))) / 255;
        exN++;
      }
    }
    prevBand = band;
  }
  return { iou: iouSum / n, minIou, edgeError: edgeSum / edgeN, excessChange: exSum / exN };
}

/** Records every request the page makes for a model or to another host. */
function trackModelRequests(page: Page) {
  const seen: string[] = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.protocol === "blob:" || u.protocol === "data:") return;
    if (u.hostname !== "localhost" || u.pathname.startsWith("/models/")) seen.push(u.pathname);
  });
  return seen;
}

async function open(page: Page, slug: string, file: string, title: string) {
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
    "Drop a video with a person in it",
  );
  await page.locator('input[type="file"]').first().setInputFiles(file);
}

const BLUR_TITLE = "Blur the background of a video";
const REMOVE_TITLE = "Remove the background from a video";

test.describe("background without a green screen: the pages", () => {
  test("blur: loads the model only after a file, previews live, no axe violations", async ({
    page,
    browserName,
  }) => {
    const models = trackModelRequests(page);
    await page.goto("/blur-video-background");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(BLUR_TITLE);
    // Nothing of the model before a file is chosen.
    await page.waitForLoadState("networkidle");
    expect(models).toEqual([]);
    await page.locator('input[type="file"]').first().setInputFiles(WIDE);
    const run = page.locator('[data-action="run"]');
    await expect(run).toHaveText("Blur background");
    const status = page.getByRole("status").first();
    const preview = page.getByTestId("matte-preview");
    // The person finder needs graphics support; where the browser has none the page says why.
    await expect
      .poll(
        async () =>
          (await preview.getAttribute("data-drawn")) === "1" ||
          /cannot|could not|stopped/.test((await status.textContent()) ?? ""),
        { timeout: 90_000 },
      )
      .toBe(true);
    if ((await preview.getAttribute("data-drawn")) !== "1") {
      process.stdout.write(`${browserName}: ${(await status.textContent()) ?? ""}\n`);
      // A picture this browser cannot decode has no button at all (ADR-0141); a failed finder
      // keeps it, disabled.
      if ((await run.count()) > 0) await expect(run).toBeDisabled();
      return;
    }
    await expect(status).toHaveText("Background blurred, medium · H.264 640×360 · sound copied");
    await expect(run).toBeEnabled();
    // Only our own model files, the landscape one for a wide video.
    expect(models.sort()).toEqual([
      "/models/selfie-segmenter/landscape/1/group1-shard1of1.bin",
      "/models/selfie-segmenter/landscape/1/model.json",
    ]);
    await shootWidths(page, "background-blur-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // Image or Video without a file blocks the run until one is chosen.
    await pick(page, "Image");
    await expect(status).toHaveText("Choose a background picture first.");
    await expect(run).toBeDisabled();
    await pick(page, "Colour");
    await expect(run).toHaveText("Remove background");
    await pick(page, "Blur");
    await expect(run).toBeEnabled();
    // More options: the mask output names itself and drops the background controls.
    await page.getByText("More options", { exact: true }).click();
    await pick(page, "Mask only");
    await expect(run).toHaveText("Make mask");
    await expect(status).toHaveText("Person mask only · H.264 640×360 · no sound");
    await expect(page.getByRole("radio", { name: "Blur", exact: true })).toHaveCount(0);
  });

  test("remove: colour behind by default, vertical video uses the square model", async ({
    page,
  }) => {
    const models = trackModelRequests(page);
    await open(page, "remove-background-from-video", TALL, REMOVE_TITLE);
    const run = page.locator('[data-action="run"]');
    const status = page.getByRole("status").first();
    const preview = page.getByTestId("matte-preview");
    await expect
      .poll(
        async () =>
          (await preview.getAttribute("data-drawn")) === "1" ||
          /cannot|could not|stopped/.test((await status.textContent()) ?? ""),
        { timeout: 90_000 },
      )
      .toBe(true);
    if ((await preview.getAttribute("data-drawn")) !== "1") return;
    await expect(run).toHaveText("Remove background");
    await expect(status).toHaveText(
      "Background removed, on #FFFFFF · H.264 360×640 · sound copied",
    );
    expect(models.every((m) => m.startsWith("/models/selfie-segmenter/general/1/"))).toBe(true);
    await shootWidths(page, "background-remove-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("a file without a picture is refused with the reason", async ({ page }) => {
    await open(page, "blur-video-background", "tests/fixtures/sample.m4a", BLUR_TITLE);
    await expect(page.getByText("This file has no video track.", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    // No option can add a picture: no dead button (ADR-0141).
    await expect(page.locator('[data-action="run"]')).toHaveCount(0);
  });
});

test.describe("background without a green screen: results", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  async function saveMask(page: Page, slug: string, file: string, title: string) {
    await open(page, slug, file, title);
    await expect(page.getByTestId("matte-preview")).toHaveAttribute("data-drawn", "1", {
      timeout: 90_000,
    });
    await page.getByText("More options", { exact: true }).click();
    await pick(page, "Mask only");
    const run = page.locator('[data-action="run"]');
    await expect(run).toHaveText("Make mask");
    await run.click();
    await expect(page.getByText("Mask made", { exact: true })).toBeVisible({ timeout: 240_000 });
    return saveDownload(page);
  }

  test("the mask matches the hand-cut person on wide, vertical and low-light video", async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const uploads = trackUploads(page);
    const lines: string[] = [];
    for (const [file, truth, w, h, minIou] of [
      [WIDE, WIDE_MASK, 640, 360, 0.9],
      [TALL, TALL_MASK, 360, 640, 0.94],
      [LOW, LOW_MASK, 640, 360, 0.94],
    ] as const) {
      const { path, name } = await saveMask(page, "blur-video-background", file, BLUR_TITLE);
      expect(name).toMatch(/-mask\.mp4$/);
      const p = probe(path);
      expect(p.streams.map((s) => s.codec_type)).toEqual(["video"]);
      expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: w, height: h });
      const score = scoreMask(grayFrames(path, w, h), grayFrames(truth, w, h), w, h);
      lines.push(
        `${w}×${h}: IoU ${(score.iou * 100).toFixed(2)}% (lowest frame ${(score.minIou * 100).toFixed(2)}%), edge error ${score.edgeError.toFixed(3)}, change beyond motion ${score.excessChange.toFixed(4)}`,
      );
      expect(score.iou).toBeGreaterThan(minIou);
      expect(score.minIou).toBeGreaterThan(0.75);
      expect(score.excessChange).toBeLessThan(0.12);
    }
    process.stdout.write(`person mask vs truth\n${lines.join("\n")}\n`);
    expect(uploads).toEqual([]);
  });

  test("blur: person kept, background blurred, sound copied; it cancels and runs again", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await open(page, "blur-video-background", WIDE, BLUR_TITLE);
    await expect(page.getByTestId("matte-preview")).toHaveAttribute("data-drawn", "1", {
      timeout: 90_000,
    });
    const run = page.locator('[data-action="run"]');
    // Cancel within a second, then a full run.
    await run.click();
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeVisible();
    await shootWidths(page, "background-blur-processing");
    const t0 = Date.now();
    await cancel.click();
    await expect(run).toBeEnabled({ timeout: 5_000 });
    const took = Date.now() - t0;
    process.stdout.write(`cancel to ready: ${took} ms\n`);
    expect(took).toBeLessThan(1500);
    // Keyboard: the run button takes Enter.
    await run.focus();
    const started = Date.now();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Background blurred", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    process.stdout.write(`6 s of 640×360 at 30 fps blurred in ${Date.now() - started} ms\n`);
    await shootWidths(page, "background-blur-done");
    const { path, name } = await saveDownload(page);
    expect(name).toBe("person-16x9-blurred.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.streams[1]?.codec_name).toBe("aac");
    expect(p.duration).toBeCloseTo(6, 1);
    // At 0.5 s (still person over the cup photo): deep inside the person the picture is as it
    // was; well outside it the fine detail is gone.
    const truth = grayFrames(WIDE_MASK, 640, 360)[15] as Uint8Array;
    const src = rgbFrame(WIDE, 0.5);
    const out = rgbFrame(path, 0.5);
    let inErr = 0;
    let inN = 0;
    let detailSrc = 0;
    let detailOut = 0;
    const deep = (x: number, y: number, v: number) => {
      for (let dy = -12; dy <= 12; dy += 6)
        for (let dx = -12; dx <= 12; dx += 6) {
          const xx = Math.min(639, Math.max(0, x + dx));
          const yy = Math.min(359, Math.max(0, y + dy));
          if ((truth[yy * 640 + xx] ?? 0) > 127 !== v) return false;
        }
      return true;
    };
    for (let y = 1; y < 359; y++)
      for (let x = 1; x < 639; x++) {
        const i = y * 640 + x;
        if (deep(x, y, true)) {
          for (let c = 0; c < 3; c++)
            inErr += Math.abs((out[i * 3 + c] ?? 0) - (src[i * 3 + c] ?? 0));
          inN += 3;
        } else if (deep(x, y, false)) {
          const lap = (b: Buffer) =>
            Math.abs(
              4 * (b[i * 3 + 1] ?? 0) -
                (b[(i - 1) * 3 + 1] ?? 0) -
                (b[(i + 1) * 3 + 1] ?? 0) -
                (b[(i - 640) * 3 + 1] ?? 0) -
                (b[(i + 640) * 3 + 1] ?? 0),
            );
          detailSrc += lap(src);
          detailOut += lap(out);
        }
      }
    process.stdout.write(
      `blur: person mean error ${(inErr / inN).toFixed(2)} levels; background detail ${((detailOut / detailSrc) * 100).toFixed(1)}% of the source's\n`,
    );
    expect(inErr / inN).toBeLessThan(6);
    expect(detailOut / detailSrc).toBeLessThan(0.35);
  });

  test("replace with a picture: the person over the new background", async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, "remove-background-from-video", WIDE, REMOVE_TITLE);
    await expect(page.getByTestId("matte-preview")).toHaveAttribute("data-drawn", "1", {
      timeout: 90_000,
    });
    await pick(page, "Image");
    await page
      .locator('input[type="file"][accept*="image/png"]')
      .setInputFiles("tests/fixtures/overlay/backdrop.png");
    await expect(page.getByText("backdrop.png", { exact: true })).toBeVisible();
    const run = page.locator('[data-action="run"]');
    await expect(run).toHaveText("Replace background");
    await shootWidths(page, "background-replace-ready");
    await run.click();
    await expect(page.getByText("Background replaced", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await shootWidths(page, "background-replace-done");
    const { path, name } = await saveDownload(page);
    expect(name).toBe("person-16x9-background.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.duration).toBeCloseTo(6, 1);
    // The top corners (far from the person) show the backdrop, not the original background.
    const back = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        "tests/fixtures/overlay/backdrop.png",
        "-vf",
        "scale=640:360:force_original_aspect_ratio=increase,crop=640:360",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ],
      { maxBuffer: 1 << 28 },
    );
    const out = rgbFrame(path, 2);
    const src = rgbFrame(WIDE, 2);
    let toBack = 0;
    let toSrc = 0;
    for (let y = 0; y < 60; y++)
      for (const x0 of [0, 560])
        for (let x = x0; x < x0 + 80; x++)
          for (let c = 0; c < 3; c++) {
            const i = (y * 640 + x) * 3 + c;
            toBack += Math.abs((out[i] ?? 0) - (back[i] ?? 0));
            toSrc += Math.abs((out[i] ?? 0) - (src[i] ?? 0));
          }
    expect(toBack).toBeLessThan(toSrc / 4);
  });

  test("a video with no person comes out with an empty mask", async ({ page }) => {
    test.setTimeout(300_000);
    const { path } = await saveMask(
      page,
      "blur-video-background",
      "tests/fixtures/sample.mp4",
      BLUR_TITLE,
    );
    const frames = grayFrames(path, 640, 360);
    let on = 0;
    let all = 0;
    for (const f of frames)
      for (const v of f) {
        if (v > 127) on++;
        all++;
      }
    process.stdout.write(
      `no person: ${((on / all) * 100).toFixed(2)}% of pixels marked as a person\n`,
    );
    expect(on / all).toBeLessThan(0.05);
  });
});
