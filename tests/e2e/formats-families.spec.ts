import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Formats and families, end to end: GIF → MP4, legacy format pairs (native remux, native re-encode,
 * ffmpeg-only source) and resize-for-platform pages. Each run downloads the result and reads it back
 * with ffprobe. Chromium only: Playwright's WebKit has no WebCodecs encoder and no ffmpeg.wasm threads.
 * Set FORMATS_SHOTS=<dir> to save screenshots of each state at the project's viewport width.
 */
const shots = process.env.FORMATS_SHOTS;

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const size = page.viewportSize();
  // The phone project runs at 412; the design checks are at 390, so narrow it for the shot.
  if (size && size.width < 500) await page.setViewportSize({ width: 390, height: size.height });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
  if (size && size.width < 500) await page.setViewportSize(size);
};

/** Workspace in view, for screenshots of the stage rather than the header. */
const toStage = (page: Page) =>
  page.getByRole("region", { name: "Workspace" }).scrollIntoViewIfNeeded();

const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).include("main").analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
};

interface Probe {
  format: string;
  codec: string;
  width: number;
  height: number;
  duration: number;
  frames: number;
  audio?: string;
  bytes: number;
}

async function probeDownload(page: Page, timeout = 180_000): Promise<Probe> {
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout });
  const href = await download.getAttribute("href");
  const name = (await download.getAttribute("download")) ?? "out.bin";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const dir = mkdtempSync(join(tmpdir(), "formats-"));
  const path = join(dir, name);
  const buf = Buffer.from(b64, "base64");
  writeFileSync(path, buf);
  const out = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,nb_read_frames:format=duration,format_name",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as {
    streams: {
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      nb_read_frames?: string;
    }[];
    format: { duration: string; format_name: string };
  };
  const v = out.streams.find((s) => s.codec_type === "video");
  const a = out.streams.find((s) => s.codec_type === "audio");
  return {
    format: out.format.format_name,
    codec: v?.codec_name ?? "",
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    duration: Number(out.format.duration),
    frames: Number(v?.nb_read_frames ?? 0),
    audio: a?.codec_name,
    bytes: buf.length,
  };
}

const drop = (page: Page, fixture: string) =>
  page.locator('input[type="file"]').setInputFiles(`tests/fixtures/${fixture}`);

test.describe("formats and families", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("gif-to-mp4: idle, ready, done with a playing MP4 and the size saved", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/gif-to-mp4");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Convert GIF to MP4");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("Drop a GIF to turn it into an MP4");
    await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", /image\/gif/);
    await toStage(page);
    await shot(page, "gif-idle");

    await drop(page, "sample.gif");
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    await expect(convert).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/20 frames · 2\.0\s*s per loop/)).toBeVisible();
    await expect(page.getByText(/301×201 becomes 300×200/)).toBeVisible();
    await expect(page.getByAltText(/The GIF sample\.gif/)).toBeVisible();
    await axe(page);
    await toStage(page);
    await shot(page, "gif-ready");

    // Two plays: 40 frames, 4 s.
    await page.getByText("2 times", { exact: true }).click();
    await expect(page.getByText(/Output 300×200 MP4, 4\.0\s*s, 40 frames/)).toBeVisible();
    await convert.click();
    const p = await probeDownload(page);
    expect(p.codec).toBe("h264");
    expect(p.width).toBe(300);
    expect(p.height).toBe(200);
    expect(p.frames).toBe(40);
    expect(p.duration).toBeGreaterThan(3.8);
    expect(p.duration).toBeLessThan(4.2);
    expect(p.audio).toBeUndefined();
    await expect(page.getByText(/^Now an MP4: .*(smaller|larger) than the GIF$/)).toBeVisible();
    // The preview slot now plays the MP4.
    await expect(zone.locator("video")).toHaveCount(1);
    // A 33 KB result is under every size limit, so compressing is not offered as the next step.
    await expect(zone.getByRole("link", { name: "Compress video" })).toHaveCount(0);
    await toStage(page);
    await shot(page, "gif-done");
    expect(uploads).toEqual([]);
  });

  const pairs = [
    {
      name: "ts-to-mp4: native remux, streams copied",
      slug: "ts-to-mp4",
      fixture: "sample.m2t",
      prompt: "Drop a TS file",
      head: /Lossless copy to MP4/,
      done: "Now an MP4: copied with no quality lost",
      codec: "h264",
      audio: "aac",
      ext: /\.mp4$/,
      shotName: "pair-ts",
    },
    {
      name: "mov-to-webm: native re-encode to VP9 and Opus",
      slug: "mov-to-webm",
      fixture: "sample.mov",
      prompt: "Drop a MOV file",
      head: /Re-encode to WebM/,
      done: "Now a WebM: re-encoded to VP9",
      codec: "vp9",
      audio: "opus",
      ext: /\.webm$/,
      shotName: "pair-mov-webm",
    },
    {
      name: "mpeg-to-mp4: ffmpeg-only source re-encoded",
      slug: "mpeg-to-mp4",
      fixture: "sample.mpg",
      prompt: "Drop an MPEG file",
      head: /Re-encode to MP4/,
      done: "Now an MP4: re-encoded to H.264",
      codec: "h264",
      audio: "aac",
      ext: /\.mp4$/,
      shotName: "pair-mpeg",
    },
    {
      name: "avi-to-mp4: ffmpeg-only source re-encoded, the MP4 plays when done",
      slug: "avi-to-mp4",
      fixture: "sample.avi",
      prompt: "Drop an AVI file",
      head: /Re-encode to MP4/,
      done: "Now an MP4: re-encoded to H.264",
      codec: "h264",
      audio: "mp3",
      ext: /\.mp4$/,
      shotName: "pair-avi",
      playsWhenDone: true,
    },
    {
      name: "flv-to-mp4: ffmpeg-only source, H.264 copied",
      slug: "flv-to-mp4",
      fixture: "sample.flv",
      prompt: "Drop an FLV file",
      head: /Lossless copy to MP4/,
      done: "Now an MP4: copied with no quality lost",
      codec: "h264",
      audio: "aac",
      ext: /\.mp4$/,
    },
    {
      name: "mts-to-mp4: picture copied, AC-3 sound re-encoded",
      slug: "mts-to-mp4",
      fixture: "sample.m2ts",
      prompt: "Drop an MTS file",
      head: /Picture copied, sound re-encoded to MP4/,
      done: "Now an MP4: picture copied, sound re-encoded",
      codec: "h264",
      audio: "aac",
      ext: /\.mp4$/,
    },
    {
      name: "3gp-to-mp4: H.263 in a native container goes to ffmpeg",
      slug: "3gp-to-mp4",
      fixture: "sample.3gp",
      prompt: "Drop a 3GP file",
      head: /Re-encode to MP4/,
      done: "Now an MP4: re-encoded to H.264",
      codec: "h264",
      audio: "aac",
      ext: /\.mp4$/,
    },
  ];

  for (const c of pairs) {
    test(c.name, async ({ page }) => {
      test.setTimeout(240_000);
      const uploads = trackUploads(page);
      await page.goto(`/${c.slug}`);
      const zone = page.getByRole("region", { name: "Workspace" });
      await expect(zone).toContainText(c.prompt);
      if (c.shotName) {
        await toStage(page);
        await shot(page, `${c.shotName}-idle`);
      }
      await drop(page, c.fixture);
      const convert = page.getByRole("button", { name: "Convert", exact: true });
      await expect(convert).toBeVisible({ timeout: 150_000 });
      await expect(page.getByText(c.head)).toBeVisible();
      await axe(page);
      if (c.shotName) {
        await toStage(page);
        await shot(page, `${c.shotName}-ready`);
      }
      await convert.click();
      const p = await probeDownload(page);
      expect(p.codec).toBe(c.codec);
      expect(p.audio).toBe(c.audio);
      expect(p.duration).toBeGreaterThan(2.5);
      expect(p.duration).toBeLessThan(3.5);
      await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute("download", c.ext);
      await expect(page.getByText(c.done)).toBeVisible();
      if (c.playsWhenDone) {
        await expect(zone.locator("video")).toHaveCount(1);
        await expect(zone.getByText(/Browsers cannot play/)).toHaveCount(0);
      }
      if (c.shotName) {
        await toStage(page);
        await shot(page, `${c.shotName}-done`);
      }
      expect(uploads).toEqual([]);
    });
  }

  test("resize for TikTok: target before a file, bars for landscape, 9:16 H.264", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/resize-video-for-tiktok");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("Drop a video to resize it for TikTok");
    await expect(zone).toContainText("9:16 · 1080×1920");
    await toStage(page);
    await shot(page, "tiktok-idle");
    await drop(page, "sample.mp4");
    const resize = page.getByRole("button", { name: "Resize", exact: true });
    await expect(resize).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("TikTok · 9:16 · 1080×1920")).toBeVisible();
    // Landscape source: bars suggested, the 360-pixel result said to be under the ceiling.
    await expect(page.getByRole("radio", { name: "Add bars" })).toBeChecked();
    await expect(page.getByText(/The result is 360×640, smaller than 1080×1920/)).toBeVisible();
    await expect(page.getByText(/Output 360×640/)).toBeVisible();
    await expect(
      page.getByText(/this result has 360.*Start from a larger recording/),
    ).toBeVisible();
    await axe(page);
    await toStage(page);
    await shot(page, "tiktok-ready");
    await resize.click();
    const p = await probeDownload(page);
    expect(p.codec).toBe("h264");
    expect([p.width, p.height]).toEqual([360, 640]);
    expect(p.audio).toBe("aac");
    await expect(page.getByText("Resized for TikTok: 360×640")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      /-tiktok\.mp4$/,
    );
    await toStage(page);
    await shot(page, "tiktok-done");
    expect(uploads).toEqual([]);
  });

  test("resize for YouTube Shorts: shape choice in idle, 1440×2560 scaled to 1080×1920", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/resize-video-for-youtube-shorts");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("9:16 · 1080×1920");
    await page.getByRole("radio", { name: /1:1/ }).locator("xpath=..").click();
    await expect(zone).toContainText("1:1 · 1080×1080");
    await page.getByRole("radio", { name: /9:16/ }).locator("xpath=..").click();
    await toStage(page);
    await shot(page, "shorts-idle");
    await drop(page, "sample-vertical.mp4");
    const resize = page.getByRole("button", { name: "Resize", exact: true });
    await expect(resize).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/Shape kept, scaled down from 1440×2560 to 1080×1920/),
    ).toBeVisible();
    await axe(page);
    await toStage(page);
    await shot(page, "shorts-ready");
    await resize.click();
    const p = await probeDownload(page);
    expect(p.codec).toBe("h264");
    expect([p.width, p.height]).toEqual([1080, 1920]);
    await expect(page.getByText("Resized for YouTube Shorts: 1080×1920")).toBeVisible();
    await toStage(page);
    await shot(page, "shorts-done");
    expect(uploads).toEqual([]);
  });
});
