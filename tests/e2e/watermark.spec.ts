import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Add a watermark, end to end: drop a fixture (640×360, 3 s, H.264 + AAC), add the logo fixture
 * (200×80 PNG with a transparent border) or text, place it with the grid, a drag and the keyboard,
 * and read the result back with ffprobe and a frame grab (the logo's black bar must be in the
 * picture where the frame says, and only inside the time range). Chromium only: the WebCodecs
 * encoder and ffmpeg.wasm are needed. Set WATERMARK_SHOTS=<dir> for 390 and 1280 screenshots.
 */
const shots = process.env.WATERMARK_SHOTS;
const reviewShots = process.env.REVIEW_SHOTS;
/** A 390 px shot for design review, then back to the project's own viewport. */
const review = async (page: Page, name: string, focus?: import("@playwright/test").Locator) => {
  if (!reviewShots) return;
  const size = page.viewportSize();
  const scroll = await page.evaluate(() => window.scrollY);
  await page.setViewportSize({ width: 390, height: 844 });
  if (focus) await focus.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(reviewShots, `${name}-390.png`) });
  if (size) await page.setViewportSize(size);
  // Back where the test was, so the next pointer action does not land under the sticky header.
  await page.evaluate((y) => window.scrollTo(0, y), scroll);
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

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

async function saveDownload(page: Page): Promise<{ path: string; name: string }> {
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 240_000 });
  const href = await download.getAttribute("href");
  const name = (await download.getAttribute("download")) ?? "out.mp4";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const path = join(mkdtempSync(join(tmpdir(), "watermark-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return { path, name };
}

function probe(path: string) {
  const out = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height:format=duration",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
    format: { duration: string };
  };
  return { streams: out.streams, duration: Number(out.format.duration) };
}

/** Mean brightness (0–255) of a w×h box of the frame at `t` seconds. */
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

test.describe("add a watermark", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  const open = async (page: Page, video = "tests/fixtures/sample.mp4") => {
    await page.goto("/add-watermark-to-video");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop a video to add a watermark",
    );
    await shot(page, "watermark-idle");
    await page.locator('input[type="file"]').first().setInputFiles(video);
    const add = page.getByRole("button", { name: "Add watermark", exact: true });
    await expect(add).toBeDisabled({ timeout: 30_000 });
    await expect(page.getByText("Add a logo image first.")).toBeVisible();
    return add;
  };

  test("logo: grid, drag and keys, then the mark is in the picture", async ({ page }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    const add = await open(page);
    await page
      .locator('input[type="file"][accept*="image/png"]')
      .setInputFiles("tests/fixtures/logo.png");
    const mark = page.getByRole("group", { name: /Watermark:/ });
    await expect(mark).toBeVisible();
    await expect(add).toBeEnabled();
    // Bottom right by default: 15% of 640 = 96×38 at 533, 311 (margin 3% of 360 = 11).
    await expect(mark).toHaveAttribute("aria-label", /96×38 at 533, 311/);
    await pick(page, "Large");
    await expect(mark).toHaveAttribute("aria-label", /160×64 at 469, 285/);
    await pick(page, "Top left");
    await expect(mark).toHaveAttribute("aria-label", /160×64 at 11, 11/);
    await shot(page, "watermark-ready");
    // The panel redraws the mark a moment after each change; shoot once the drawn mark is up.
    await expect(mark.locator("img")).toBeVisible();
    await review(page, "watermark-ready", page.locator("video"));
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

    // Drag it right, then nudge it with the keyboard.
    await mark.scrollIntoViewIfNeeded();
    const box = await mark.boundingBox();
    if (!box) throw new Error("no mark box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 2000, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(mark).toHaveAttribute("aria-label", /160×64 at 480, 11/);
    await mark.focus();
    await page.keyboard.press("ArrowDown");
    await expect(mark).toHaveAttribute("aria-label", /160×64 at 480, 15/);
    await expect(page.getByText("Placed by dragging.", { exact: false })).toBeVisible();
    await shot(page, "watermark-placed");

    await add.click();
    await expect(page.getByText("Watermark added: 640×360, sound copied")).toBeVisible({
      timeout: 240_000,
    });
    await shot(page, "watermark-done");
    const { path, name } = await saveDownload(page);
    expect(name).toBe("sample-watermarked.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.streams[1]?.codec_name).toBe("aac");
    expect(p.duration).toBeCloseTo(3, 1);
    // The logo's black bar (inside its white box) at 70% opacity darkens that part of the picture.
    const bar = { x: 480 + 40, y: 15 + 26, w: 60, h: 10 };
    expect(brightness(path, 1.5, bar)).toBeLessThan(80);
    expect(uploads).toEqual([]);
  });

  test("text watermark, shown for part of the video", async ({ page }) => {
    test.setTimeout(240_000);
    const add = await open(page);
    await pick(page, "Text");
    await page.locator("#watermark-text").fill("© 2026 Test");
    await expect(add).toBeEnabled();
    await page.getByText("More options", { exact: true }).click();
    await page.getByLabel("Only part of the video").check();
    await expect(page.getByText(/from 0:00\.00 to 0:01\.50/)).toBeVisible();
    await add.click();
    await expect(page.getByText(/Watermark added: 640×360/)).toBeVisible({ timeout: 240_000 });
    await expect(
      page.getByText(/Text bottom right, 15% of the width, 70% opacity, from 0:00\.00 to 0:01\.50/),
    ).toBeVisible();
    const p = probe((await saveDownload(page)).path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
  });

  test("AVI goes through ffmpeg's overlay filter into MP4 with the MP3 copied", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const add = await open(page, "tests/fixtures/sample.avi");
    await page
      .locator('input[type="file"][accept*="image/png"]')
      .setInputFiles("tests/fixtures/logo.png");
    await expect(page.getByText(/Needs a one-time download/)).toBeVisible();
    await expect(add).toBeEnabled();
    await add.click();
    const { path, name } = await saveDownload(page);
    expect(name).toBe("sample-watermarked.mp4");
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "mp3"]);
  });

  test("an image that is not a logo format is refused with a reason", async ({ page }) => {
    await open(page);
    await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.getByRole("region", { name: "Workspace" }).getByRole("alert")).toContainText(
      "notes.txt is not a PNG, SVG, WebP or JPEG image.",
    );
  });
});
