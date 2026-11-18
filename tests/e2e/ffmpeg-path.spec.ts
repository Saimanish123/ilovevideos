import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * QA 2026-10-08 fixes on the ffmpeg.wasm path and the GIF timing, end to end in Chromium: every sound
 * track of an MKV kept in MP4 with its language; FLAC copied into MP4 (FFmpeg 5.1 needs -strict -2);
 * change speed picking the right frames; Vorbis from 96 kHz; GIF frame delays that add up to the
 * range. Downloads are read back with the local ffprobe/ffmpeg (test-only). No request may carry a
 * body over 1 KB.
 */
const fx = (name: string) => join("tests/fixtures", name);

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

const pick = (page: Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name, exact: true }) }).click();

async function download(page: Page, ext: RegExp): Promise<string> {
  const link = page.getByRole("link", { name: "Download" });
  await expect(link).toBeVisible({ timeout: 180_000 });
  await expect(link).toHaveAttribute("download", ext);
  const href = await link.getAttribute("href");
  const name = (await link.getAttribute("download")) ?? "out.bin";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const path = join(mkdtempSync(join(tmpdir(), "ffpath-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}

interface Stream {
  codec_type: string;
  codec_name: string;
  sample_rate?: string;
  tags?: Record<string, string>;
}
const streams = (path: string): Stream[] =>
  (
    JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,sample_rate:stream_tags=language",
        "-of",
        "json",
        path,
      ]).toString(),
    ) as { streams: Stream[] }
  ).streams;

const audioMd5 = (path: string) =>
  execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-f", "md5", "-"])
    .toString()
    .trim();

/** Decoded sound (mono f32 at 44.1 kHz): sample count and the first click (|x| > 0.3), in samples. */
function clicks(path: string): { samples: number; first: number } {
  const raw = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-ar", "44100", "-f", "f32le", "-"],
    { maxBuffer: 1 << 26 },
  ).stdout;
  const pcm = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  return { samples: pcm.length, first: pcm.findIndex((x) => Math.abs(x) > 0.3) };
}

/** What local FFmpeg 9 (which honours Matroska CodecDelay) makes of the same source. */
function localReference(source: string, args: string[]): { samples: number; first: number } {
  const out = join(mkdtempSync(join(tmpdir(), "ffref-")), "ref.mp3");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", source, ...args, out]);
  return clicks(out);
}

test.describe("ffmpeg.wasm path and GIF timing (QA 2026-10-08)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "ffmpeg.wasm threads need Chromium here",
  );

  test("MKV with two AC-3 tracks to MP4 keeps both, as AAC, with eng and fra", async ({ page }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await page.goto("/mkv-to-mp4");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-ac3-tracks.mkv"));
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    await expect(convert).toBeVisible({ timeout: 30_000 });
    await convert.click();
    const out = await download(page, /\.mp4$/);
    const s = streams(out);
    expect(s.map((x) => [x.codec_type, x.codec_name, x.tags?.language])).toEqual([
      ["video", "h264", "und"],
      ["audio", "aac", "eng"],
      ["audio", "aac", "fra"],
    ]);
    await expect(
      page.getByText(/2 sound tracks kept: eng AC-3 → AAC, fra AC-3 → AAC/),
    ).toBeVisible();
    expect(uploads).toEqual([]);
  });

  test("MPEG-4 Part 2 with FLAC in MKV to MP4: picture re-encoded, FLAC copied bit for bit", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/mkv-to-mp4");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-mpeg4-flac.mkv"));
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    await expect(convert).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sound copied/).first()).toBeVisible();
    await convert.click();
    const out = await download(page, /\.mp4$/);
    expect(streams(out).map((x) => x.codec_name)).toEqual(["h264", "flac"]);
    expect(audioMd5(out)).toBe(audioMd5(fx("sample-mpeg4-flac.mkv")));
  });

  test("change speed 2×: output frame k is source frame 2k, 30 frames for 1 s", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/change-video-speed");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-indexed.mp4"));
    const button = page.getByRole("button", { name: "Change speed", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("speed-length")).toHaveText("2.0 s → 1.0 s");
    await button.click();
    const out = await download(page, /-2x\.mp4$/);
    const raw = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", out, "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
      { maxBuffer: 1 << 26 },
    ).stdout;
    const W = 320;
    const index: number[] = [];
    for (let at = 0; at + W * 180 <= raw.length; at += W * 180) {
      const level = (x: number) => Math.round(((raw[at + 90 * W + x] ?? 0) - 8) / 16);
      index.push(level(80) + 16 * level(240));
    }
    expect(index).toEqual(Array.from({ length: 30 }, (_, k) => 2 * k));
  });

  test("96 kHz WAV to OGG: resampled to 48 kHz for Vorbis instead of failing", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/audio-converter");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-96k.wav"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await pick(page, "OGG");
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const out = await download(page, /\.ogg$/);
    const a = streams(out).find((x) => x.codec_type === "audio");
    expect(a?.codec_name).toBe("vorbis");
    expect(a?.sample_rate).toBe("48000");
    await expect(page.getByText(/Vorbis · 192\skbps · 48\skHz/)).toBeVisible();
  });

  test("GIF from an MPEG-TS that starts at 1.4 s: the range is from the file's start", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/video-to-gif");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.m2t"));
    const button = page.getByRole("button", { name: "Make GIF", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await page.locator("#end").fill("1");
    await page.locator("#end").press("Enter");
    await page.getByRole("radio", { name: "10", exact: true }).check({ force: true });
    await button.click();
    // Source times 0 to 1 s lie before the first frame (1.42 s): before the fix, no frame decoded.
    const out = await download(page, /\.gif$/);
    const frames = execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      out,
    ])
      .toString()
      .trim();
    expect(Number(frames)).toBe(10);
  });

  test("GIF fast mode: 24 frames at 12 fps last 2.00 s (delays 8 and 9 cs)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/video-to-gif");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    const button = page.getByRole("button", { name: "Make GIF", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await page.locator("#end").fill("2");
    await page.locator("#end").press("Enter");
    await page.getByRole("radio", { name: "12", exact: true }).check({ force: true });
    await button.click();
    const out = await download(page, /\.gif$/);
    const b = readFileSync(out);
    const delays: number[] = [];
    for (let i = 0; i + 5 < b.length; i++)
      if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04)
        delays.push((b[i + 4] ?? 0) | ((b[i + 5] ?? 0) << 8));
    expect(delays).toHaveLength(24);
    expect(delays.reduce((s, d) => s + d, 0)).toBe(200);
    expect(new Set(delays)).toEqual(new Set([8, 9]));
  });
  for (const [fixture, what, args] of [
    ["sample-clicks.mkv", "AAC re-encoded", ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]],
  ] as const) {
    test(`MKV to MP3 (${what}): the sound starts where local ffmpeg starts it (CodecDelay)`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.goto("/mkv-to-mp3");
      await page.locator('input[type="file"]').setInputFiles(fx(fixture));
      const convert = page.getByRole("button", { name: "Convert", exact: true });
      await expect(convert).toBeVisible({ timeout: 30_000 });
      await convert.click();
      const out = await download(page, /\.mp3$/);
      const got = clicks(out);
      const want = localReference(fx(fixture), [...args]);
      // Before: 1024 samples late (23.2 ms at 44.1 kHz) and 1024 samples long.
      expect(Math.abs(got.first - want.first)).toBeLessThanOrEqual(2);
      expect(Math.abs(got.samples - want.samples)).toBeLessThanOrEqual(2);
      // The result line names the real rate (it read "NaN kHz" when no rate was set).
      await expect(page.getByText(/MP3 · 192\skbps · 44\.1\skHz/)).toBeVisible();
    });
  }
  test("an odd-size WebM to MP4: 641×361 VP9 becomes a 640×360 H.264 MP4, and the plan says so", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/webm-to-mp4");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-odd.webm"));
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    await expect(convert).toBeVisible({ timeout: 30_000 });
    await expect(convert).toBeEnabled({ timeout: 30_000 });
    await convert.click();
    // QA 2026-10-08: the page refused this file (H.264 probed at the odd source size). The encoder
    // now writes the even size, cutting the last column and row (ADR-0060).
    const out = await download(page, /\.mp4$/);
    const v = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height",
        "-of",
        "json",
        out,
      ]).toString(),
    ) as { streams: { codec_name: string; width: number; height: number }[] };
    expect(v.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    await expect(page.getByRole("region", { name: "Workspace" })).not.toContainText("VP9 video");
  });

  test("an odd-size AVI on the ffmpeg.wasm route: libx264 gets the even cut, and the command shows it", async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const avi = info.outputPath("odd.avi");
    // lavfi sources round odd sizes to even, so the odd fixture is the source (MPEG-4 Part 2 keeps
    // 641×361; the browser cannot read AVI, so this runs on ffmpeg.wasm).
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      fx("sample-odd.webm"),
      "-t",
      "1",
      "-c:v",
      "mpeg4",
      "-q:v",
      "3",
      "-c:a",
      "libmp3lame",
      avi,
    ]);
    await page.goto("/avi-to-mp4");
    await page.locator('input[type="file"]').setInputFiles(avi);
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    await expect(convert).toBeEnabled({ timeout: 60_000 });
    await convert.click();
    const out = await download(page, /\.mp4$/);
    const v = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height",
        "-of",
        "json",
        out,
      ]).toString(),
    ) as { streams: { codec_name: string; width: number; height: number }[] };
    expect(v.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone.locator("details pre").first()).toContainText("-vf crop=640:360:0:0");
  });
});
