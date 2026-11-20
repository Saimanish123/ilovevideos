import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";
import { soundCheck } from "./sound";

/**
 * Audio tools end to end: the audio converter and its pair pages (native copies and encodes, the
 * ffmpeg.wasm path for MP3, Vorbis, FLAC, AIFF and WMA), video → audio pairs, and add / replace
 * audio in a video. Every download is saved and read back with ffprobe (codec, duration, sample
 * format), lossless claims are checked by hashing decoded audio or copied packets, and no request
 * may carry a body over 1 KB. Chromium engines only: Playwright's WebKit has no WebCodecs encoders
 * and no cross-origin isolation for the ffmpeg threads. Set AUDIO_SHOTS=<dir> for 390/1280 shots.
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

/** Click a segmented option: the radio is visually hidden inside its label. */
const pick = (page: Page, name: string | RegExp) =>
  page.locator("label", { has: page.getByRole("radio", { name, exact: true }) }).click();

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

interface Stream {
  codec_type: string;
  codec_name: string;
  sample_rate?: string;
  channels?: number;
  sample_fmt?: string;
  bits_per_raw_sample?: string;
  bits_per_sample?: number;
  bit_rate?: string;
  duration?: string;
}
interface Probe {
  path: string;
  streams: Stream[];
  format: { duration: string; format_name: string };
}

const probe = (path: string): Probe => ({
  path,
  ...(JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,sample_rate,channels,sample_fmt,bits_per_raw_sample,bits_per_sample,bit_rate,duration:format=duration,format_name",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as Omit<Probe, "path">),
});

/** MD5 of the decoded audio as 32-bit samples, so equal hashes mean identical sound. */
const audioMd5 = (path: string) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:a:0",
    "-f",
    "md5",
    "-c:a",
    "pcm_s32le",
    "-",
  ])
    .toString()
    .trim();

/** MD5 of each encoded audio packet: equal lists mean the track was copied, not re-encoded. */
const packetHashes = (path: string, count: number) =>
  execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
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
    .split("\n")
    .slice(0, count);

/** Milliseconds before the first sample above −34 dBFS: how late the sound starts. */
function soundStartMs(path: string): number {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-t",
      "0.3",
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
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const rate = Number(
    probe(path).streams.find((s) => s.codec_type === "audio")?.sample_rate ?? 44_100,
  );
  for (let i = 0; i < raw.length / 4; i++)
    if (Math.abs(raw.readFloatLE(i * 4)) > 0.02) return (i / rate) * 1000;
  return Number.POSITIVE_INFINITY;
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
  const dir = mkdtempSync(join(tmpdir(), "audio-"));
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
  expect(results.violations.map((v) => v.id)).toEqual([]);
};

test.describe("audio tools", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  test("audio converter: MP3 becomes WAV natively, with the waveform as hero", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/audio-converter");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("Drop an audio file to convert it");
    await shot(page, "converter-idle");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp3"));
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    await expect(convert).toBeVisible({ timeout: 30_000 });
    // The waveform is the hero, not a video box; it becomes interactive once read.
    const wave = page.getByRole("slider", { name: "Playback position" });
    await expect(wave).toBeVisible();
    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
    // An MP3 defaults to WAV; the summary says it is decoded once and does not restore anything.
    await expect(page.getByRole("radio", { name: "WAV", exact: true })).toBeChecked();
    await expect(
      page.getByText(/MP3 is decoded once to WAV; nothing is lost from here on/),
    ).toBeVisible();
    await expect(page.getByText(/Keeps the title/)).toContainText("Two tones");
    await expect(page.getByText(/Reading the waveform/)).toHaveCount(0, { timeout: 15_000 });
    await axeClean(page);
    await shot(page, "converter-ready");
    await convert.click();
    const out = await download(page, { ext: /\.wav$/, mime: /^audio\/wav/ });
    const a = audioStream(out);
    expect(a?.codec_name).toBe("pcm_s16le");
    expect(a?.sample_rate).toBe("44100");
    expect(a?.channels).toBe(2);
    expect(Number(out.format.duration)).toBeCloseTo(4, 0);
    // Done: a real verdict, and the hero now plays the result.
    await expect(page.getByText(/^Converted to WAV: 0:04/)).toBeVisible();
    await expect(page.getByRole("slider", { name: "Result playback position" })).toBeVisible();
    await expect(page.locator("audio[controls]")).toHaveCount(0);
    await shot(page, "converter-done");
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("audio converter: raw AAC is copied into M4A without re-encoding", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/audio-converter");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.aac"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await pick(page, "M4A");
    await expect(
      page.getByText(/AAC is copied into M4A as it is, not re-encoded\. Lossless\./),
    ).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Bitrate" })).toHaveCount(0);
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const out = await download(page, { ext: /\.m4a$/, mime: /^audio\/mp4/ });
    expect(audioStream(out)?.codec_name).toBe("aac");
    expect(out.format.format_name).toContain("mp4");
    expect(Number(out.format.duration)).toBeCloseTo(4, 0);
    // ADTS headers are stripped in MP4, so compare the decoded sound: identical means not re-encoded.
    expect(audioMd5(out.path)).toBe(audioMd5(fx("sample.aac")));
    await expect(page.getByText(/^Copied into M4A: 0:04/)).toBeVisible();
    expect(uploads).toEqual([]);
  });

  test("audio converter: Opus natively and OGG as Vorbis through ffmpeg", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/audio-converter");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.flac"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await pick(page, "Opus");
    await pick(page, "128 kbps");
    await expect(page.getByText(/re-encoded to Opus at 128\skbps\./)).toBeVisible();
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const opus = await download(page, { ext: /\.opus$/, mime: /^audio\/ogg/ });
    expect(audioStream(opus)?.codec_name).toBe("opus");
    expect(Number(opus.format.duration)).toBeCloseTo(4, 0);
    // Exactly the source's 4 s at 48 kHz (before: 192 648 samples, the encoder's padding played,
    // and the sound 0.7 ms late), starting on time.
    const sound = soundCheck(opus.path);
    expect(sound && Math.round(sound.seconds * 48_000)).toBe(192_000);
    expect(sound?.onset).toBeLessThan(0.0005);
    await page.getByRole("button", { name: "Start over" }).click();
    await page.locator('input[type="file"]').setInputFiles(fx("sample.flac"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await pick(page, "OGG");
    await expect(
      page.getByText(/re-encoded to Vorbis at 192\skbps, after a one-time download of/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const ogg = await download(page, { ext: /\.ogg$/, mime: /^audio\/ogg/ });
    expect(audioStream(ogg)?.codec_name).toBe("vorbis");
    expect(Number(ogg.format.duration)).toBeCloseTo(4, 0);
  });

  test("a pair page settles a file that is already the target", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/wav-to-mp3");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp3"));
    await expect(
      page.getByRole("paragraph").filter({ hasText: "Already an MP3. Nothing to convert." }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "Convert to another format" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toHaveCount(0);
    await expect(page.getByText(/copied into MP3 as it is/)).toHaveCount(0);
    // Nothing will be written, so the panel describes the file instead of an "Output MP3" line.
    await expect(page.getByText(/Output MP3/)).toHaveCount(0);
    await expect(page.getByText(/This file MP3/)).toBeVisible();
    await shot(page, "pair-already-mp3");
  });

  test("wav-to-mp3 encodes with LAME through ffmpeg.wasm", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/wav-to-mp3");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop a WAV file to convert it to MP3",
    );
    await page.locator('input[type="file"]').setInputFiles(fx("sample.wav"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Output MP3 from PCM 16-bit/)).toBeVisible();
    await pick(page, "320 kbps");
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const out = await download(page, { ext: /\.mp3$/, mime: /^audio\/mpeg/ });
    const a = audioStream(out);
    expect(a?.codec_name).toBe("mp3");
    expect(Number(a?.bit_rate)).toBe(320_000);
    expect(Number(out.format.duration)).toBeCloseTo(4, 0);
    await expect(page.getByText(/^Converted to MP3: 0:04 at 320\skbps/)).toBeVisible();
    await expect(page.getByText("The same operation with ffmpeg")).toHaveCount(0);
    expect(uploads).toEqual([]);
  });

  test("flac-to-wav is exact, including a 24-bit master", async ({ page }) => {
    test.setTimeout(120_000);
    const dir = mkdtempSync(join(tmpdir(), "flac24-"));
    const flac24 = join(dir, "master-24.flac");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=96000:duration=2",
      "-c:a",
      "flac",
      "-sample_fmt",
      "s32",
      "-bits_per_raw_sample",
      "24",
      flac24,
    ]);
    // sample-flac-tail.flac ends on a 15-byte frame that mediabunny alone never reads (before: the
    // WAV was 140 samples short).
    for (const [file, fmt] of [
      [fx("sample.flac"), "pcm_s16le"],
      [fx("sample-flac-tail.flac"), "pcm_s16le"],
      [flac24, "pcm_s24le"],
    ] as const) {
      await page.goto("/flac-to-wav");
      await page.locator('input[type="file"]').setInputFiles(file);
      await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "Convert", exact: true }).click();
      const out = await download(page, { ext: /\.wav$/, mime: /^audio\/wav/ });
      expect(audioStream(out)?.codec_name).toBe(fmt);
      expect(audioMd5(out.path)).toBe(audioMd5(file));
    }
  });

  test("aiff-to-wav reads AIFF with ffmpeg and keeps every sample", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/aiff-to-wav");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.aiff"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 90_000,
    });
    // Chromium can neither draw nor play AIFF; the hero says so instead of showing an empty box.
    await expect(page.getByText(/This browser cannot decode AIFF to draw it/).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const out = await download(page, { ext: /\.wav$/, mime: /^audio\/wav/ });
    expect(audioStream(out)?.codec_name).toBe("pcm_s16le");
    expect(audioMd5(out.path)).toBe(audioMd5(fx("sample.aiff")));
    expect(uploads).toEqual([]);
  });

  test("wma-to-mp3 decodes WMA with ffmpeg", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/wma-to-mp3");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.wma"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText(/Output MP3 from WMA/)).toBeVisible();
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const out = await download(page, { ext: /\.mp3$/, mime: /^audio\/mpeg/ });
    expect(audioStream(out)?.codec_name).toBe("mp3");
    expect(Number(out.format.duration)).toBeCloseTo(4, 0);
  });

  test("mp4-to-m4a copies the AAC track out of the video", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/mp4-to-m4a");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop an MP4 video to save its sound as M4A",
    );
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/AAC is copied into M4A as it is/)).toBeVisible();
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const out = await download(page, { ext: /\.m4a$/, mime: /^audio\/mp4/ });
    expect(audioStream(out)?.codec_name).toBe("aac");
    expect(videoStream(out)).toBe(undefined);
    expect(packetHashes(out.path, 40)).toEqual(packetHashes(fx("sample.mp4"), 40));
    await expect(page.getByText(/^Saved as M4A: 0:03, copied/)).toBeVisible();
  });

  test("video → audio pairs write the right codec from each container", async ({ page }) => {
    test.setTimeout(240_000);
    const cases = [
      { slug: "mov-to-mp3", file: "sample.mov", ext: /\.mp3$/, mime: /^audio\/mpeg/, codec: "mp3" },
      {
        slug: "webm-to-mp3",
        file: "sample.webm",
        ext: /\.mp3$/,
        mime: /^audio\/mpeg/,
        codec: "mp3",
      },
      { slug: "mkv-to-mp3", file: "sample.mkv", ext: /\.mp3$/, mime: /^audio\/mpeg/, codec: "mp3" },
      {
        slug: "mp4-to-wav",
        file: "sample.mp4",
        ext: /\.wav$/,
        mime: /^audio\/wav/,
        codec: "pcm_s16le",
      },
    ];
    for (const c of cases) {
      await page.goto(`/${c.slug}`);
      await page.locator('input[type="file"]').setInputFiles(fx(c.file));
      const convert = page.getByRole("button", { name: "Convert", exact: true });
      await expect(convert).toBeVisible({ timeout: 30_000 });
      await convert.click();
      const out = await download(page, { ext: c.ext, mime: c.mime });
      expect(audioStream(out)?.codec_name, c.slug).toBe(c.codec);
      expect(Number(out.format.duration), c.slug).toBeCloseTo(3, 0);
    }
  });

  test("add audio: mix a song under a video, picture copied", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await page.goto("/add-audio-to-video");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("Drop a video and the audio to add to it");
    await shot(page, "add-idle");
    await page.locator('input[type="file"]').setInputFiles([fx("sample.mp3"), fx("sample.mp4")]);
    const add = page.getByRole("button", { name: "Add audio", exact: true });
    await expect(add).toBeVisible({ timeout: 30_000 });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    // Roles are found in either order; the timeline shows the cut and the fade.
    await expect(page.getByText("Has its own sound.")).toBeVisible();
    await expect(page.getByText("New audio", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Cut at the video's end, fades out over 2 s/)).toBeVisible();
    await expect(page.getByRole("radio", { name: "Keep and mix" })).toBeChecked();
    const clip = page.getByRole("slider", { name: "Audio position" });
    await clip.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/The new audio plays 0:00\.20 to 0:03\.00, mixed/)).toBeVisible();
    await axeClean(page);
    await shot(page, "add-ready");
    await add.click();
    const out = await download(page, { ext: /\.mp4$/, mime: /^video\/mp4/ });
    expect(videoStream(out)?.codec_name).toBe("h264");
    expect(audioStream(out)?.codec_name).toBe("aac");
    expect(Number(out.format.duration)).toBeCloseTo(3, 0);
    // The picture is a packet copy of the source.
    const vHash = (p: string) =>
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_packets",
        "-show_data_hash",
        "MD5",
        "-show_entries",
        "packet=data_hash",
        "-of",
        "csv=p=0",
        p,
      ]).toString();
    expect(vHash(out.path)).toBe(vHash(fx("sample.mp4")));
    await expect(page.getByText(/^Audio added: 0:03, mixed with the original/)).toBeVisible();
    await shot(page, "add-done");
    expect(uploads).toEqual([]);
  });

  test("replace audio: an unchanged AAC track is copied; a short clip loops", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/replace-audio-in-video");
    await page.locator('input[type="file"]').setInputFiles([fx("sample.mp4"), fx("sample.m4a")]);
    const replace = page.getByRole("button", { name: "Replace audio", exact: true });
    await expect(replace).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "Replace it" })).toBeChecked();
    // With the fade off, nothing about the new audio changes: both tracks are copied.
    await pick(page, "Off");
    await expect(
      page.getByText(/Lossless: the picture and the AAC track are both copied/),
    ).toBeVisible();
    await replace.click();
    const copy = await download(page, { ext: /\.mp4$/, mime: /^video\/mp4/ });
    expect(audioStream(copy)?.codec_name).toBe("aac");
    expect(Number(copy.format.duration)).toBeCloseTo(3, 0);
    expect(packetHashes(copy.path, 50)).toEqual(packetHashes(fx("sample.m4a"), 50));
    // The copied AAC keeps its priming packet and an edit list skips it: the sound starts on time.
    expect(soundStartMs(copy.path)).toBeLessThan(3);
    await page.getByRole("button", { name: "Start over" }).click();

    // With the default 2 s fade the sound is encoded; the encoder's priming is signalled too.
    await page.locator('input[type="file"]').setInputFiles([fx("sample.mp4"), fx("sample.m4a")]);
    await expect(replace).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText(/encoded to AAC at 192\skbps/)).toBeVisible();
    await replace.click();
    const encoded = await download(page, { ext: /\.mp4$/, mime: /^video\/mp4/ });
    expect(audioStream(encoded)?.codec_name).toBe("aac");
    expect(Number(audioStream(encoded)?.duration)).toBeCloseTo(3, 1);
    // The encoder's priming is signalled exactly, and the AAC source decodes with pre-roll (before:
    // its first frame came out attenuated and the sound read 10.5 ms late).
    expect(soundStartMs(encoded.path)).toBeLessThan(3);
    await page.getByRole("button", { name: "Start over" }).click();

    await page
      .locator('input[type="file"]')
      .setInputFiles([fx("sample.mp4"), fx("sample-loop.mp3")]);
    await expect(replace).toBeEnabled({ timeout: 30_000 });
    await page.getByText("Loop the audio to the end of the video").click();
    await expect(page.getByText(/Plays [\d.]+ times/)).toBeVisible();
    await replace.click();
    const looped = await download(page, { ext: /\.mp4$/, mime: /^video\/mp4/ });
    const a = audioStream(looped);
    expect(a?.codec_name).toBe("aac");
    // A 1 s clip fills the 3 s video instead of leaving 2 s of silence.
    expect(Number(a?.duration)).toBeGreaterThan(2.8);
    // And it is sound, not silence, near the end (the third pass).
    const log = spawnSync("ffmpeg", [
      "-v",
      "info",
      "-ss",
      "2.2",
      "-i",
      looped.path,
      "-t",
      "0.5",
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]).stderr.toString();
    const mean = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(log)?.[1] ?? "-999");
    expect(mean).toBeGreaterThan(-40);
  });

  test("mobile and desktop screenshots of the audio pages", async ({ page }) => {
    test.skip(!shots, "set AUDIO_SHOTS to save screenshots");
    test.setTimeout(180_000);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.goto("/wav-to-mp3");
      await shot(page, "pair-idle");
      await page.locator('input[type="file"]').setInputFiles(fx("sample.wav"));
      await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/Reading the waveform/)).toHaveCount(0, { timeout: 15_000 });
      await shot(page, "pair-ready");
      await page.goto("/wav-to-mp3");
      await page.locator('input[type="file"]').setInputFiles(fx("sample.mp3"));
      await expect(
        page.getByRole("paragraph").filter({ hasText: "Already an MP3. Nothing to convert." }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await shot(page, "pair-already-mp3");
      await page.goto("/add-audio-to-video");
      await page.locator('input[type="file"]').setInputFiles([fx("sample.mp4"), fx("sample.mp3")]);
      await expect(page.getByRole("button", { name: "Add audio", exact: true })).toBeEnabled({
        timeout: 30_000,
      });
      await page.waitForTimeout(1500);
      await shot(page, "add-ready-full");
      await page.getByRole("slider", { name: "Audio position" }).scrollIntoViewIfNeeded();
      await shot(page, "add-timeline");
      // The list sits under the sticky action bar on a phone; scroll it to the top of the viewport.
      await page
        .getByText("Has its own sound.")
        .evaluate((el) => el.scrollIntoView({ block: "center" }));
      await shot(page, "add-roles");
    }
  });
});
