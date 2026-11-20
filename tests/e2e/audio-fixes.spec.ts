import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Audio defects found by QA on 2026-10-08, each run end to end and read back with the local
 * ffprobe/ffmpeg (test-only): AIFF on the sound pages (D1), 5.1 to mono without clipping (D2),
 * 5.1 to Opus (D3), remove silence from a video in WebKit (D5), result lines that state what was
 * written (D7, D14) and a lossy encoder's level loss (D12). Fixtures that are not in
 * tests/fixtures are made here with the local ffmpeg.
 */
const fx = (name: string) => join("tests/fixtures", name);
const made = mkdtempSync(join(tmpdir(), "audio-fixes-fx-"));
const make = (name: string, args: string[]) => {
  const path = join(made, name);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args, path]);
  return path;
};
const lavfi = (expr: string, extra = "") => ["-f", "lavfi", "-i", `aevalsrc=${expr}${extra}`];

interface Stream {
  codec_type: string;
  codec_name: string;
  profile?: string;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
  duration?: string;
  bits_per_raw_sample?: string;
}
const probe = (path: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,profile,sample_rate,channels,bit_rate,duration,bits_per_raw_sample:format=duration",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as { streams: Stream[]; format: { duration: string } };
const audioOf = (path: string) => probe(path).streams.find((s) => s.codec_type === "audio");

/** ffmpeg's EBU R128 meter: integrated loudness, LUFS. */
function lufs(path: string): number {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "ebur128", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const summary = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  return Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
}

/** Decoded mono-mixed samples as float, unscaled (`pan` keeps one channel when there is one). */
function samples(path: string): Float32Array {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "f32le", "-"], {
    maxBuffer: 256 * 1024 * 1024,
  });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

async function download(page: Page, ext: RegExp): Promise<string> {
  const link = page.getByRole("link", { name: "Download" });
  await expect(link).toBeVisible({ timeout: 120_000 });
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
  const path = join(mkdtempSync(join(tmpdir(), "audio-fixes-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}

const start = async (page: Page, slug: string, file: string, button: string) => {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').setInputFiles(file);
  const run = page.getByRole("button", { name: button, exact: true });
  await expect(run).toBeEnabled({ timeout: 60_000 });
  return run;
};

const pick = (page: Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name, exact: true }) }).click();

test.describe("audio fixes", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  test("D1: AIFF stays AIFF on the volume, fade, normalise and silence pages", async ({ page }) => {
    test.setTimeout(240_000);
    for (const [slug, button, suffix] of [
      ["change-audio-volume", "Change volume", "quieter"],
      ["fade-audio", "Fade", "faded"],
      ["normalize-audio", "Normalise", "normalized"],
      ["remove-silence-from-audio", "Remove silence", "cut"],
    ] as const) {
      const run = await start(
        page,
        slug,
        slug === "remove-silence-from-audio"
          ? make("pauses.aiff", ["-i", fx("sample-pauses.wav"), "-c:a", "pcm_s16be"])
          : fx("sample.aiff"),
        button,
      );
      if (slug === "change-audio-volume") {
        await page.getByLabel("Volume change, dB").fill("-6");
        await page.getByLabel("Volume change, dB").press("Tab");
      }
      await run.click();
      const out = await download(page, new RegExp(`-${suffix}\\.aiff$`));
      expect(audioOf(out)?.codec_name).toBe("pcm_s16be");
      if (slug === "change-audio-volume") {
        // −6 dB, so the limiter never acts and the change is the gain alone.
        expect(Math.abs(lufs(out) - lufs(fx("sample.aiff")) + 6)).toBeLessThanOrEqual(0.15);
        await expect(page.getByText(/Measured: .*LUFS → .*LUFS/).first()).toBeVisible();
      }
      if (slug === "normalize-audio") expect(Math.abs(lufs(out) + 16)).toBeLessThanOrEqual(0.15);
    }
  });

  test("D12: an MP3 made 6 dB quieter measures 6 dB quieter, and normalises onto −16", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const run = await start(page, "change-audio-volume", fx("sample.mp3"), "Change volume");
    await page.getByLabel("Volume change, dB").fill("-6");
    await page.getByLabel("Volume change, dB").press("Tab");
    await run.click();
    const out = await download(page, /-quieter\.mp3$/);
    // LAME alone loses about 0.3 dB here; before the correction this measured −6.3.
    expect(Math.abs(lufs(out) - lufs(fx("sample.mp3")) + 6)).toBeLessThanOrEqual(0.15);

    const norm = await start(page, "normalize-audio", fx("sample.mp3"), "Normalise");
    await norm.click();
    const n = await download(page, /-normalized\.mp3$/);
    expect(Math.abs(lufs(n) + 16)).toBeLessThanOrEqual(0.15);
  });

  test("D2, D16: 5.1 at −6 dBFS per channel to mono WAV does not clip and keeps its length", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const src = make("loud51.wav", [
      ...lavfi("0.5*sin(2*PI*440*t)", ":s=48000:d=3:c=5.1"),
      "-c:a",
      "pcm_s16le",
    ]);
    const run = await start(page, "stereo-to-mono", src, "Make mono");
    await run.click();
    const out = await download(page, /\.wav$/);
    expect(audioOf(out)?.channels).toBe(1);
    const s = samples(out);
    expect(s.length).toBe(144_000);
    let peak = 0;
    for (const v of s) peak = Math.max(peak, Math.abs(v));
    expect(20 * Math.log10(peak)).toBeLessThan(-6);
    expect(20 * Math.log10(peak)).toBeGreaterThan(-6.1);
    await expect(
      page.getByText(/mixed down from 6 channels by ITU-R BS\.775/).first(),
    ).toBeVisible();
  });

  test("D3: a 5.1 WAV converts to Opus, mixed to stereo", async ({ page }) => {
    test.setTimeout(120_000);
    const src = make("p51.wav", [
      ...lavfi("0.25*sin(2*PI*440*t)", ":s=48000:d=3:c=5.1"),
      "-c:a",
      "pcm_s16le",
    ]);
    const run = await start(page, "audio-converter", src, "Convert");
    await pick(page, "Opus");
    await run.click();
    const out = await download(page, /\.opus$/);
    expect(audioOf(out)).toMatchObject({ codec_name: "opus", channels: 2 });
  });

  test("D7: 96 kHz to MP3 says 48 kHz, 22.05 kHz at 192 says 160 kbps, as written", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const hi = make("p96.wav", [...lavfi("0.25*sin(2*PI*440*t)", ":s=96000:d=2"), "-ac", "2"]);
    let run = await start(page, "audio-converter", hi, "Convert");
    await pick(page, "MP3");
    await run.click();
    let out = await download(page, /\.mp3$/);
    expect(audioOf(out)?.sample_rate).toBe("48000");
    await expect(page.getByText(/Resampled from 96\skHz to 48\skHz/).first()).toBeVisible();

    const lo = make("p22.wav", [...lavfi("0.25*sin(2*PI*440*t)", ":s=22050:d=2"), "-ac", "2"]);
    run = await start(page, "audio-converter", lo, "Convert");
    await pick(page, "MP3");
    await run.click();
    out = await download(page, /\.mp3$/);
    expect(audioOf(out)?.bit_rate).toBe("160000");
    await expect(page.getByText(/MP3 · 160\skbps/).first()).toBeVisible();
  });

  test("D14: float WAV to FLAC says it keeps 24-bit precision", async ({ page }) => {
    test.setTimeout(120_000);
    const src = make("f32.wav", [
      ...lavfi("0.25*sin(2*PI*440*t)", ":s=48000:d=2"),
      "-c:a",
      "pcm_f32le",
    ]);
    const run = await start(page, "wav-to-flac", src, "Convert");
    await run.click();
    const out = await download(page, /\.flac$/);
    expect(audioOf(out)?.bits_per_raw_sample).toBe("24");
    await expect(page.getByText(/FLAC 24-bit .*kept to 24-bit precision/).first()).toBeVisible();
  });
});

test.describe("cancel on long sound jobs", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  test("normalise and remove silence on a 40-minute WAV stop at once and write nothing", async ({
    page,
  }) => {
    // A 420 MB file does not reach 35% within two minutes on a two-core CI runner; it runs locally.
    test.skip(!!process.env.CI, "Too heavy for the shared CI runner");
    test.setTimeout(240_000);
    // 40 minutes of 44.1 kHz stereo (about 420 MB): long enough that the job is still running.
    const long = make("long.wav", [
      ...lavfi(
        "0.5*sin(2*PI*440*t)*lt(mod(t\\,60)\\,45)|0.5*sin(2*PI*660*t)*lt(mod(t\\,60)\\,45)",
        ":s=44100:d=2400",
      ),
      "-c:a",
      "pcm_s16le",
    ]);
    for (const [slug, button] of [
      ["normalize-audio", "Normalise"],
      ["remove-silence-from-audio", "Remove silence"],
    ] as const) {
      const run = await start(page, slug, long, button);
      await run.click();
      const bar = page.getByRole("progressbar").first();
      await expect
        .poll(async () => Number(await bar.getAttribute("aria-valuenow").catch(() => 0)), {
          timeout: 120_000,
        })
        .toBeGreaterThanOrEqual(35);
      const t0 = Date.now();
      await page
        .getByRole("region", { name: "Workspace" })
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(page.getByRole("button", { name: button, exact: true })).toBeVisible({
        timeout: 1000,
      });
      expect(Date.now() - t0).toBeLessThan(1000);
      // Before the fix the job ran on and its result appeared 13 to 43 s later.
      await page.waitForTimeout(5000);
      await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
    }
  });
});

test.describe("audio fixes in WebKit", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "WebKit only");

  test("D5: remove silence from a video finishes instead of stalling on the H.264 encoder", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const run = await start(
      page,
      "remove-silence-from-video",
      fx("sample-pauses.mp4"),
      "Remove silence",
    );
    await expect(page.getByText(/2 pauses marked/).first()).toBeVisible({ timeout: 30_000 });
    const t0 = Date.now();
    await run.click();
    // Either the file or a specific failure, well inside the stall watchdog's 15 s plus the job.
    const done = page
      .getByRole("link", { name: "Download" })
      .or(page.getByText(/with no progress for|cannot encode H\.264/));
    await expect(done.first()).toBeVisible({ timeout: 60_000 });
    expect(Date.now() - t0).toBeLessThan(60_000);
    const out = await download(page, /-cut\.mp4$/);
    const v = probe(out).streams.find((s) => s.codec_type === "video");
    expect(v?.codec_name).toBe("h264");
    expect(Number(v?.duration)).toBeGreaterThan(6.4);
    expect(Number(v?.duration)).toBeLessThan(6.8);
  });
});
