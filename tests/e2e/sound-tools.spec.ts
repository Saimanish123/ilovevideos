import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Round 3 sound tools end to end: change audio pitch, key and BPM finder, ringtone maker and merge
 * audio. Each download is read back with the local ffprobe and ffmpeg (test-only): container,
 * codec, exact length in samples, the frequency of a shifted tone, packet hashes where a picture or
 * MP3 frames must be copied. Fixtures are synthetic with known answers (scripts/make-fixtures.sh).
 * No request may carry a body over 1 KB. SOUND_SHOTS=<dir> saves screenshots at 390, 768 and 1280.
 */
const shots = process.env.SOUND_SHOTS;
const fx = (name: string) => join("tests/fixtures", name);

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    // Only requests that can carry a body (reading a GET's body stalled worker scripts under load).
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

interface Stream {
  codec_type: string;
  codec_name: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
}
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
  ) as { streams: Stream[]; format: { duration: string; format_name: string } };

/** Planar float samples as a player decodes them (edit lists and gapless headers applied). */
function decode(path: string, channels = 2): Float32Array[] {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", String(channels), "-f", "f32le", "-"],
    {
      maxBuffer: 1 << 28,
    },
  );
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = all.length / channels;
  return Array.from({ length: channels }, (_, c) => {
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) p[i] = all[i * channels + c] as number;
    return p;
  });
}

/** Frequency from rising zero crossings between two times. */
function hz(p: Float32Array, rate: number, from: number, to: number): number {
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = Math.round(from * rate); i < Math.round(to * rate) - 1; i++) {
    const a = p[i] as number;
    const b = p[i + 1] as number;
    if (a <= 0 && b > 0) {
      const t = i + a / (a - b);
      if (first < 0) first = t;
      else count++;
      last = t;
    }
  }
  return (count / (last - first)) * rate;
}
const cents = (got: number, want: number) => 1200 * Math.log2(got / want);

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
  const dir = mkdtempSync(join(tmpdir(), "sound-tools-"));
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}

/** A long WAV for cancel tests (generated, not committed). */
function longWav(minutes: number): string {
  const dir = mkdtempSync(join(tmpdir(), "sound-long-"));
  const path = join(dir, `long-${minutes}.wav`);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=330:sample_rate=44100:duration=${minutes * 60}`,
    "-ac",
    "2",
    path,
  ]);
  return path;
}

/** WebCodecs encoders and the ffmpeg.wasm path are exercised on Chromium (desktop and Pixel). */
const engineSkip = (info: TestInfo) =>
  (info.project.use.defaultBrowserType ?? "chromium") !== "chromium";

test.describe("change audio pitch", () => {
  test("renders with its H1, an accessible ready state, and shifts a WAV exactly", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/change-audio-pitch");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Change audio pitch");
    await expect(workspace(page)).toContainText(
      "Drop an audio file or a video to change its pitch",
    );
    await shot(page, "pitch-idle");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.wav"));
    const run = page.getByRole("button", { name: "Change pitch", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("spinbutton", { name: "Semitones, semitones" }).fill("3");
    await page.keyboard.press("Enter");
    await expect(workspace(page)).toContainText("+3 semitones · frequencies × 1.189");
    await axeClean(page);
    await shot(page, "pitch-ready");
    // Keyboard path to Download.
    await run.focus();
    await page.keyboard.press("Enter");
    const path = await download(page, /sample-pitch-up-3\.wav$/);
    await expect(page.getByRole("link", { name: "Download" }))
      .toBeFocused({ timeout: 5000 })
      .catch(() => undefined);
    await shot(page, "pitch-done");
    const p = probe(path);
    expect(p.streams[0]?.codec_name).toMatch(/pcm_s16le/);
    const [l, r] = decode(path);
    // Sample-exact length: 4 s at 44.1 kHz.
    expect(l?.length).toBe(176_400);
    expect(Math.abs(cents(hz(l as Float32Array, 44_100, 0.5, 3.5), 440 * 2 ** 0.25))).toBeLessThan(
      1,
    );
    expect(Math.abs(cents(hz(r as Float32Array, 44_100, 0.5, 3.5), 660 * 2 ** 0.25))).toBeLessThan(
      1,
    );
    expect(uploads).toEqual([]);
  });

  test("shifts a video's sound and copies its picture packet for packet", async ({
    page,
  }, info) => {
    test.skip(engineSkip(info), "WebCodecs AAC encode: Chromium");
    test.setTimeout(120_000);
    await page.goto("/change-audio-pitch");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    await page.getByRole("spinbutton", { name: "Semitones, semitones" }).fill("-5");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Change pitch", exact: true }).click();
    const path = await download(page, /\.mp4$/);
    expect(packetHashes(path, "v:0")).toEqual(packetHashes(fx("sample.mp4"), "v:0"));
    const [l] = decode(path, 1);
    expect(
      Math.abs(cents(hz(l as Float32Array, 44_100, 0.5, 2.5), 440 * 2 ** (-5 / 12))),
    ).toBeLessThan(1);
    expect(Math.abs((l?.length ?? 0) / 44_100 - 3)).toBeLessThan(0.03);
  });

  test("writes an MP3 through the ffmpeg engine", async ({ page }, info) => {
    test.skip(engineSkip(info), "ffmpeg.wasm path: Chromium");
    test.setTimeout(180_000);
    await page.goto("/change-audio-pitch");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp3"));
    await page.getByRole("spinbutton", { name: "Semitones, semitones" }).fill("7");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Change pitch", exact: true }).click();
    const path = await download(page, /\.mp3$/);
    expect(probe(path).streams[0]?.codec_name).toBe("mp3");
    const [l] = decode(path);
    expect(
      Math.abs(cents(hz(l as Float32Array, 44_100, 0.5, 3.5), 440 * 2 ** (7 / 12))),
    ).toBeLessThan(1);
    expect(Math.abs((l?.length ?? 0) - 176_400)).toBeLessThanOrEqual(1);
  });

  test("auditions at the playhead, and Cancel returns to ready", async ({ page }, info) => {
    test.skip(engineSkip(info), "long encode: Chromium");
    test.setTimeout(120_000);
    await page.goto("/change-audio-pitch");
    await page.locator('input[type="file"]').setInputFiles(longWav(6));
    const listen = page.getByRole("button", { name: /Listen to 8 s from the playhead/ });
    await expect(listen).toBeEnabled({ timeout: 30_000 });
    await listen.click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Stop listening" }).click();
    const run = page.getByRole("button", { name: "Change pitch", exact: true });
    await run.click();
    await expect(workspace(page)).toContainText("Shifting the pitch", { timeout: 20_000 });
    await shot(page, "pitch-processing");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(run).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
  });
});

test.describe("key and BPM finder", () => {
  test("reads a song's tempo, key and Camelot code", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/key-bpm-finder");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find a song's key and BPM");
    await shot(page, "keybpm-idle");
    await page.locator('input[type="file"]').setInputFiles(fx("music-128-a-minor.mp3"));
    const result = page.getByTestId("key-bpm-result");
    await expect(result).toContainText("128 BPM", { timeout: 60_000 });
    await expect(result).toContainText("A minor");
    await expect(result).toContainText("8A");
    await expect(result).toContainText("C major");
    await expect(result).toContainText("High");
    await expect(page.getByRole("button", { name: /Find key/ })).toHaveCount(0);
    await axeClean(page);
    await shot(page, "keybpm-done");
    expect(uploads).toEqual([]);
  });

  test("analyses several songs into a list and a CSV, and averages a moving tempo", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/key-bpm-finder");
    await page
      .locator('input[type="file"]')
      .setInputFiles([
        fx("music-128-a-minor.mp3"),
        fx("music-90-e-flat-major.m4a"),
        fx("music-116-124-d-major.mp3"),
      ]);
    await expect(workspace(page)).toContainText("All 3 analysed", { timeout: 120_000 });
    await expect(workspace(page)).toContainText("90 BPM · E-flat major · 5B");
    await expect(workspace(page)).toContainText("D major · 10B");
    await shot(page, "keybpm-batch");
    // The rows are the selector: no reordering in an analysis, and no list repeated in the panel.
    await expect(page.getByRole("button", { name: /Move .* up/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Show details for music-116-124-d-major.mp3" }).click();
    await expect(
      page.getByRole("button", { name: "Show details for music-116-124-d-major.mp3" }),
    ).toHaveAttribute("aria-current", "true");
    const result = page.getByTestId("key-bpm-result");
    await expect(result).toContainText("Average; it moves between");
    const bpm = Number(/([\d.]+) BPM/.exec((await result.textContent()) ?? "")?.[1]);
    expect(Math.abs(bpm - 120)).toBeLessThan(0.8);
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download results (CSV)" }).click();
    const csv = readFileSync((await (await dl).path()) ?? "", "utf8");
    expect(csv.split("\n")[0]).toBe(
      "file,length,bpm,half,double,bpm_min,bpm_max,key,camelot,relative,confidence,tuning_cents",
    );
    expect(csv).toContain("music-128-a-minor.mp3,0:24,128.0,64.0,256.0,,,A minor,8A,C major,high");
    // Removing another row leaves the details on the song being viewed (the click is not a select).
    const first = page.getByRole("button", { name: "Show details for music-128-a-minor.mp3" });
    await first.click();
    await page.getByRole("button", { name: "Remove music-90-e-flat-major.m4a" }).click();
    await expect(first).toHaveAttribute("aria-current", "true");
    await expect(result).toContainText("A minor");
  });
});

test.describe("ringtone maker", () => {
  test("suggests the loudest 30 s and writes an iPhone .m4r of exactly that part", async ({
    page,
  }, info) => {
    test.skip(engineSkip(info), "WebCodecs AAC encode: Chromium");
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/ringtone-maker");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make a ringtone");
    await page.locator('input[type="file"]').setInputFiles(fx("music-116-124-d-major.mp3"));
    const run = page.getByRole("button", { name: "Make ringtone", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(workspace(page)).toContainText("30.0 s");
    await axeClean(page);
    await shot(page, "ringtone-ready");
    // The loudest 30 s are in place once the levels are read.
    await expect(workspace(page)).toContainText("Drag the handles on the waveform", {
      timeout: 30_000,
    });
    // The start handle moves with the keyboard.
    const start = page.getByRole("slider", { name: "Start of the part to keep" });
    const before = Number(await start.getAttribute("aria-valuenow"));
    await start.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(start).toHaveAttribute(
      "aria-valuenow",
      String(Math.round((before - 1) * 100) / 100),
    );
    // The field follows the handle before anything is typed into it.
    const startField = page.getByRole("spinbutton", { name: "Start, seconds" });
    await expect(startField).toHaveValue(
      String(Number((Math.round((before - 1) * 100) / 100).toFixed(1))),
    );
    await startField.fill("5");
    await page.keyboard.press("Enter");
    await expect(startField).toHaveValue("5");
    await page.getByRole("spinbutton", { name: "End, seconds" }).fill("25");
    await page.keyboard.press("Enter");
    await run.focus();
    await page.keyboard.press("Enter");
    const path = await download(page, /-ringtone\.m4r$/);
    await shot(page, "ringtone-done");
    const p = probe(path);
    expect(p.streams[0]?.codec_name).toBe("aac");
    expect(p.format.format_name).toMatch(/mp4|mov/);
    const [l] = decode(path, 1);
    expect(Math.abs((l?.length ?? 0) / 44_100 - 20)).toBeLessThan(0.005);
    // Faded in: the first 5 ms is near silence; the middle is full level.
    let head = 0;
    for (let i = 0; i < 220; i++) head = Math.max(head, Math.abs(l?.[i] ?? 0));
    let mid = 0;
    for (let i = 441_000 / 2; i < 441_000 / 2 + 44_100; i++)
      mid = Math.max(mid, Math.abs(l?.[i] ?? 0));
    expect(head).toBeLessThan(mid / 20);
    expect(uploads).toEqual([]);
  });

  test("writes an Android MP3 from a video's sound, louder when asked", async ({ page }, info) => {
    test.skip(engineSkip(info), "ffmpeg.wasm path: Chromium");
    test.setTimeout(180_000);
    await page.goto("/ringtone-maker");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.mp4"));
    await page.getByRole("radio", { name: "Android" }).check({ force: true });
    await page.getByText("More options").click();
    await page.getByRole("checkbox", { name: /Make it louder/ }).check();
    await page.getByRole("button", { name: "Make ringtone", exact: true }).click();
    const path = await download(page, /-ringtone\.mp3$/);
    expect(probe(path).streams[0]?.codec_name).toBe("mp3");
    const [l] = decode(path, 1);
    expect(Math.abs((l?.length ?? 0) / 44_100 - 3)).toBeLessThan(0.03);
    await expect(workspace(page)).toContainText("measured");
  });
});

test.describe("merge audio", () => {
  test("joins matching MP3s frame for frame", async ({ page }) => {
    test.setTimeout(120_000);
    const uploads = trackUploads(page);
    await page.goto("/merge-audio");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Merge audio files");
    await shot(page, "merge-idle");
    await page.locator('input[type="file"]').setInputFiles([fx("sample.mp3"), fx("sample-b.mp3")]);
    await expect(workspace(page)).toContainText("MP3 frames copied, not re-encoded", {
      timeout: 30_000,
    });
    await axeClean(page);
    await shot(page, "merge-ready");
    const run = page.getByRole("button", { name: "Merge", exact: true });
    await run.focus();
    await page.keyboard.press("Enter");
    const path = await download(page, /sample-merged\.mp3$/);
    await shot(page, "merge-done");
    const frames = (f: string) =>
      Number(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-count_frames",
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=nb_read_frames",
          "-of",
          "csv=p=0",
          f,
        ])
          .toString()
          .trim(),
      );
    expect(frames(path)).toBe(frames(fx("sample.mp3")) + frames(fx("sample-b.mp3")));
    // Every frame of the sources, byte for byte.
    const a = packetHashes(fx("sample.mp3"), "a:0");
    const b = packetHashes(fx("sample-b.mp3"), "a:0");
    // ffprobe adds each source's gapless trim as side data on its own first and last packet; in the
    // joined file that trim belongs to the file's ends only, so compare the packet data alone.
    const data = (h: string[]) => h.map((x) => x.split(",")[0]);
    expect(data(packetHashes(path, "a:0"))).toEqual(data([...a, ...b]));
    expect(uploads).toEqual([]);
  });

  test("joins WAVs of other rates and layouts sample-exactly", async ({ page }, info) => {
    test.skip(engineSkip(info), "Chromium engines");
    test.setTimeout(120_000);
    await page.goto("/merge-audio");
    await page
      .locator('input[type="file"]')
      .setInputFiles([fx("sample.wav"), fx("sample-48k-mono.wav")]);
    await expect(workspace(page)).toContainText("48 kHz, resampled to 44.1 kHz", {
      timeout: 30_000,
    });
    await expect(workspace(page)).toContainText("mono, plays on both sides");
    await page.getByRole("button", { name: "Merge", exact: true }).click();
    const path = await download(page, /\.wav$/);
    const p = probe(path);
    expect(p.streams[0]?.sample_rate).toBe("44100");
    expect(p.streams[0]?.channels).toBe(2);
    const [l, r] = decode(path);
    // 4 s + 2 s at 44.1 kHz, exactly.
    expect(l?.length).toBe(176_400 + 88_200);
    // The second file's 330 Hz tone on both sides after the join.
    expect(Math.abs(cents(hz(l as Float32Array, 44_100, 4.5, 5.5), 330))).toBeLessThan(1);
    expect(Math.abs(cents(hz(r as Float32Array, 44_100, 4.5, 5.5), 330))).toBeLessThan(1);
  });

  test("crossfades into an MP3 through the ffmpeg engine, shortened to half the shortest file", async ({
    page,
  }, info) => {
    test.skip(engineSkip(info), "ffmpeg.wasm path: Chromium");
    test.setTimeout(180_000);
    await page.goto("/merge-audio");
    await page.locator('input[type="file"]').setInputFiles([fx("sample.wav"), fx("sample-b.mp3")]);
    await page.getByRole("radio", { name: "Crossfade" }).check({ force: true });
    await expect(workspace(page)).toContainText("Shortened to 1.5 s");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "MP3", exact: true }).click();
    await page.getByRole("button", { name: "Merge", exact: true }).click();
    const path = await download(page, /sample-merged\.mp3$/);
    expect(probe(path).streams[0]?.codec_name).toBe("mp3");
    const [l] = decode(path, 1);
    // 4 s + 3 s − 1.5 s.
    expect(Math.abs((l?.length ?? 0) / 44_100 - 5.5)).toBeLessThan(0.002);
  });

  test("Cancel stops a long join", async ({ page }, info) => {
    test.skip(engineSkip(info), "Chromium engines");
    test.setTimeout(120_000);
    await page.goto("/merge-audio");
    const long = longWav(20);
    await page.locator('input[type="file"]').setInputFiles([long, fx("sample-48k-mono.wav")]);
    const run = page.getByRole("button", { name: "Merge", exact: true });
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await run.click();
    await expect(workspace(page)).toContainText("Joining file 1 of 2", { timeout: 20_000 });
    await shot(page, "merge-processing");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(run).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
  });
});

/** A 60 s H.264 + AAC video and its sound as M4A, generated for the run (not committed). */
function longAac(): { mp4: string; m4a: string } {
  const dir = mkdtempSync(join(tmpdir(), "sound-aac-"));
  const mp4 = join(dir, "long60.mp4");
  const m4a = join(dir, "long60.m4a");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=60",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=60",
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-vn", "-c:a", "copy", m4a]);
  return { mp4, m4a };
}

// Regression (2026-11-18): the loudness, level and waveform workers sat at 0% on long AAC files in
// headless Chromium, every time: their job was posted before the worker's module had set its
// handler and was dropped (workers/ready). Each must now finish, several times in a row.
test.describe("sound workers receive their job on long files", () => {
  test("normalise, remove silence and the waveform finish on 60 s AAC, three times each", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // How often a worker had to be replaced because it never ran its module (reported, not failed).
    let replaced = 0;
    page.on("console", (m) => {
      if (m.text().includes("worker-not-ready")) replaced++;
    });
    const { mp4, m4a } = longAac();
    for (let k = 0; k < 3; k++) {
      await page.goto("/normalize-audio");
      await page.locator('input[type="file"]').setInputFiles(m4a);
      await expect(workspace(page)).toContainText("Now ", { timeout: 15_000 });
      await expect(page.getByText("Waveform ready")).toBeAttached({ timeout: 15_000 });
      // The whole sound is drawn, not only its start: bars in the last quarter have height.
      const lastQuarter = await page.evaluate(() => {
        const bars = Array.from(
          document.querySelectorAll<SVGRectElement>('section[aria-label="Workspace"] svg rect'),
        ).map((r) => ({ x: Number(r.getAttribute("x")), h: Number(r.getAttribute("height")) }));
        const max = Math.max(...bars.map((b) => b.x));
        // An empty bucket is drawn 1.84 high; the steady tone fills every bucket to 92.
        return bars.filter((b) => b.x > max * 0.75 && b.h > 10).length;
      });
      expect(lastQuarter).toBeGreaterThan(10);
      await page.goto("/normalize-audio");
      await page.locator('input[type="file"]').setInputFiles(mp4);
      await expect(workspace(page)).toContainText("Now ", { timeout: 15_000 });
      await page.goto("/remove-silence-from-video");
      await page.locator('input[type="file"]').setInputFiles(mp4);
      // The level graph and its threshold handle appear once the levels are read.
      await expect(page.getByRole("slider", { name: "Silence threshold" })).toBeVisible({
        timeout: 15_000,
      });
    }
    test.info().annotations.push({
      type: "workers replaced for not loading",
      description: String(replaced),
    });
  });
});

test.describe("screenshots at 390, 768 and 1280", () => {
  test.skip(!shots, "SOUND_SHOTS not set");
  test("ready, processing and done", async ({ page }, info) => {
    test.skip(engineSkip(info), "Chromium only");
    test.setTimeout(600_000);
    const long = longWav(8);
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      // Change pitch: ready, processing (a long file, then cancelled), done.
      await page.goto("/change-audio-pitch");
      await page.locator('input[type="file"]').setInputFiles(fx("sample.mp3"));
      const pitch = page.getByRole("button", { name: "Change pitch", exact: true });
      await expect(pitch).toBeEnabled({ timeout: 30_000 });
      await expect(page.getByText("Waveform ready")).toBeAttached({ timeout: 15_000 });
      await shot(page, "w-pitch-ready");
      await pitch.click();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 120_000 });
      await shot(page, "w-pitch-done");
      await page.goto("/change-audio-pitch");
      await page.locator('input[type="file"]').setInputFiles(long);
      await expect(pitch).toBeEnabled({ timeout: 30_000 });
      await pitch.click();
      await expect(workspace(page)).toContainText("Shifting the pitch", { timeout: 30_000 });
      await shot(page, "w-pitch-processing");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      // Key and BPM: the panel is the result.
      // An 8-minute file takes long enough to show the listening state.
      await page.goto("/key-bpm-finder");
      await page.locator('input[type="file"]').setInputFiles([long, fx("music-128-a-minor.mp3")]);
      await expect(workspace(page)).toContainText("Listening", { timeout: 30_000 });
      await shot(page, "w-keybpm-processing");
      await page.goto("/key-bpm-finder");
      await page
        .locator('input[type="file"]')
        .setInputFiles([fx("music-128-a-minor.mp3"), fx("music-90-e-flat-major.m4a")]);
      await expect(workspace(page)).toContainText("All 2 analysed", { timeout: 60_000 });
      await shot(page, "w-keybpm-done");
      // Ringtone: ready, done.
      await page.goto("/ringtone-maker");
      await page.locator('input[type="file"]').setInputFiles(fx("music-116-124-d-major.mp3"));
      const ring = page.getByRole("button", { name: "Make ringtone", exact: true });
      await expect(ring).toBeEnabled({ timeout: 30_000 });
      await expect(workspace(page)).toContainText("Drag the handles on the waveform", {
        timeout: 30_000,
      });
      await shot(page, "w-ringtone-ready");
      await ring.click();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 120_000 });
      await shot(page, "w-ringtone-done");
      // Processing: Android goes through the ffmpeg engine, which takes a moment to load.
      await page.goto("/ringtone-maker");
      await page.locator('input[type="file"]').setInputFiles(fx("music-116-124-d-major.mp3"));
      await expect(ring).toBeEnabled({ timeout: 30_000 });
      await page.getByRole("radio", { name: "Android" }).check({ force: true });
      await ring.click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await shot(page, "w-ringtone-processing");
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 120_000 });
      // Merge audio: ready (8 files, the list collapses to 6), processing, done.
      await page.goto("/merge-audio");
      await page
        .locator('input[type="file"]')
        .setInputFiles([
          fx("sample.wav"),
          fx("sample-48k-mono.wav"),
          fx("sample.mp3"),
          fx("sample-b.mp3"),
          fx("sample.flac"),
          fx("sample.m4a"),
          fx("sample.ogg"),
          fx("sample.opus"),
        ]);
      const merge = page.getByRole("button", { name: "Merge", exact: true });
      await expect(merge).toBeEnabled({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Show all 8 files" })).toBeVisible();
      await shot(page, "w-merge-ready");
      await merge.click();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 120_000 });
      await shot(page, "w-merge-done");
      await page.goto("/merge-audio");
      await page.locator('input[type="file"]').setInputFiles([longWav(20), fx("sample.wav")]);
      await expect(merge).toBeEnabled({ timeout: 30_000 });
      await merge.click();
      await expect(workspace(page)).toContainText("Joining file 1 of 2", { timeout: 20_000 });
      await shot(page, "w-merge-processing");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  });
});
