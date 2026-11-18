import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { edgeMask, H, truthFrame, W } from "./greenscreen-scene";
import {
  pictureToPage,
  pixels,
  probe,
  rms,
  saveDownload,
  shootWidths,
  trackUploads,
} from "./overlay-helpers";

/**
 * Green screen, end to end, on a synthetic shot with a known answer (./greenscreen-scene): a
 * swaying subject with soft edges and spill in front of an unevenly lit green screen. The result
 * over the backdrop picture is compared with the right answer, and so is local FFmpeg's chromakey +
 * despill over the same backdrop, with the same key colour and its best settings found by search
 * (and without an encode, which favours FFmpeg). The screen colour must be found on its own, a tap
 * must pick one, a background video must loop or hold, and "No sound" must drop the sound.
 * Encoding needs WebCodecs: the processing tests run on Chromium.
 */

const FIX = "tests/fixtures/overlay/greenscreen.mp4";
const BACKDROP = "tests/fixtures/overlay/backdrop.png";

function rgbAt(path: string, t: number) {
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

function psnr(a: Uint8Array, b: Uint8Array, mask?: Uint8Array) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (mask && !mask[i]) continue;
    for (let c = 0; c < 3; c++) {
      const d = (a[i * 3 + c] ?? 0) - (b[i * 3 + c] ?? 0);
      s += d * d;
    }
    n += 3;
  }
  return 10 * Math.log10((255 * 255) / (s / n));
}

/** FFmpeg's chromakey + despill over the backdrop, one raw frame at `t`. */
function ffmpegKey(t: number, key: string, similarity: number, blend: number) {
  const graph = `[1:v]chromakey=color=${key}:similarity=${similarity}:blend=${blend},despill=type=green[k];[0:v][k]overlay=format=auto,format=rgb24`;
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-loop",
      "1",
      "-i",
      BACKDROP,
      "-ss",
      String(t),
      "-i",
      FIX,
      "-filter_complex",
      graph,
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

async function open(page: Page, file = FIX) {
  await page.goto("/remove-green-screen-from-video");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Remove the green screen from a video",
  );
  await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
    "Drop a green screen video",
  );
  await page.locator('input[type="file"]').first().setInputFiles(file);
  return page.getByRole("button", { name: "Remove green screen", exact: true });
}

const pick = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true }).locator("xpath=..").click();

test.describe("green screen: the page", () => {
  test("finds the screen colour, previews live, takes a tap, has no axe violations", async ({
    page,
  }) => {
    const run = await open(page);
    await expect(page.getByText("Found at the picture's edges.", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await expect(run).toBeEnabled();
    await expect(
      page.getByText(
        /^Green screen keyed out, on #000000 · H\.264 640×360 · sound copied · on this device$/,
      ),
    ).toBeVisible();
    await expect(page.getByTestId("key-preview")).toHaveAttribute("data-drawn", "1");
    await shootWidths(page, "greenscreen-ready");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // A tap on the screen (top left corner area) picks its colour there.
    const at = await pictureToPage(page, W);
    const p = at(30, 30);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByText("Picked from the picture.", { exact: false })).toBeVisible();
    // Image or Video without a file blocks the run until one is chosen.
    await pick(page, "Image");
    await expect(page.getByText("Choose a background picture first.")).toBeVisible();
    await expect(run).toBeDisabled();
    await pick(page, "Colour");
    await expect(run).toBeEnabled();
    // Detect again returns to the edges' colour.
    await page.getByRole("button", { name: "Detect again" }).click();
    await expect(page.getByText("Found at the picture's edges.", { exact: false })).toBeVisible();
  });

  test("a picture with no screen at its edges asks for a tap instead of guessing", async ({
    page,
  }) => {
    const run = await open(page, "tests/fixtures/overlay/plate-a.mp4");
    await expect(
      page.getByText("No coloured screen fills the picture's edges.", { exact: false }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(run).toBeDisabled();
  });
});

test.describe("green screen: results", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("over a picture: closer to the right answer than FFmpeg's chromakey, edges most of all", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const uploads = trackUploads(page);
    const run = await open(page);
    await expect(run).toBeEnabled({ timeout: 30_000 });
    const key =
      (
        await page
          .getByText(/^#[0-9A-F]{6}$/)
          .first()
          .textContent()
      )?.trim() ?? "";
    await pick(page, "Image");
    await page.locator('input[type="file"][accept*="image/png"]').setInputFiles(BACKDROP);
    await expect(page.getByText("backdrop.png", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Green screen keyed out, on backdrop\.png · /)).toBeVisible();
    await shootWidths(page, "greenscreen-backdrop");
    await run.click();
    await expect(page.getByText("Background replaced", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await shootWidths(page, "greenscreen-done");
    const { path, name } = await saveDownload(page);
    expect(name).toBe("greenscreen-keyed.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.streams[1]?.codec_name).toBe("aac");
    expect(p.duration).toBeCloseTo(3, 1);
    const hexKey = `0x${key.slice(1)}`;
    const lines: string[] = [`key ${key}`];
    for (const t of [0.3, 1, 2.2]) {
      const truth = truthFrame(t);
      const edge = edgeMask(t);
      const ours = rgbAt(path, t);
      const oursAll = psnr(ours, truth);
      const oursEdge = psnr(ours, truth, edge);
      // FFmpeg at its best of a small search, and at a common starting point.
      let best = { all: 0, edge: 0, at: "" };
      for (const [sim, blend] of [
        [0.03, 0.02],
        [0.05, 0.03],
        [0.07, 0.05],
        [0.1, 0.05],
      ] as const) {
        const f = ffmpegKey(t, hexKey, sim, blend);
        const all = psnr(f, truth);
        if (all > best.all) best = { all, edge: psnr(f, truth, edge), at: `${sim}/${blend}` };
      }
      lines.push(
        `t ${t}: ours ${oursAll.toFixed(2)} dB (edges ${oursEdge.toFixed(2)}); ffmpeg best ${best.at} ${best.all.toFixed(2)} dB (edges ${best.edge.toFixed(2)})`,
      );
      expect(oursAll).toBeGreaterThan(33);
      expect(oursAll).toBeGreaterThan(best.all - 0.5);
      expect(oursEdge).toBeGreaterThan(best.edge + 3);
    }
    process.stdout.write(`green screen vs truth\n${lines.join("\n")}\n`);
    expect(uploads).toEqual([]);
  });

  test("a shorter background video holds its last frame or loops; no sound drops the sound", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const corner = { x: 4, y: 4, w: 60, h: 40 };
    const outs: Record<string, string> = {};
    for (const mode of ["Hold last frame", "Loop"]) {
      const run = await open(page);
      await expect(run).toBeEnabled({ timeout: 30_000 });
      await pick(page, "Video");
      // sample-b.mp4: 2 s of the negated test pattern, which moves.
      await page
        .locator('input[type="file"][accept*="video/mp4"]')
        .last()
        .setInputFiles("tests/fixtures/sample-b.mp4");
      await expect(page.getByText("sample-b.mp4", { exact: true })).toBeVisible();
      await pick(page, mode);
      await page.getByText("More options", { exact: true }).click();
      await pick(page, "No sound");
      await run.click();
      const { path } = await saveDownload(page);
      const p = probe(path);
      expect(p.streams.map((s) => s.codec_type)).toEqual(["video"]);
      expect(p.duration).toBeCloseTo(3, 1);
      outs[mode] = path;
    }
    const hold = outs["Hold last frame"] as string;
    const loop = outs.Loop as string;
    // Held: the corner (screen, so background) does not change after 2 s. Looped: it does.
    expect(
      rms(pixels(hold, 2.3, corner, "rgb24"), pixels(hold, 2.8, corner, "rgb24")),
    ).toBeLessThan(4);
    expect(
      rms(pixels(loop, 2.3, corner, "rgb24"), pixels(loop, 2.8, corner, "rgb24")),
    ).toBeGreaterThan(8);
    // Looped, 2.3 s shows the background's 0.3 s, the same as at 0.3 s.
    expect(
      rms(pixels(loop, 2.3, corner, "rgb24"), pixels(loop, 0.3, corner, "rgb24")),
    ).toBeLessThan(6);
  });
});
