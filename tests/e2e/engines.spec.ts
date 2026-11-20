import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { clickCheck, soundCheck } from "./sound";

/**
 * Real processing, end to end, in Chromium: drop a fixture, press the verb, get a Download link.
 * Runs on desktop Chromium and the mobile Chrome profile. Fixtures come from `pnpm fixtures` (ffmpeg).
 * WebKit is skipped: Playwright's WebKit build has no WebCodecs encoder.
 */
const cases: Array<{ slug: string; verb: string; fixture: string }> = [
  { slug: "compress-video", verb: "Compress", fixture: "tests/fixtures/sample.mp4" },
  { slug: "mov-to-mp4", verb: "Convert", fixture: "tests/fixtures/sample.mov" },
  { slug: "mkv-to-mp4", verb: "Convert", fixture: "tests/fixtures/sample.mkv" },
  { slug: "webm-to-mp4", verb: "Convert", fixture: "tests/fixtures/sample.webm" },
  { slug: "mp4-to-webm", verb: "Convert", fixture: "tests/fixtures/sample.mp4" },
  { slug: "video-converter", verb: "Convert", fixture: "tests/fixtures/sample.mkv" },
  { slug: "trim-video", verb: "Trim", fixture: "tests/fixtures/sample.mp4" },
  { slug: "remove-audio-from-video", verb: "Remove audio", fixture: "tests/fixtures/sample.mp4" },
];

for (const c of cases) {
  test(`${c.slug} processes a file on-device`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebCodecs encoding is only available in Chromium here");
    test.setTimeout(120_000);

    const uploads: number[] = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (body && body.length > 1024) uploads.push(body.length);
    });

    await page.goto(`/${c.slug}`);
    await page.locator('input[type="file"]').setInputFiles(c.fixture);
    const button = page.getByRole("button", { name: c.verb, exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const download = page.getByRole("link", { name: "Download" });
    await expect(download).toBeVisible({ timeout: 90_000 });
    await expect(download).toHaveAttribute("href", /^blob:/);
    // The blob URL must still be alive and non-empty (guards against revoked object URLs).
    const href = await download.getAttribute("href");
    const size = await page.evaluate(async (u) => (await (await fetch(u ?? "")).blob()).size, href);
    expect(size).toBeGreaterThan(1000);
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });
}

/** Packet bytes, frame count and average bitrates of a file's primary tracks, read with mediabunny. */
async function packets(bytes: Buffer) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  // Every packet unless a start is given: priming and pre-roll packets sit before zero (edit list).
  const read = async (t: typeof video | typeof audio, from = Number.NEGATIVE_INFINITY) => {
    if (!t) return [];
    const out: string[] = [];
    for await (const p of new EncodedPacketSink(t).packets())
      if (p.timestamp + p.duration / 2 >= from) out.push(Buffer.from(p.data).toString("base64"));
    return out;
  };
  const out = {
    videoCodec: video?.codec,
    audioCodec: audio?.codec,
    video: await read(video),
    audio: await read(audio),
    audioBitrate: audio ? (await audio.computePacketStats()).averageBitrate : 0,
    /** Sound packets whose middle is at or after `from` seconds. */
    audioFrom: (from: number) => read(audio, from),
  };
  return { ...out, dispose: () => input.dispose() };
}

test.describe("stream copy and sound timing", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium engines only");

  test("trim-video lossless copies the streams from the key frame before the start", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/trim-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Trim", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await page.locator("#start").fill("1.2");
    await page.locator("#start").press("Enter");
    // Key frames every second: the summary says the cut starts at 1 s, before anything runs.
    await expect(
      page.getByText(/^Starts at 0:01\.00, the key frame before 0:01\.20\. Streams copied/),
    ).toBeVisible();
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByText(
        /Starts at 0:01\.00, the key frame before 0:01\.20 · 0:02\.00 kept · streams copied/,
      ),
    ).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const path = await file.path();

    const out = await packets(readFileSync(path));
    const src = await packets(readFileSync("tests/fixtures/sample.mp4"));
    expect(out.videoCodec).toBe("avc");
    expect(out.audioCodec).toBe("aac");
    // Byte for byte: the last two seconds of video (60 frames from the 1 s key frame).
    expect(out.video).toEqual(src.video.slice(30));
    expect(out.video).toHaveLength(60);
    // Sound: the source's own packets from 1 s on, plus the one before as decoder pre-roll, which
    // the edit list skips (a re-encode would change every packet).
    // The output is one unbroken run of the source's packets, and it opens before the first packet
    // whose middle is past 1 s (the packet holding 1 s, and one more before it as pre-roll).
    const fromOne = await src.audioFrom(1);
    const at = src.audio.indexOf(out.audio[0] ?? "");
    expect(at).toBeGreaterThan(0);
    expect(out.audio).toEqual(src.audio.slice(at, at + out.audio.length));
    expect(out.audio.indexOf(fromOne[0] ?? "")).toBeGreaterThanOrEqual(1);
    // The copy keeps the source's audio bitrate (a re-encode raised 96 kbps to about 160 kbps).
    expect(Math.abs(out.audioBitrate - src.audioBitrate) / src.audioBitrate).toBeLessThan(0.02);
    out.dispose();
    src.dispose();
    const sound = soundCheck(path);
    const source = soundCheck("tests/fixtures/sample.mp4");
    if (sound && source) {
      expect(Math.abs(sound.bitrate - source.bitrate) / source.bitrate).toBeLessThan(0.02);
      expect(sound.seconds).toBeCloseTo(2, 2);
    }
  });

  test("mov-to-mp4 copies every video and sound packet, priming included", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/mov-to-mp4");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mov");
    const button = page.getByRole("button", { name: "Convert", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const path = await file.path();
    const out = await packets(readFileSync(path));
    const src = await packets(readFileSync("tests/fixtures/sample.mov"));
    // Conversion used to re-encode this AAC (its first packet is ffmpeg's priming, before zero):
    // 133 packets at 176 kbps instead of the source's 131 at 97 kbps.
    expect(out.video).toEqual(src.video);
    expect(out.audio).toEqual(src.audio);
    out.dispose();
    src.dispose();
    const sound = soundCheck(path);
    if (sound) {
      expect(sound.start).toBeCloseTo(0, 3);
      expect(sound.seconds).toBeCloseTo(3, 2);
    }
  });

  test("webm-to-mov writes H.264 and AAC, never Opus in MOV", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/webm-to-mov");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.webm");
    const button = page.getByRole("button", { name: "Convert", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 120_000 });
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const out = await packets(readFileSync(await file.path()));
    // Before: mediabunny's MOV muxer took the Opus as it was, which Keynote and iMovie cannot import.
    expect(out.videoCodec).toBe("avc");
    expect(out.audioCodec).toBe("aac");
    out.dispose();
  });

  test("extract audio to WAV decodes the first AAC frame whole and ends on time", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/extract-audio-from-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample-clicks.mp4");
    const button = page.getByRole("button", { name: "Extract audio", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    // Format choices are radios visually hidden inside their label, which takes the click.
    await page
      .locator("label", { has: page.getByRole("radio", { name: "WAV", exact: true }) })
      .click();
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const sound = soundCheck(await file.path());
    test.skip(!sound, "ffmpeg is not installed");
    if (!sound) return;
    // Before: the click at 0 s was lost (first frame decoded without its priming packet) and the
    // WAV ran 3.0186 s, the AAC padding included.
    expect(sound.onset).toBeLessThan(0.001);
    expect(sound.seconds).toBeCloseTo(3, 3);
  });

  test("mp3-to-wav trims the LAME encoder delay and padding", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/mp3-to-wav");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp3");
    const button = page.getByRole("button", { name: "Convert", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const sound = soundCheck(await file.path());
    test.skip(!sound, "ffmpeg is not installed");
    if (!sound) return;
    // Before: 25 ms late (1105 samples of delay) and 4.049 s long; ffmpeg reads the source as 4.000 s.
    expect(sound.onset).toBeLessThan(0.001);
    expect(sound.seconds).toBeCloseTo(4, 3);
  });

  test("compress-video starts the sound on time and ends it with the picture", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/compress-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Compress", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const sound = soundCheck(await file.path());
    test.skip(!sound, "ffmpeg is not installed");
    if (!sound) return;
    // Before the edit list: onset 0.0587 s and 3.088 s of sound for a 3.0 s source. Before the sound
    // decoded with pre-roll in its own Conversion (../src/tools/engines/mediabunny/sound-split), the
    // first AAC frame came out attenuated: onset 10.8 ms. Now 0.16 ms (the tone's first loud sample).
    expect(sound.start).toBeCloseTo(0, 3);
    expect(sound.seconds).toBeCloseTo(3, 2);
    expect(sound.onset).toBeLessThan(0.001);
  });

  /** Drops the clicks fixture on a page, runs it, and returns the downloaded file's path. */
  const runClicks = async (
    page: import("@playwright/test").Page,
    slug: string,
    verb: string,
    before?: (page: import("@playwright/test").Page) => Promise<void>,
  ) => {
    await page.goto(`/${slug}`);
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample-clicks.mp4");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await before?.(page);
    const button = page.getByRole("button", { name: verb, exact: true });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await button.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 120_000 });
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    return file.path();
  };

  /** Clicks a segmented option once it is on the page: the radio is visually hidden in its label. */
  const choose = async (page: import("@playwright/test").Page, name: string) => {
    const radio = page.getByRole("radio", { name, exact: true });
    await expect(radio).toBeAttached({ timeout: 30_000 });
    await page.locator("label", { has: radio }).click();
  };

  for (const c of [
    // The fixture is already smaller than Balanced would make it; Smaller still runs.
    { slug: "compress-video", verb: "Compress", option: "Smaller" },
    { slug: "change-video-aspect-ratio", verb: "Change aspect ratio", option: undefined },
  ]) {
    test(`${c.slug} keeps the first frame of sound whole beside the picture`, async ({ page }) => {
      test.setTimeout(150_000);
      const option = c.option;
      const clicks = clickCheck(
        await runClicks(page, c.slug, c.verb, option ? (p) => choose(p, option) : undefined),
      );
      test.skip(!clicks, "ffmpeg is not installed");
      if (!clicks) return;
      // Before: the click at 0 s was gone (peak 0.0000; the first AAC frame decoded without the one
      // before it). Now it is whole, every click is where the source puts it, and the length is exact.
      expect(clicks.firstPeak).toBeGreaterThan(0.5);
      expect(clicks.worstMs).toBeLessThan(0.1);
      expect(clicks.samples).toBe(132_300);
    });
  }

  test("trim-video frame-accurate: the sound at the cut is whole", async ({ page }) => {
    test.setTimeout(150_000);
    const path = await runClicks(page, "trim-video", "Trim", async (p) => {
      await expect(p.locator("#start")).toBeVisible({ timeout: 30_000 });
      await p.locator("#start").fill("1");
      await p.locator("#start").blur();
      await p.locator("#end").fill("2");
      await p.locator("#end").blur();
      await p.getByText("Frame-accurate cut").click();
    });
    const clicks = clickCheck(path);
    test.skip(!clicks, "ffmpeg is not installed");
    if (!clicks) return;
    // Before: the click at the 1 s cut was gone (decoding started on the packet holding 1 s).
    expect(clicks.firstPeak).toBeGreaterThan(0.5);
    expect(clicks.worstMs).toBeLessThan(0.1);
    expect(clicks.samples).toBe(44_100);
  });

  test("mp4-to-webm writes Opus that starts and ends with the sound", async ({ page }) => {
    test.setTimeout(150_000);
    const path = await runClicks(page, "mp4-to-webm", "Convert");
    const clicks = clickCheck(path);
    test.skip(!clicks, "ffmpeg is not installed");
    if (!clicks) return;
    // Before: 144 648 samples (13.5 ms of encoder padding played: no DiscardPadding, CodecDelay 0),
    // the click at 0 s gone and every click 0.7 ms late (the encoder's resampling delay was not in
    // the pre-skip). Now exactly 3 s at 48 kHz.
    expect(clicks.rate).toBe(48_000);
    expect(clicks.samples).toBe(144_000);
    expect(clicks.firstPeak).toBeGreaterThan(0.5);
    expect(clicks.worstMs).toBeLessThan(0.1);
  });

  test("extract audio to Opus ends with the sound", async ({ page }) => {
    test.setTimeout(150_000);
    const path = await runClicks(page, "extract-audio-from-video", "Extract audio", async (p) => {
      await choose(p, "Other format");
      await p.locator("#to").click();
      await p.getByRole("option", { name: "Opus" }).click();
    });
    const clicks = clickCheck(path);
    test.skip(!clicks, "ffmpeg is not installed");
    if (!clicks) return;
    // Before: 143 688 samples, 6.5 ms short (the encoder's flush dropped its look-ahead).
    expect(clicks.samples).toBe(144_000);
    expect(clicks.firstPeak).toBeGreaterThan(0.5);
    expect(clicks.worstMs).toBeLessThan(0.1);
  });
});

test.describe("encoders and decoders the browser lacks", () => {
  test("compress never sits silently on an encoder that returns no frames", async ({
    page,
    browserName,
  }) => {
    // Playwright WebKit (Safari 26.5 engine) accepts H.264 High profile and never returns a frame;
    // before, the page showed "0:00 of 0:03 processed" for good. Now it says so within seconds
    // (a 5 s probe), or, in a build whose encoder works, finishes.
    test.skip(browserName !== "webkit", "the stalling encoder is WebKit's");
    test.setTimeout(90_000);
    await page.goto("/compress-video");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mp4");
    const button = page.getByRole("button", { name: "Compress", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    await expect(
      page
        .getByRole("link", { name: "Download", exact: true })
        .or(page.getByText(/could not write a short test video/)),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("a ProRes picture this browser cannot decode is refused, not dropped", async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== "chromium", "Chromium has no ProRes decoder");
    test.setTimeout(120_000);
    const path = info.outputPath("prores.mov");
    const made = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=25:duration=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-c:v",
      "prores_ks",
      "-profile:v",
      "2",
      "-c:a",
      "pcm_s16le",
      path,
    ]);
    test.skip(!!made.error || made.status !== 0, "ffmpeg with prores_ks is not installed");
    await page.goto("/compress-video");
    await page.locator('input[type="file"]').setInputFiles(path);
    // Said before the run (the page blocks it, offering the converter) or, failing that, on Run.
    // Before: an audio-only file reported as "Fits under 8 MB: 48.1 kB".
    const reason = page.getByText(/cannot decode the ProRes video/).first();
    const button = page.getByRole("button", { name: "Compress", exact: true });
    await expect(reason.or(button).first()).toBeVisible({ timeout: 30_000 });
    if (!(await reason.isVisible()) && (await button.isEnabled())) await button.click();
    await expect(reason).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(0);
  });
});

test.describe("AAC from WebKit's encoder", () => {
  test("replace audio writes AAC that starts on time and keeps its first frame", async ({
    page,
    browserName,
  }) => {
    // WebKit's AAC encoder (Safari 26.5 engine) hands out an ES_Descriptor its own decoder rejects,
    // so the priming probe failed and no edit list was written (sound 65 ms late); it also silences
    // its first 1024 input samples and stamps packets with the wrong times.
    test.skip(browserName !== "webkit", "the quirks are WebKit's; Chromium is covered above");
    test.setTimeout(120_000);
    await page.goto("/replace-audio-in-video");
    await page
      .locator('input[type="file"]')
      .setInputFiles(["tests/fixtures/sample.mp4", "tests/fixtures/sample.wav"]);
    const replace = page.getByRole("button", { name: "Replace audio", exact: true });
    await expect(replace).toBeEnabled({ timeout: 30_000 });
    await replace.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const sound = soundCheck(await file.path());
    test.skip(!sound, "ffmpeg is not installed");
    if (!sound) return;
    // The WAV's tone is loud from its first samples; 3 s video, so 3 s of sound.
    expect(sound.onset).toBeLessThan(0.001);
    expect(sound.seconds).toBeCloseTo(3, 3);
  });

  test("a volume change to M4A (the sound render path) starts on time with its first click", async ({
    page,
    browserName,
  }, info) => {
    // Sound render feeds the encoder by hand: before the lead it lost the first 1024 samples to
    // WebKit's encoder (the first click) and started a frame late.
    test.skip(browserName !== "webkit", "the quirks are WebKit's");
    test.setTimeout(120_000);
    const m4a = info.outputPath("clicks.m4a");
    const made = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      "tests/fixtures/sample-clicks.mp4",
      "-vn",
      "-c:a",
      "copy",
      m4a,
    ]);
    test.skip(made.status !== 0, "ffmpeg is not installed");
    const source = clickCheck(m4a);
    await page.goto("/change-audio-volume");
    await page.locator('input[type="file"]').setInputFiles(m4a);
    const run = page.getByRole("button", { name: "Change volume", exact: true });
    await expect(run).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Volume change, dB").fill("-3");
    await page.getByLabel("Volume change, dB").press("Tab");
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await run.click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 90_000 });
    await expect(download).toHaveAttribute("download", /\.m4a$/);
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const path = await file.path();
    const clicks = clickCheck(path);
    const sound = soundCheck(path);
    expect(clicks && sound && source).toBeTruthy();
    if (!clicks || !sound || !source) return;
    // −3 dB of a 0.6 click is 0.42; the first frame lost or attenuated reads near 0.
    expect(clicks.firstPeak).toBeGreaterThan(0.3);
    expect(clicks.worstMs).toBeLessThan(0.1);
    expect(sound.onset).toBeLessThan(0.001);
    expect(Math.abs(clicks.samples - source.samples)).toBeLessThanOrEqual(2);
  });
});
