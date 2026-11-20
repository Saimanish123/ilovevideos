import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Phase 2 audio tools end to end: volume, normalise and fades (on video and audio files), audio
 * sync, audio track selection, silence removal and the standalone audio pages. Every download is
 * read back with the local ffprobe/ffmpeg (test-only): container, codecs, duration, loudness with
 * ffmpeg's own EBU R128 meter, and packet hashes where the picture must be copied. No request may
 * carry a body over 1 KB. Chromium only (WebKit in Playwright has no WebCodecs encoders).
 * Set AUDIO_SHOTS=<dir> for 390/1280 screenshots.
 */
const shots = process.env.AUDIO_SHOTS;
const fx = (name: string) => join("tests/fixtures", name);

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
  const w = page.viewportSize()?.width ?? 0;
  // The workspace alone, so the stage reads at full size; the page around it is covered elsewhere.
  await page
    .getByRole("region", { name: "Workspace" })
    .screenshot({ path: join(shots, `${name}-${w}.png`) });
};

interface Stream {
  codec_type: string;
  codec_name: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
  tags?: Record<string, string>;
}
interface Probe {
  path: string;
  streams: Stream[];
  format: { duration: string; format_name: string; tags?: Record<string, string> };
}

const probe = (path: string): Probe => ({
  path,
  ...(JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,sample_rate,channels,duration:stream_tags=language:format=duration,format_name:format_tags=title,artist",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as Omit<Probe, "path">),
});

/** ffmpeg's EBU R128 meter: integrated loudness (LUFS) and true peak (dBFS, 4× oversampled). */
function r128(path: string): { integrated: number; truePeak: number } {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const log = r.stderr;
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const integrated = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  return { integrated, truePeak };
}

/** MD5 of each packet of the first stream of a type: equal lists mean it was copied. */
const packetHashes = (path: string, stream: "v:0" | "a:0") =>
  execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    stream,
    "-show_packets",
    "-show_data_hash",
    "MD5",
    "-show_entries",
    "packet=data_hash",
    "-of",
    "csv=p=0",
    path,
  ])
    .toString()
    .trim()
    .split("\n");

/**
 * RMS level (dBFS) of the first sound track between two times, mono mix, decoded from the start as
 * a player hears it. Input seeking (`-ss` before `-i`) is not used: on a WebM whose Opus states its
 * CodecDelay, as ffmpeg's own do, `-ss 0` starts on the second packet without decoder warm-up.
 */
function rmsDb(path: string, from: number, to: number): number {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-ss",
      String(from),
      "-t",
      String(to - from),
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-f",
      "f32le",
      "-c:a",
      "pcm_f32le",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  let sum = 0;
  const n = raw.length / 4;
  for (let i = 0; i < n; i++) sum += raw.readFloatLE(i * 4) ** 2;
  return n > 0 && sum > 0 ? 10 * Math.log10(sum / n) : -120;
}

/** Waits for Download, checks the blob and saves it for ffprobe. */
async function download(page: Page, expected: { ext: RegExp; mime: RegExp }): Promise<Probe> {
  const link = page.getByRole("link", { name: "Download" });
  await expect(link).toBeVisible({ timeout: 180_000 });
  await expect(link).toHaveAttribute("download", expected.ext);
  const href = await link.getAttribute("href");
  const name = (await link.getAttribute("download")) ?? "out.bin";
  const { b64, type } = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    const b64 = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
    return { b64, type: blob.type };
  }, href);
  expect(type).toMatch(expected.mime);
  const dir = mkdtempSync(join(tmpdir(), "audio-edits-"));
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return probe(path);
}

const audioStream = (p: Probe) => p.streams.find((s) => s.codec_type === "audio");
const videoStream = (p: Probe) => p.streams.find((s) => s.codec_type === "video");

const axeClean = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .include('section[aria-label="Workspace"]')
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ""}`)).toEqual([]);
};

const choose = async (page: Page, file: string) => {
  await page.locator('input[type="file"]').setInputFiles(fx(file));
};

test.describe("audio edits", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  test("change video volume: +6 dB on the sound, picture copied packet for packet", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/change-video-volume");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("Drop a video to make its sound louder or quieter");
    await shot(page, "volume-idle");
    await choose(page, "sample.mp4");
    const run = page.getByRole("button", { name: "Change volume", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    // The loudness is measured on the page before anything runs.
    await expect(page.getByText(/true peak/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/The picture is copied as it is/)).toBeVisible();
    await axeClean(page);
    await shot(page, "volume-ready");
    await run.click();
    const out = await download(page, { ext: /-louder\.mp4$/, mime: /video\/mp4/ });
    await expect(page.getByText(/Measured: .*LUFS → .*LUFS/)).toBeVisible();
    await shot(page, "volume-done");
    expect(audioStream(out)?.codec_name).toBe("aac");
    expect(Number(out.format.duration)).toBeCloseTo(3, 1);
    expect(packetHashes(out.path, "v:0")).toEqual(packetHashes(fx("sample.mp4"), "v:0"));
    const before = r128(fx("sample.mp4"));
    const after = r128(out.path);
    expect(after.integrated - before.integrated).toBeGreaterThan(5.5);
    expect(after.integrated - before.integrated).toBeLessThan(6.5);
    expect(uploads).toEqual([]);
  });

  test("change audio volume: an MP3 stays MP3 with its tags, the limiter holds −1 dBTP", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/change-audio-volume");
    await choose(page, "sample.mp3");
    const run = page.getByRole("button", { name: "Change volume", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole("slider", { name: "Playback position" })).toBeVisible();
    await expect(page.getByText(/Saved as MP3 at 128/)).toBeVisible();
    await page.getByLabel("Volume change, dB").fill("10");
    await expect(page.getByText(/held down by the limiter/)).toBeVisible({ timeout: 30_000 });
    await axeClean(page);
    await run.click();
    const out = await download(page, { ext: /-louder\.mp3$/, mime: /audio\/mpeg/ });
    expect(audioStream(out)?.codec_name).toBe("mp3");
    expect(out.format.tags?.title).toBe("Two tones");
    const after = r128(out.path);
    // The limiter holds the true peak at −1 dBTP; an MP3 encoder can add a few tenths on top.
    expect(after.truePeak).toBeLessThan(-0.3);
    expect(after.integrated).toBeGreaterThan(r128(fx("sample.mp3")).integrated + 3);
    await expect(page.getByText(/peaks limited by up to/)).toBeVisible();
  });

  test("normalise audio: a WAV reaches −16 LUFS by ffmpeg's own meter", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/normalize-audio");
    await choose(page, "sample.wav");
    const run = page.getByRole("button", { name: "Normalise", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "−16 LUFS" })).toBeChecked();
    await expect(page.getByText(/^After/).first()).toBeAttached({ timeout: 30_000 });
    await axeClean(page);
    await shot(page, "normalize-ready");
    await run.click();
    const out = await download(page, { ext: /-normalized\.wav$/, mime: /audio\/wav/ });
    expect(audioStream(out)?.codec_name).toBe("pcm_s16le");
    const after = r128(out.path);
    expect(Math.abs(after.integrated + 16)).toBeLessThan(0.5);
    expect(after.truePeak).toBeLessThan(-0.8);
  });

  test("normalise a video: the picture is copied and the sound lands on target", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/normalize-audio");
    await choose(page, "sample.webm");
    const run = page.getByRole("button", { name: "Normalise", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await page.locator("label", { has: page.getByRole("radio", { name: "−23 LUFS" }) }).click();
    await run.click();
    const out = await download(page, { ext: /-normalized\.webm$/, mime: /video\/webm/ });
    expect(audioStream(out)?.codec_name).toBe("opus");
    expect(videoStream(out)?.codec_name).toBe("vp9");
    expect(packetHashes(out.path, "v:0")).toEqual(packetHashes(fx("sample.webm"), "v:0"));
    expect(Math.abs(r128(out.path).integrated + 23)).toBeLessThan(0.7);
  });

  test("fade audio: the start rises from silence and the middle is untouched", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/fade-audio");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop an audio file to fade it in and out",
    );
    await choose(page, "sample.wav");
    const run = page.getByRole("button", { name: "Fade", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    // A 4 s file: defaults fit it (0.8 s in, 0.8 s out) and the handles are on the waveform.
    const fadeIn = page.getByRole("slider", { name: "Fade-in length" });
    await expect(fadeIn).toBeVisible();
    await fadeIn.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByText(/Fades in over 1\.8/)).toBeVisible();
    await axeClean(page);
    await shot(page, "fade-ready");
    await run.click();
    const out = await download(page, { ext: /-faded\.wav$/, mime: /audio\/wav/ });
    await shot(page, "fade-done");
    expect(Number(out.format.duration)).toBeCloseTo(4, 1);
    // The first 50 ms are far below the untouched middle; the middle keeps its level.
    const mid = rmsDb(out.path, 1.9, 2.1);
    expect(rmsDb(out.path, 0, 0.05)).toBeLessThan(mid - 25);
    expect(Math.abs(mid - rmsDb(fx("sample.wav"), 1.9, 2.1))).toBeLessThan(0.1);
    expect(rmsDb(out.path, 3.95, 4)).toBeLessThan(mid - 20);
  });

  test("fade audio in a video: WebM keeps its picture and gets Opus with the fades", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/fade-audio-in-video");
    await choose(page, "sample.webm");
    const run = page.getByRole("button", { name: "Fade", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator("video")).toHaveCount(1);
    await expect(page.getByRole("slider", { name: "Fade-out length" })).toBeVisible();
    await axeClean(page);
    await run.click();
    const out = await download(page, { ext: /-faded\.webm$/, mime: /video\/webm/ });
    expect(audioStream(out)?.codec_name).toBe("opus");
    expect(packetHashes(out.path, "v:0")).toEqual(packetHashes(fx("sample.webm"), "v:0"));
    expect(rmsDb(out.path, 0, 0.05)).toBeLessThan(rmsDb(out.path, 1.4, 1.6) - 20);
  });

  test("fix audio sync: the sound moves 200 ms earlier and nothing is re-encoded", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/fix-audio-sync");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop a video whose sound is out of sync",
    );
    await choose(page, "sample-clicks.mp4");
    const run = page.getByRole("button", { name: "Fix sync", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "Too late" })).toBeChecked();
    await expect(page.getByText(/exact to the sample\. Nothing is re-encoded/)).toBeVisible();
    await axeClean(page);
    await shot(page, "sync-ready");
    await run.click();
    const out = await download(page, { ext: /-synced\.mp4$/, mime: /video\/mp4/ });
    await expect(page.getByText(/Sound 200.ms earlier/).first()).toBeVisible();
    expect(packetHashes(out.path, "v:0")).toEqual(packetHashes(fx("sample-clicks.mp4"), "v:0"));
    // Clicks every 100 ms from 0 s: 200 ms earlier, the first click heard is the one at 200 ms, now at 0.
    expect(rmsDb(out.path, 0, 0.004)).toBeGreaterThan(-30);
    expect(uploads).toEqual([]);
  });

  test("select audio tracks: keep French and the commentary, French first", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/select-audio-tracks");
    await choose(page, "sample-tracks.mkv");
    const run = page.getByRole("button", { name: "Keep tracks", exact: true });
    await expect(run).toBeVisible({ timeout: 30_000 });
    // The default track is ticked; with every other track off, the job is to drop two tracks.
    await expect(page.getByRole("checkbox", { name: /English/ }).first()).toBeChecked();
    await page.getByRole("checkbox", { name: /Français/ }).check();
    await page.getByRole("checkbox", { name: /Commentary/ }).check();
    await page.getByRole("checkbox", { name: /^English/ }).uncheck();
    await expect(page.getByText(/Removes 1 of 3 sound tracks/)).toBeVisible();
    await axeClean(page);
    await shot(page, "tracks-ready");
    await run.click();
    const out = await download(page, { ext: /-tracks\.mkv$/, mime: /matroska/ });
    const audio = out.streams.filter((s) => s.codec_type === "audio");
    expect(audio.map((s) => [s.codec_name, s.tags?.language])).toEqual([
      ["aac", "fra"],
      ["opus", "eng"],
    ]);
  });

  test("remove silence from audio: the timeline shows the cuts made, WAV stays WAV", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/remove-silence-from-audio");
    await choose(page, "sample-pauses.wav");
    const run = page.getByRole("button", { name: "Remove silence", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText(/2 pauses marked · 1\.4\ss removed · 0:08 → 0:07/)).toBeVisible({
      timeout: 30_000,
    });
    const line = page.getByRole("slider", { name: "Silence threshold" });
    await expect(line).toBeVisible();
    await axeClean(page);
    await shot(page, "silence-ready");
    await run.click();
    const out = await download(page, { ext: /-cut\.wav$/, mime: /audio\/wav/ });
    await shot(page, "silence-done");
    expect(Number(out.format.duration)).toBeGreaterThan(6.5);
    expect(Number(out.format.duration)).toBeLessThan(6.7);
  });

  test("remove silence from video: picture and sound cut together, same length", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/remove-silence-from-video");
    await choose(page, "sample-pauses.mp4");
    const run = page.getByRole("button", { name: "Remove silence", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText(/2 pauses marked/)).toBeVisible({ timeout: 30_000 });
    await run.click();
    const out = await download(page, { ext: /-cut\.mp4$/, mime: /video\/mp4/ });
    const v = Number(videoStream(out)?.duration);
    const a = Number(audioStream(out)?.duration);
    expect(v).toBeGreaterThan(6.4);
    expect(v).toBeLessThan(6.8);
    expect(Math.abs(v - a)).toBeLessThan(0.05);
    expect(videoStream(out)?.codec_name).toBe("h264");
  });

  test("stereo to mono: an MP3 stays MP3 with one channel", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/stereo-to-mono");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop an audio file to make it mono",
    );
    await choose(page, "sample.mp3");
    const run = page.getByRole("button", { name: "Make mono", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "MP3", exact: true })).toBeChecked();
    await expect(page.getByText(/Mixed down to mono/)).toBeVisible();
    await run.click();
    const out = await download(page, { ext: /\.mp3$/, mime: /audio\/mpeg/ });
    expect(audioStream(out)?.channels).toBe(1);
    expect(audioStream(out)?.codec_name).toBe("mp3");
  });

  test("change sample rate: a 44.1 kHz WAV becomes 48 kHz through the ffmpeg resampler", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/change-audio-sample-rate");
    await choose(page, "sample.wav");
    const run = page.getByRole("button", { name: "Resample", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "48 kHz" })).toBeChecked();
    await run.click();
    const out = await download(page, { ext: /\.wav$/, mime: /audio\/(wav|x-wav)/ });
    expect(audioStream(out)?.sample_rate).toBe("48000");
    expect(Number(out.format.duration)).toBeCloseTo(4, 1);
  });
});

test.describe("standalone audio pages", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  test("trim audio: handles on the waveform, the M4A part is copied and exact", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/trim-audio");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop an audio file to trim it",
    );
    await choose(page, "sample.m4a");
    const run = page.getByRole("button", { name: "Trim", exact: true });
    await expect(run).toBeVisible({ timeout: 30_000 });
    // The whole file is selected: nothing to do until a handle moves.
    await expect(run).toBeDisabled();
    const start = page.getByRole("slider", { name: "Start of the part to keep" });
    const end = page.getByRole("slider", { name: "End of the part to keep" });
    await start.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await end.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(run).toBeEnabled();
    await expect(page.getByText(/0:01.00 to 0:03.00: AAC is copied into M4A/)).toBeVisible();
    await axeClean(page);
    await shot(page, "trim-audio-ready");
    await run.click();
    const out = await download(page, { ext: /\.m4a$/, mime: /audio\/mp4/ });
    expect(audioStream(out)?.codec_name).toBe("aac");
    expect(Number(out.format.duration)).toBeCloseTo(2, 2);
  });

  test("change audio speed: an MP3 at 1.25× keeps its pitch and gets shorter", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/change-audio-speed");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop an audio file to speed it up or slow it down",
    );
    await choose(page, "sample.mp3");
    const run = page.getByRole("button", { name: "Change speed", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole("slider", { name: "Playback position" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Mute" })).toHaveCount(0);
    await run.click();
    const out = await download(page, { ext: /-1-25x\.mp3$/, mime: /audio\/mpeg/ });
    expect(audioStream(out)?.codec_name).toBe("mp3");
    expect(Number(out.format.duration)).toBeGreaterThan(3.1);
    expect(Number(out.format.duration)).toBeLessThan(3.35);
  });
});

test.describe("audio edits at 390", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const [slug, file, button] of [
    ["change-audio-volume", "sample.mp3", "Change volume"],
    ["fade-audio-in-video", "sample.mp4", "Fade"],
    ["fix-audio-sync", "sample.mp4", "Fix sync"],
    ["select-audio-tracks", "sample-tracks.mkv", "Keep tracks"],
    ["remove-silence-from-audio", "sample-pauses.wav", "Remove silence"],
    ["normalize-audio", "sample.m4a", "Normalise"],
    ["trim-audio", "sample.mp3", "Trim"],
    ["stereo-to-mono", "sample.wav", "Make mono"],
  ] as const) {
    test(`${slug}: no horizontal scroll, 44px targets, no axe violations`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(`/${slug}`);
      await choose(page, file);
      await expect(page.getByRole("button", { name: button, exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      // Every control in the workspace is at least 44px in one direction it is pressed.
      const small = await page
        .getByRole("region", { name: "Workspace" })
        .locator(
          "button, [role=slider], input[type=radio], input[type=checkbox], input[type=number], summary",
        )
        .evaluateAll((els) =>
          els
            .map((el) => {
              const target =
                el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
                  ? (el.closest("label") ?? el)
                  : el.getAttribute("role") === "radio"
                    ? (el.closest("label") ?? el)
                    : el;
              const r = target.getBoundingClientRect();
              return { html: el.outerHTML.slice(0, 80), w: r.width, h: r.height };
            })
            .filter((r) => r.w > 0 && r.h > 0 && r.h < 44 && r.w < 44),
        );
      expect(small).toEqual([]);
      await axeClean(page);
      await shot(page, `${slug}-ready`);
    });
  }
});
