import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * The three recorders end to end (ADR-0099) with Chromium's fake devices: a fake screen, camera and
 * microphone stand in for real ones, the share dialog picks the whole screen by itself, and every
 * recording is read back with the local ffprobe/ffmpeg (test-only): container, codecs, size, length,
 * pauses left out (sound against picture: ./capture-sync.spec.ts). WebKit in Playwright has
 * no fake devices and denies them, so there it checks the pages and the denial message.
 * Set CAPTURE_SHOTS=<dir> for screenshots of each state at the viewport's width.
 */
const shots = process.env.CAPTURE_SHOTS;

const FAKE = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--auto-select-desktop-capture-source=Entire screen",
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

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

interface Stream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
}
const probe = (path: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels:format=duration,format_name",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as { streams: Stream[]; format: { duration: string; format_name: string } };

async function download(page: Page, dir: string): Promise<string> {
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const d = await pending;
  const path = join(dir, d.suggestedFilename());
  await d.saveAs(path);
  return path;
}

const dir = () => mkdtempSync(join(tmpdir(), "capture-"));

/** The recorder is hydrated (its own chunk loads after the page's HTML): clicks act from here. */
const ready = (page: Page) =>
  page.locator('section[aria-label="Workspace"][data-ready]').waitFor({ timeout: 20_000 });

test.describe("recorder pages", () => {
  for (const [slug, h1] of [
    ["screen-recorder", "Record your screen"],
    ["webcam-recorder", "Record webcam video"],
    ["voice-recorder", "Record your voice"],
  ] as const) {
    test(`${slug} renders with no axe violations`, async ({ page }) => {
      await page.goto(`/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
      await expect(page.getByRole("region", { name: "Workspace" })).toBeVisible();
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
      await shot(page, `${slug}-idle`);
    });
  }

  test("screen recorder: a browser without screen capture says why", async ({ page }) => {
    // As on a phone: no getDisplayMedia at all.
    await page.addInitScript(() => {
      try {
        delete (MediaDevices.prototype as { getDisplayMedia?: unknown }).getDisplayMedia;
      } catch {}
      try {
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { value: undefined });
      } catch {}
    });
    await page.goto("/screen-recorder");
    await ready(page);
    // A computer names the browsers that can; a phone or tablet points to its own recorder.
    await expect(
      page.getByText(
        /This browser cannot record the screen\.|do not let a web page record the screen/,
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(0);
    await shot(page, "screen-recorder-blocked");
  });

  test("voice recorder: a blocked microphone gives a specific message", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    await page.goto("/voice-recorder");
    await ready(page);
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "The microphone is blocked for this site" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();
  });
});

test.describe("recording (Chromium fake devices)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebKit has no fake media devices");
  test.setTimeout(90_000);

  test("screen: with the microphone already allowed, the picker names it, not off", async ({
    page,
  }) => {
    await page.goto("/screen-recorder");
    await ready(page);
    const mic = page.getByLabel("Microphone");
    // Permission is granted in this context, so the real devices are listed; the default stays on.
    await expect(mic.locator("option", { hasText: "Fake Default Audio Input" })).toHaveCount(1);
    await expect
      .poll(() => mic.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent))
      .toBe("Fake Default Audio Input");
    await expect
      .poll(() =>
        page
          .getByLabel("Camera bubble")
          .evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent),
      )
      .toBe("No camera bubble");
    await shot(page, "screen-recorder-idle-granted");
  });

  test("screen: keyboard start, pause left out, stop, MP4 out, handed to trim", async ({
    page,
  }) => {
    const out = dir();
    await page.goto("/screen-recorder");
    await ready(page);
    // Microphone on (default) and the shared sound: both mixed into one track.
    await page.getByRole("button", { name: "Start recording" }).focus();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(
      page.locator("[data-live-line]").filter({ hasText: /Recording\s*\d+:\d\d/ }),
    ).toBeVisible();
    // Start recording is gone: focus is on Stop, not lost to the page.
    await expect(page.getByRole("button", { name: "Stop" })).toBeFocused();
    await page.waitForTimeout(2500);
    await shot(page, "screen-recorder-recording");
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator("[data-live-line]").filter({ hasText: "Paused" })).toBeVisible();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Resume" }).click();
    await page.waitForTimeout(1500);
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.getByText("Screen recorded", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, "screen-recorder-done");
    // Keyboard to Download: the link is a tab stop.
    await page.getByRole("link", { name: "Download", exact: true }).focus();
    const pending = page.waitForEvent("download");
    await page.keyboard.press("Enter");
    const d = await pending;
    expect(d.suggestedFilename()).toMatch(/^screen-recording-\d{4}-\d{2}-\d{2}-\d{4}\.mp4$/);
    const path = join(out, d.suggestedFilename());
    await d.saveAs(path);
    const p = probe(path);
    const v = p.streams.find((s) => s.codec_type === "video");
    const a = p.streams.find((s) => s.codec_type === "audio");
    expect(p.format.format_name).toContain("mp4");
    expect(v?.codec_name).toBe("h264");
    expect((v?.width ?? 1) % 2).toBe(0);
    expect((v?.height ?? 1) % 2).toBe(0);
    expect(v?.avg_frame_rate).toBe("30/1");
    expect(a?.codec_name).toBe("aac");
    expect(a?.channels).toBe(2);
    // 2.5 s + 1.5 s recorded; the 2 s pause is not in the file.
    const length = Number(p.format.duration);
    expect(length).toBeGreaterThan(3.4);
    expect(length).toBeLessThan(4.8);
    // The next step carries the recording to trim.
    await page.getByRole("link", { name: "Trim the recording", exact: true }).click();
    await expect(page).toHaveURL(/\/trim-video$/);
    await expect(page.getByText(d.suggestedFilename().replace(/\.mp4$/, ""))).toBeVisible({
      timeout: 20_000,
    });
  });

  test("screen: Stop sharing in the browser's bar finishes the file; the bubble is drawn", async ({
    page,
  }) => {
    const out = dir();
    await page.goto("/screen-recorder");
    await ready(page);
    await page.getByLabel("Microphone").selectOption("off");
    await page.getByLabel("Camera bubble").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(
      page.locator("[data-live-line]").filter({ hasText: /Recording\s*\d+:\d\d/ }),
    ).toBeVisible();
    await page.waitForTimeout(2000);
    // What the browser does when its own "Stop sharing" is pressed: the screen track ends.
    await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>('video[aria-label="The shared screen"]');
      const t = (v?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      t?.dispatchEvent(new Event("ended"));
    });
    await expect(page.getByText("Screen recorded", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const path = await download(page, out);
    const p = probe(path);
    const v = p.streams.find((s) => s.codec_type === "video");
    // The shared tab's fake sound is still recorded with the microphone off.
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    // The bubble's white ring, bottom right: the pixel at its top edge is bright.
    const w = v?.width ?? 0;
    const h = v?.height ?? 0;
    const short = Math.min(w, h);
    const size = Math.round(short * 0.22);
    const inset = Math.round(short * 0.04);
    const ringX = w - inset - Math.round(size / 2);
    const ringY = h - inset - size + 1;
    const px = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      "1",
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      `crop=2:2:${ringX - 1}:${ringY},format=gray`,
      "-f",
      "rawvideo",
      "-",
    ]);
    expect(Math.max(...px)).toBeGreaterThan(200);
  });

  test("screen: a closed share dialog is not an error; Discard keeps nothing", async ({ page }) => {
    await page.goto("/screen-recorder");
    await ready(page);
    await page.evaluate(() => {
      const real = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      let first = true;
      navigator.mediaDevices.getDisplayMedia = (o) => {
        if (!first) return real(o);
        first = false;
        return Promise.reject(new DOMException("Permission denied by user", "NotAllowedError"));
      };
    });
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByText("Nothing was shared", { exact: false })).toBeVisible();
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(
      page.locator("[data-live-line]").filter({ hasText: /Recording\s*\d+:\d\d/ }),
    ).toBeVisible();
    await page.waitForTimeout(1500);
    // Discard asks first; Keep recording leaves it running.
    await page.getByRole("button", { name: "Discard" }).click();
    const confirm = page.getByRole("dialog", { name: /Discard this 0:0\d recording\?/ });
    await expect(confirm).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, "screen-recorder-confirm-discard");
    await confirm.getByRole("button", { name: "Keep recording" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.locator("[data-live-line]").filter({ hasText: "Recording" })).toBeVisible();
    await page.getByRole("button", { name: "Discard" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();
    // Focus returns to Start recording.
    await expect(page.getByRole("button", { name: "Start recording" })).toBeFocused();
    // The partial file is gone from the browser's storage within a second.
    await page.waitForTimeout(1000);
    const left = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const outputs = await root.getDirectoryHandle("outputs").catch(() => null);
      let n = 0;
      if (!outputs) return 0;
      for await (const [, h] of (
        outputs as unknown as {
          entries(): AsyncIterable<[string, FileSystemHandle]>;
        }
      ).entries())
        if (h.kind === "directory")
          for await (const _ of (h as unknown as { keys(): AsyncIterable<string> }).keys()) n++;
      return n;
    });
    expect(left).toBe(0);
  });

  test("webcam: preview, 3-2-1, MP4 with the camera's size", async ({ page }) => {
    const out = dir();
    await page.goto("/webcam-recorder");
    await ready(page);
    await page.getByRole("button", { name: "Turn on camera" }).click();
    await expect(page.getByText(/\d+×\d+ · \d+ fps · MP4/)).toBeVisible();
    const stated =
      (await page
        .getByRole("status")
        .filter({ hasText: /\d+×\d+ · \d+ fps/ })
        .textContent()) ?? "";
    const [, w, h] = /(\d+)×(\d+)/.exec(stated) ?? [];
    await shot(page, "webcam-recorder-ready");
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByText("Recording starts in 3")).toBeVisible();
    await expect(
      page.locator("[data-live-line]").filter({ hasText: /Recording\s*\d+:\d\d/ }),
    ).toBeVisible({
      timeout: 6000,
    });
    await page.waitForTimeout(2500);
    await shot(page, "webcam-recorder-recording");
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Video recorded", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, "webcam-recorder-done");
    const p = probe(await download(page, out));
    const v = p.streams.find((s) => s.codec_type === "video");
    expect(v?.codec_name).toBe("h264");
    expect(`${v?.width}×${v?.height}`).toBe(`${w}×${h}`);
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    expect(Number(p.format.duration)).toBeGreaterThan(2);
    expect(Number(p.format.duration)).toBeLessThan(3.6);
  });

  test("voice: M4A, WAV and Opus, read back", async ({ page }) => {
    const out = dir();
    for (const [label, codec, ext] of [
      ["M4A", "aac", "m4a"],
      ["WAV", "pcm_s16le", "wav"],
      ["Opus", "opus", "opus"],
    ] as const) {
      await page.goto("/voice-recorder");
      await ready(page);
      await page.getByText(label, { exact: true }).click();
      await page.getByRole("button", { name: "Start recording" }).click();
      await expect(
        page.locator("[data-live-line]").filter({ hasText: /Recording\s*\d+:\d\d/ }),
      ).toBeVisible();
      await page.waitForTimeout(2500);
      if (ext === "m4a") await shot(page, "voice-recorder-recording");
      await page.getByRole("button", { name: "Stop" }).click();
      await expect(page.getByText("Voice recorded", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      if (ext === "m4a") await shot(page, "voice-recorder-done");
      const path = await download(page, out);
      expect(path.endsWith(`.${ext}`)).toBe(true);
      const p = probe(path);
      expect(p.streams[0]?.codec_name).toBe(codec);
      expect(p.streams[0]?.sample_rate).toBe("48000");
      const length = Number(p.format.duration);
      expect(length).toBeGreaterThan(2.2);
      expect(length).toBeLessThan(3.6);
      if (ext === "m4a")
        await expect(page.getByRole("link", { name: "Convert it to MP3" })).toHaveAttribute(
          "href",
          "/m4a-to-mp3",
        );
    }
  });
});
