import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { aacEncodes } from "./codecs";

/**
 * A browser without a WebCodecs AAC encoder (Chromium on Linux, GitHub's runner) writes Opus in MP4
 * and MKV and 16-bit PCM in MOV (engines/sound-codec). Here Chromium runs with its platform encoder
 * switched off, in the page and its workers alike, as it is on Linux: each page's ready line must
 * name the codec the downloaded file has, and the jobs that failed there after the start must make a
 * file. The same pages with AAC are covered by their own specs.
 */
test.use({ launchOptions: { args: ["--disable-features=PlatformAudioEncoder"] } });

const FX = "tests/fixtures/";

interface Case {
  slug: string;
  files: string[];
  choose?: (page: Page) => Promise<void>;
  /** What the ready line says about the sound. */
  line: RegExp;
  /** ffprobe's codec_name for the output's sound. */
  codec: RegExp;
}

const cases: Case[] = [
  {
    slug: "change-video-volume",
    files: ["sample.mp4"],
    line: /the sound is encoded once to Opus at 192\skbps/,
    codec: /^opus$/,
  },
  {
    slug: "replace-audio-in-video",
    files: ["sample.mp4", "sample.mp3"],
    line: /encoded to Opus at 192\skbps/,
    codec: /^opus$/,
  },
  {
    // AAC the container holds is joined packet for packet, not re-encoded.
    slug: "crop-video",
    files: ["sample.mp4"],
    choose: (page) => page.getByRole("radio", { name: /^1:1/ }).locator("xpath=..").click(),
    line: /The sound is copied as it is/,
    codec: /^aac$/,
  },
  {
    slug: "crop-video",
    files: ["sample-opus.mp4"],
    choose: (page) => page.getByRole("radio", { name: /^1:1/ }).locator("xpath=..").click(),
    line: /The sound is encoded to Opus/,
    codec: /^opus$/,
  },
  {
    slug: "add-border-to-video",
    files: ["sample.mp4"],
    line: /The sound is copied as it is/,
    codec: /^aac$/,
  },
  {
    slug: "reverse-video",
    files: ["sample.mp4"],
    line: /The sound is reversed too and encoded to Opus/,
    codec: /^opus$/,
  },
  {
    slug: "fade-video",
    files: ["sample.mp4"],
    line: /The sound fades with the picture and is encoded to Opus/,
    codec: /^opus$/,
  },
  {
    // MOV gets 16-bit PCM, which QuickTime plays, rather than Opus.
    slug: "fade-video",
    files: ["sample-pcm.mov"],
    line: /The sound fades with the picture and is written as 16.bit PCM/,
    codec: /^pcm_s16/,
  },
  {
    slug: "add-watermark-to-video",
    files: ["sample.mp4"],
    line: /sound copied/,
    codec: /^aac$/,
  },
  {
    slug: "audio-to-video",
    files: ["sample.mp3"],
    line: /The sound is encoded once to Opus at 192\skbps/,
    codec: /^opus$/,
  },
];

async function download(page: Page): Promise<string> {
  const link = page.locator('[data-action="download"]').first();
  const href = await link.getAttribute("href");
  const name = (await link.getAttribute("download")) ?? "out.bin";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const path = join(mkdtempSync(join(tmpdir(), "no-aac-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}

const soundCodec = (path: string) =>
  execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "csv=p=0",
    path,
  ])
    .toString()
    .trim();

test.describe("no AAC encoder", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "a Chromium switch");

  for (const c of cases) {
    test(`${c.slug} (${c.files[0]}): the line names the codec the file has`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto(`/${c.slug}`);
      expect(await aacEncodes(page), "the platform AAC encoder is off").toBe(false);
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles(c.files.map((f) => FX + f));
      const run = page.locator('[data-action="run"]');
      if (c.slug === "add-watermark-to-video") {
        // The logo's own well.
        await expect(run).toBeVisible({ timeout: 60_000 });
        await page
          .getByRole("region", { name: "Workspace" })
          .locator('input[type="file"][accept*="image"]')
          .first()
          .setInputFiles(`${FX}logo.png`);
      }
      await c.choose?.(page);
      await expect(run).toBeEnabled({ timeout: 60_000 });
      const status = page.locator("[data-action-bar]").getByRole("status");
      await expect(status).toContainText(c.line, { timeout: 30_000 });
      await expect(status).not.toContainText(/\bAAC\b/);
      await run.click();
      const done = page.locator('[data-action="download"]');
      const failed = page.getByRole("region", { name: "Workspace" }).locator('[role="alert"]');
      await expect(done.first().or(failed.first())).toBeVisible({ timeout: 150_000 });
      if (await failed.count()) throw new Error(`Failed: ${await failed.first().textContent()}`);
      expect(soundCodec(await download(page))).toMatch(c.codec);
    });
  }

  test("a cut MKV (Shorts' 3-minute cap): the sound is encoded, as the line says", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // 3:05 of AAC in MKV, made here: longer than the cap, so the default keeps the first 3:00.
    const src = join(mkdtempSync(join(tmpdir(), "no-aac-src-")), "long.mkv");
    execFileSync("ffmpeg", [
      ...["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10"],
      ...["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "185"],
      ...["-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-ac", "2", src],
    ]);
    await page.goto("/resize-video-for-youtube-shorts");
    await page.locator('input[type="file"]').first().setInputFiles(src);
    const run = page.locator('[data-action="run"]');
    await expect(run).toBeEnabled({ timeout: 60_000 });
    const status = page.locator("[data-action-bar]").getByRole("status");
    await expect(status).toContainText(/Only the first 3:00/, { timeout: 30_000 });
    await expect(status).toContainText(/The sound is encoded to Opus/);
    await run.click();
    const done = page.locator('[data-action="download"]');
    const failed = page.getByRole("region", { name: "Workspace" }).locator('[role="alert"]');
    await expect(done.first().or(failed.first())).toBeVisible({ timeout: 200_000 });
    if (await failed.count()) throw new Error(`Failed: ${await failed.first().textContent()}`);
    const out = await download(page);
    expect(out).toMatch(/\.mkv$/);
    expect(soundCodec(out)).toBe("opus");
  });
});
