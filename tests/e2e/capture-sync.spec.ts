import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Sound against picture in a recording (ADR-0100): Chromium's fake camera and microphone play
 * tests/fixtures/capture-sync.y4m and .wav (a white flash and a 1 kHz click at the start of every
 * second; scripts/make-fixtures.sh), and the first click in the file must land within a frame of
 * its flash. Read back with the local ffmpeg (test-only). Chromium only: WebKit has no fake devices.
 */
const fx = (name: string) => resolve("tests/fixtures", name);
const FAKE = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  `--use-file-for-fake-video-capture=${fx("capture-sync.y4m")}`,
  `--use-file-for-fake-audio-capture=${fx("capture-sync.wav")}`,
];

test.use({
  launchOptions: [
    async ({ browserName }, use) => use(browserName === "chromium" ? { args: FAKE } : {}),
    { scope: "worker" },
  ] as never,
  permissions: [
    async ({ browserName }, use) => use(browserName === "chromium" ? ["camera", "microphone"] : []),
    {},
  ] as never,
});

async function download(page: Page, dir: string): Promise<string> {
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const d = await pending;
  const path = join(dir, d.suggestedFilename());
  await d.saveAs(path);
  return path;
}
const dir = () => mkdtempSync(join(tmpdir(), "capture-sync-"));

/** The recorder is hydrated (its own chunk loads after the page's HTML): clicks act from here. */
const ready = (page: Page) =>
  page.locator('section[aria-label="Workspace"][data-ready]').waitFor({ timeout: 20_000 });

test.describe("sound against picture", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium fake devices only");
  test.setTimeout(60_000);

  test("webcam: sound and picture keep the devices' own timing, within a frame", async ({
    page,
  }) => {
    const out = dir();
    await page.goto("/webcam-recorder");
    await ready(page);
    await page.getByRole("button", { name: "Turn on camera" }).click();
    await expect(page.getByRole("status").filter({ hasText: /\d+×\d+ · \d+ fps/ })).toBeVisible();
    // The fake camera and microphone start their files independently, so first measure where the
    // devices themselves put each click against its flash (by arrival on the page, the clock the
    // recorder aligns its sources on); the recording must keep that relation.
    const device = await page.evaluate(async () => {
      type Proc = new (o: {
        track: MediaStreamTrack;
      }) => {
        readable: ReadableStream<VideoFrame | AudioData>;
      };
      const P = (globalThis as unknown as { MediaStreamTrackProcessor: Proc })
        .MediaStreamTrackProcessor;
      const v = document.querySelector<HTMLVideoElement>('video[aria-label="Camera preview"]');
      const stream = v?.srcObject as MediaStream;
      const vt = stream.getVideoTracks()[0]?.clone();
      const at = stream.getAudioTracks()[0]?.clone();
      if (!vt || !at) return Number.NaN;
      const flashes: number[] = [];
      const clicks: number[] = [];
      const until = performance.now() + 2500;
      const vr = new P({ track: vt }).readable.getReader();
      const ar = new P({ track: at }).readable.getReader();
      // The centre luma byte of each frame, copied out (no canvas read-back stalling the page
      // while the sound is being timed), with the frame's arrival time.
      const kept: [number, number][] = [];
      const video = (async () => {
        while (performance.now() < until) {
          const { value } = await vr.read();
          if (!value) break;
          const f = value as VideoFrame;
          const t = performance.now() / 1000;
          const buf = new Uint8Array(f.allocationSize());
          const layout = await f.copyTo(buf);
          f.close();
          const y0 = layout[0];
          const row = Math.floor(f.codedHeight / 2);
          kept.push([
            t,
            buf[(y0?.offset ?? 0) + row * (y0?.stride ?? 0) + Math.floor(f.codedWidth / 2)] ?? 0,
          ]);
        }
      })();
      let lastClick = -1;
      while (performance.now() < until) {
        const { value } = await ar.read();
        if (!value) break;
        const d = value as AudioData;
        const buf = new Float32Array(d.numberOfFrames);
        d.copyTo(buf, { planeIndex: 0, format: "f32-planar" });
        const i = buf.findIndex((x) => Math.abs(x) > 0.1);
        // Arrival time, as the recorder aligns its sources: the chunk's end arrives now.
        const t = performance.now() / 1000 - (d.numberOfFrames - Math.max(0, i)) / d.sampleRate;
        if (i >= 0 && t - lastClick > 0.5) {
          clicks.push(t);
          lastClick = t;
        }
        d.close();
      }
      await video;
      let prev = 0;
      for (const [t, y] of kept) {
        if (y > 128 && prev <= 128) flashes.push(t);
        prev = y;
      }
      vt.stop();
      at.stop();
      const offsets = clicks.map((c) => {
        const f = flashes.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a));
        return c - f;
      });
      // The fixture repeats every second: fold each pair into one period and take the median, so
      // a click caught before the first flash read does not pair with the next one.
      const folded = offsets.map((o) => o - Math.round(o)).sort((a, b) => a - b);
      return folded[Math.floor(folded.length / 2)] ?? Number.NaN;
    });
    expect(Number.isFinite(device)).toBe(true);
    await page.getByText("Count down 3, 2, 1").click();
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(
      page.locator("[data-live-line]").filter({ hasText: /Recording\s*\d+:\d\d/ }),
    ).toBeVisible();
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Video recorded", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const path = await download(page, out);
    // Flashes: frames whose mean luma jumps above mid grey.
    const frames = execFileSync("ffprobe", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `movie=${path},signalstats`,
      "-show_entries",
      "frame=pts_time:frame_tags=lavfi.signalstats.YAVG",
      "-of",
      "csv=p=0",
    ])
      .toString()
      .trim()
      .split("\n")
      .map((l) => l.split(",").map(Number) as [number, number]);
    const flashes: number[] = [];
    frames.forEach(([t, y], i) => {
      if (y > 120 && (frames[i - 1]?.[1] ?? 0) <= 120) flashes.push(t);
    });
    const pcm = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", path, "-ac", "1", "-ar", "48000", "-f", "s16le", "-"],
      {
        maxBuffer: 64 * 1024 * 1024,
      },
    ).stdout;
    const s = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    // The first click in the file, nearest in time to the device measurement: Chromium's fake
    // camera runs its content about 1.1 % slow, so later clicks drift from their flashes by about
    // 11 ms a second whatever the recorder does. Folded into one period, like the device's.
    const firstClick = s.findIndex((v) => Math.abs(v) > 3000) / 48_000;
    const nearest = flashes.reduce((a, b) =>
      Math.abs(b - firstClick) < Math.abs(a - firstClick) ? b : a,
    );
    const added = firstClick - nearest - device;
    const offsetMs = (added - Math.round(added)) * 1000;
    test.info().annotations.push({
      type: "sync",
      description: `sound minus picture at the first click: ${offsetMs.toFixed(1)} ms`,
    });
    // Within a frame and a half at 30 fps; the harness itself moves by up to about 25 ms.
    expect(Math.abs(offsetMs)).toBeLessThan(50);
  });
});
