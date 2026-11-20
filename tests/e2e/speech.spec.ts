import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Round 4 speech tools end to end: remove background noise (RNNoise) and pauses found by speech
 * (Silero VAD) in remove silence and the Shorts clip finder. Fixtures are a synthetic voice with
 * known speech segments over noise beds (scripts/make-speech-fixtures.mjs, tests/fixtures/speech).
 * Downloads are read back with the local ffprobe and ffmpeg (test-only). The only requests allowed
 * are our own pages, scripts and model files; none may carry a body over 1 KB.
 * SPEECH_SHOTS=<dir> saves screenshots.
 */
const shots = process.env.SPEECH_SHOTS;
const fx = (name: string) => join("tests/fixtures", name);

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.method() === "GET" ? null : req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

const workspace = (page: Page) => page.getByRole("region", { name: "Workspace" });

const axeClean = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .include('section[aria-label="Workspace"]')
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ""}`)).toEqual([]);
};

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

const probe = (path: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,sample_rate,channels,duration:format=duration,format_name",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as {
    streams: { codec_type: string; codec_name: string; sample_rate?: string; channels?: number }[];
    format: { duration: string; format_name: string };
  };

/** Mono float samples at `rate` as a player decodes them. */
function decode(path: string, rate = 48_000): Float32Array {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      String(rate),
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

const packetHashes = (path: string, stream: string) =>
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
  const dir = mkdtempSync(join(tmpdir(), "speech-"));
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}

interface Segments {
  segments: { start: number; end: number }[];
}
const segmentsOf = (name: string) =>
  (JSON.parse(readFileSync(fx(`speech/${name}.json`), "utf8")) as Segments).segments;

/** Level in dB of the samples inside (or outside) the speech segments, 50 ms clear of each edge. */
function levelDb(x: Float32Array, rate: number, segs: Segments["segments"], inside: boolean) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / rate;
    const inSeg = segs.some((s) => t >= s.start - 0.05 && t < s.end + 0.05);
    const clear = segs.some((s) => t >= s.start + 0.05 && t < s.end - 0.05);
    if (inside ? !clear : inSeg) continue;
    sum += (x[i] as number) ** 2;
    n++;
  }
  return 10 * Math.log10(sum / Math.max(1, n) + 1e-20);
}

/** WebCodecs AAC encode and the ffmpeg.wasm path are exercised on Chromium (desktop and Pixel). */
const engineSkip = (info: TestInfo) =>
  (info.project.use.defaultBrowserType ?? "chromium") !== "chromium";

/** A long noisy WAV for the cancel test (generated, not committed). */
function longWav(minutes: number): string {
  const dir = mkdtempSync(join(tmpdir(), "speech-long-"));
  const path = join(dir, `long-${minutes}.wav`);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anoisesrc=color=pink:amplitude=0.05:sample_rate=48000:duration=${minutes * 60}`,
    "-ac",
    "2",
    path,
  ]);
  return path;
}

test.describe("remove background noise", () => {
  test("renders, cleans a noisy voice WAV to the same length, and keeps the voice", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const uploads = trackUploads(page);
    await page.goto("/remove-background-noise");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Remove background noise");
    await expect(workspace(page)).toContainText(
      "Drop a recording or a video to clean up its speech",
    );
    await shot(page, "denoise-idle");
    await page.locator('input[type="file"]').setInputFiles(fx("speech/speech-fan.wav"));
    const run = page.getByRole("button", { name: "Remove noise", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(workspace(page)).toContainText("noise removed · loudness kept · WAV 16");
    await axeClean(page);
    await shot(page, "denoise-ready");
    // Keyboard path to Download.
    await run.focus();
    await page.keyboard.press("Enter");
    const path = await download(page, /speech-fan-denoised\.wav$/);
    await expect(workspace(page)).toContainText("Noise removed");
    await expect(workspace(page)).toContainText(/loudness kept at −\d+\.\d\sLUFS/);
    await shot(page, "denoise-done");
    const p = probe(path);
    expect(p.streams[0]?.codec_name).toBe("pcm_s16le");
    expect(p.streams[0]?.sample_rate).toBe("48000");
    const out = decode(path);
    const src = decode(fx("speech/speech-fan.wav"));
    // Sample-exact length.
    expect(out.length).toBe(src.length);
    const segs = segmentsOf("speech-fan");
    const pauseDrop = levelDb(src, 48_000, segs, false) - levelDb(out, 48_000, segs, false);
    const speechChange = levelDb(out, 48_000, segs, true) - levelDb(src, 48_000, segs, true);
    // The fan 5 dB under the voice: the pauses drop by far more than 20 dB, the voice keeps its level.
    expect(pauseDrop).toBeGreaterThan(25);
    expect(Math.abs(speechChange)).toBeLessThan(2.5);
    expect(uploads).toEqual([]);
  });

  test("cleans a video's sound and copies its picture packet for packet", async ({
    page,
  }, info) => {
    test.skip(engineSkip(info), "WebCodecs AAC encode: Chromium");
    test.setTimeout(150_000);
    await page.goto("/remove-background-noise");
    await page.locator('input[type="file"]').setInputFiles(fx("speech/speech-fan.mp4"));
    const run = page.getByRole("button", { name: "Remove noise", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(workspace(page)).toContainText("picture copied · AAC");
    await run.click();
    const path = await download(page, /\.mp4$/);
    expect(packetHashes(path, "v:0")).toEqual(packetHashes(fx("speech/speech-fan.mp4"), "v:0"));
    const p = probe(path);
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    expect(Math.abs(Number(p.format.duration) - 6)).toBeLessThan(0.1);
    const out = decode(path);
    const src = decode(fx("speech/speech-fan.mp4"));
    const segs = segmentsOf("speech-fan");
    expect(levelDb(src, 48_000, segs, false) - levelDb(out, 48_000, segs, false)).toBeGreaterThan(
      20,
    );
  });

  test("a lower strength leaves the noise about 20 dB down, written as MP3 by ffmpeg", async ({
    page,
  }, info) => {
    test.skip(engineSkip(info), "ffmpeg.wasm path: Chromium");
    test.setTimeout(180_000);
    const dir = mkdtempSync(join(tmpdir(), "speech-mp3-"));
    const mp3 = join(dir, "speech-fan.mp3");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      fx("speech/speech-fan.wav"),
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      mp3,
    ]);
    await page.goto("/remove-background-noise");
    await page.locator('input[type="file"]').setInputFiles(mp3);
    await page.getByRole("spinbutton", { name: "Strength, percent" }).fill("90");
    await page.keyboard.press("Enter");
    await expect(workspace(page)).toContainText("noise 20 dB down");
    await page.getByRole("checkbox", { name: /Keep the original's loudness/ }).uncheck();
    await page.getByRole("button", { name: "Remove noise", exact: true }).click();
    const path = await download(page, /\.mp3$/);
    expect(probe(path).streams[0]?.codec_name).toBe("mp3");
    const out = decode(path);
    const src = decode(mp3);
    const segs = segmentsOf("speech-fan");
    const drop = levelDb(src, 48_000, segs, false) - levelDb(out, 48_000, segs, false);
    expect(drop).toBeGreaterThan(17);
    expect(drop).toBeLessThan(23);
  });

  test("auditions at the playhead, and Cancel returns to ready", async ({ page }, info) => {
    test.skip(engineSkip(info), "long run: Chromium");
    test.setTimeout(120_000);
    await page.goto("/remove-background-noise");
    await page.locator('input[type="file"]').setInputFiles(longWav(8));
    const listen = page.getByRole("button", { name: /Listen to 8 s, cleaned/ });
    await expect(listen).toBeEnabled({ timeout: 30_000 });
    await listen.click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Stop listening" }).click();
    const run = page.getByRole("button", { name: "Remove noise", exact: true });
    await run.click();
    await expect(workspace(page)).toContainText(
      /Pass 1 of 2 · measuring loudness · \d+:\d\d of 8:00/,
      {
        timeout: 20_000,
      },
    );
    await shot(page, "denoise-processing");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(run).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
  });

  test("a video without sound is blocked with the reason", async ({ page }) => {
    await page.goto("/remove-background-noise");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-fade.mp4"));
    await expect(workspace(page)).toContainText(
      "This file has no sound track, so there is no noise to remove.",
      { timeout: 30_000 },
    );
    // No option can add a sound track: the reason stands where the button would be (ADR-0141).
    await expect(page.getByRole("button", { name: "Remove noise", exact: true })).toHaveCount(0);
  });
});

/** A voice over a noise bed with a still picture, generated (not committed): `seconds` long. */
function speechVideo(seconds: number, noise: string, db: number) {
  const dir = mkdtempSync(join(tmpdir(), "speech-video-"));
  execFileSync("node", ["scripts/make-speech-fixtures.mjs", dir, String(seconds), "21", "48000"]);
  const path = join(dir, "talk.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x506070:s=320x180:r=25:d=${seconds}`,
    "-i",
    join(dir, "clean.wav"),
    "-i",
    join(dir, `noise-${noise}.wav`),
    "-filter_complex",
    `[2]volume=-${db}dB[n];[1][n]amix=inputs=2:normalize=0[a]`,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    "-movflags",
    "+faststart",
    path,
  ]);
  const segments = (JSON.parse(readFileSync(join(dir, "speech.json"), "utf8")) as Segments)
    .segments;
  return { path, segments };
}

test.describe("pauses found by speech", () => {
  test("remove silence finds the pauses under a music bed by speech, not by loudness", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const uploads = trackUploads(page);
    await page.goto("/remove-silence-from-audio");
    await page.locator('input[type="file"]').setInputFiles(fx("speech/speech-music.m4a"));
    const run = page.getByRole("button", { name: "Remove silence", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    const speech = page.getByRole("radio", { name: "Speech", exact: true });
    await expect(speech).toBeChecked();
    // The lead-in and the 1.5 s gap between phrases (the model hears speech a little past its end,
    // so the 0.9 s tail is too short to cut, and the 0.26 s breath stays).
    await expect(workspace(page)).toContainText(/2 pauses marked · 1\.5\ss removed · 0:10 → 0:08/, {
      timeout: 30_000,
    });
    await expect(workspace(page)).toContainText(/by speech · M4A 96\skbps, re-encoded/);
    await expect(workspace(page)).not.toContainText("on this device");
    // No threshold to drag by speech.
    await expect(page.getByRole("slider", { name: "Silence threshold" })).toHaveCount(0);
    await axeClean(page);
    await shot(page, "silence-speech-ready");
    // By loudness the music bed (10 dB under the voice) hides the gap between the phrases.
    await page.getByRole("radio", { name: "Loudness", exact: true }).locator("xpath=..").click();
    await expect(page.getByRole("slider", { name: "Silence threshold" })).toBeVisible();
    await expect(workspace(page)).toContainText(/1 pause marked · 0\.2\ss removed/);
    await shot(page, "silence-level-ready");
    await page.getByRole("radio", { name: "Speech", exact: true }).locator("xpath=..").click();
    await run.click();
    const path = await download(page, /speech-music-cut\.m4a$/);
    await expect(workspace(page)).toContainText("found by speech");
    await shot(page, "silence-speech-done");
    const d = Number(probe(path).format.duration);
    // 10 s less the two cuts (1.5 s with 0.15 s kept at each inner side).
    expect(d).toBeGreaterThan(8.3);
    expect(d).toBeLessThan(8.7);
    expect(uploads).toEqual([]);
  });

  test("a file with no speech falls back to loudness and says so", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/remove-silence-from-audio");
    await page.locator('input[type="file"]').setInputFiles(fx("sample-pauses.wav"));
    await expect(workspace(page)).toContainText("Too little speech in this file", {
      timeout: 30_000,
    });
    await expect(workspace(page)).toContainText("by loudness, too little speech · WAV 16");
    await expect(page.getByRole("slider", { name: "Silence threshold" })).toBeVisible();
    await shot(page, "silence-fallback-ready");
    await expect(workspace(page)).toContainText(/2 pauses marked · 1\.4\ss removed · 0:08 → 0:07/);
  });

  test("the Shorts clip finder cuts in the pauses between words under traffic noise", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const { path, segments } = speechVideo(40, "traffic", 5);
    await page.goto("/cut-video-into-shorts");
    await page.locator('input[type="file"]').first().setInputFiles(path);
    await expect(page.getByRole("button", { name: "Cut clips", exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.getByText(/^Looking for pauses and scene changes/)).toHaveCount(0, {
      timeout: 90_000,
    });
    await page.getByRole("radio", { name: "15 s", exact: true }).locator("xpath=..").click();
    await expect(page.getByText(/ in pauses? · /)).toBeVisible();
    await shot(page, "clips-speech-ready");
    // Every boundary is in a real gap between phrases.
    const sliders = page.getByRole("slider", { name: /^Boundary \d+$/ });
    const n = await sliders.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      const v = Number(await sliders.nth(i).getAttribute("aria-valuenow"));
      const inSpeech = segments.some((s) => v > s.start + 0.05 && v < s.end - 0.05);
      expect(inSpeech, `boundary at ${v} s is inside speech`).toBe(false);
    }
  });
});

test.describe("remove background noise: inputs and hand-offs", () => {
  test("several files run as a batch; a file without sound is skipped with its reason", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const dir = mkdtempSync(join(tmpdir(), "speech-batch-"));
    const second = join(dir, "second-take.wav");
    writeFileSync(second, readFileSync(fx("speech/speech-fan.wav")));
    await page.goto("/remove-background-noise");
    await page
      .locator('input[type="file"]')
      .setInputFiles([fx("speech/speech-fan.wav"), second, fx("sample-fade.mp4")]);
    const stage = workspace(page);
    await expect(stage.getByRole("listitem")).toHaveCount(3, { timeout: 30_000 });
    await expect(stage.getByRole("listitem").filter({ hasText: "sample-fade.mp4" })).toContainText(
      "no sound track",
    );
    await page.getByRole("button", { name: "Remove noise", exact: true }).click();
    await expect(page.getByRole("link", { name: "Download all (ZIP)" })).toBeVisible({
      timeout: 150_000,
    });
  });

  test("the result hands on to remove silence, already read", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/remove-background-noise");
    await page.locator('input[type="file"]').setInputFiles(fx("speech/speech-fan.wav"));
    await page.getByRole("button", { name: "Remove noise", exact: true }).click();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 120_000 });
    await workspace(page).getByRole("link", { name: "Cut the pauses" }).click();
    await expect(page).toHaveURL(/\/remove-silence-from-audio$/);
    await expect(workspace(page)).toContainText("speech-fan-denoised.wav", { timeout: 30_000 });
    await expect(workspace(page)).toContainText(/\d pauses? marked/, { timeout: 30_000 });
  });

  for (const [name, ext, codec] of [
    ["sample.webm", /\.webm$/, "opus"],
    ["sample.mov", /\.mov$/, "aac"],
  ] as const)
    test(`keeps a ${name.split(".")[1]?.toUpperCase()} as it is and copies the picture`, async ({
      page,
    }, info) => {
      test.skip(engineSkip(info), "WebCodecs sound encode: Chromium");
      test.setTimeout(120_000);
      await page.goto("/remove-background-noise");
      await page.locator('input[type="file"]').setInputFiles(fx(name));
      await page.getByRole("button", { name: "Remove noise", exact: true }).click();
      const path = await download(page, ext);
      expect(packetHashes(path, "v:0")).toEqual(packetHashes(fx(name), "v:0"));
      expect(probe(path).streams.find((s) => s.codec_type === "audio")?.codec_name).toBe(codec);
    });
});

test.describe("screenshots at 390, 768 and 1280", () => {
  test.skip(!shots, "SPEECH_SHOTS not set");
  // The service worker would serve the model from its cache after the first width, past the route
  // that holds the download for the model-loading shot.
  test.use({ serviceWorkers: "block" });
  test("ready, every processing phase, and done", async ({ page }, info) => {
    test.skip(engineSkip(info), "Chromium only");
    test.setTimeout(900_000);
    const long = longWav(6);
    // Hold the model download for a moment so its phase can be seen (served unchanged after).
    await page.route("**/models/rnnoise/**", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/remove-background-noise");
      await page.locator('input[type="file"]').setInputFiles(long);
      const run = page.getByRole("button", { name: "Remove noise", exact: true });
      await expect(run).toBeEnabled({ timeout: 30_000 });
      await run.click();
      await expect(page.getByText(/^Loading the noise model · /)).toBeVisible({ timeout: 20_000 });
      await shot(page, "denoise-processing-model");
      await expect(page.getByText(/^Pass 1 of 2 · measuring loudness · /)).toBeVisible({
        timeout: 60_000,
      });
      await shot(page, "denoise-processing-pass1");
      await expect(page.getByText(/^Pass 2 of 2 · removing noise · /)).toBeVisible({
        timeout: 300_000,
      });
      await shot(page, "denoise-processing-pass2");
      // The last phase is short: shoot it when it is caught, go on when the result is already there.
      const measuring = page.getByText(/^Measuring the result/);
      await expect(measuring.or(page.getByRole("link", { name: "Download" }))).toBeVisible({
        timeout: 300_000,
      });
      if (await measuring.isVisible()) await shot(page, "denoise-processing-measuring");
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 300_000 });
      await shot(page, "denoise-done-long");
      await page.goto("/remove-background-noise");
      await page.locator('input[type="file"]').setInputFiles(fx("speech/speech-fan.mp4"));
      await expect(run).toBeEnabled({ timeout: 30_000 });
      await shot(page, "denoise-ready");
      await run.click();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 120_000 });
      await shot(page, "denoise-done");
      // Remove silence by loudness, once the segmented control has settled.
      await page.goto("/remove-silence-from-audio");
      await page.locator('input[type="file"]').setInputFiles(fx("speech/speech-music.m4a"));
      await expect(workspace(page)).toContainText(/pauses? marked/, { timeout: 30_000 });
      await shot(page, "silence-speech-ready");
      await page.getByRole("radio", { name: "Loudness", exact: true }).locator("xpath=..").click();
      await expect(page.getByRole("slider", { name: "Silence threshold" })).toBeVisible();
      await page.waitForTimeout(600);
      await shot(page, "silence-level-ready");
      await page.goto("/remove-silence-from-video");
      await page.locator('input[type="file"]').setInputFiles(fx("speech/speech-fan.mp4"));
      const cut = page.getByRole("button", { name: "Remove silence", exact: true });
      await expect(workspace(page)).toContainText(/pauses? marked/, { timeout: 30_000 });
      await shot(page, "silence-ready");
      await cut.click();
      await shot(page, "silence-processing");
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 120_000 });
      await shot(page, "silence-done");
    }
  });
});
