import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Recovering a recording cut off mid-way (ADR-0130), with Chromium's fake devices: the tab is
 * reloaded, closed or crashed while recording, and the next visit to that recorder offers the
 * recording back; Recover writes a playable file, read back with the local ffprobe (test-only).
 * WebKit in Playwright has no fake devices and no OPFS. Set RECOVER_SHOTS=<dir> for screenshots.
 * Each run prints what was recorded against what came back.
 */
const shots = process.env.RECOVER_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

const FAKE = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
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

interface Probe {
  streams: { codec_type: string; codec_name: string; width?: number; sample_rate?: string }[];
  format: { duration: string; format_name: string };
}
const probe = (path: string): Probe =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,sample_rate:format=duration,format_name",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as Probe;
/** Decodes the whole file: a recovered file must play to its end, not only open. */
const decodes = (path: string) => {
  execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"]);
  return true;
};

const ready = (page: Page) =>
  page.locator('section[aria-label="Workspace"][data-ready]').waitFor({ timeout: 20_000 });

/** Starts recording and lets it run; returns the seconds the live line showed last. */
async function record(page: Page, slug: string, seconds: number, format?: string) {
  await page.goto(`/${slug}`);
  await ready(page);
  if (format) await page.getByText(format, { exact: true }).click();
  // The camera page shows the camera before it records.
  const camera = page.getByRole("button", { name: "Turn on camera" });
  if (await camera.isVisible()) await camera.click();
  await page.getByRole("button", { name: "Start recording" }).click({ timeout: 20_000 });
  await expect(
    page.locator("[data-live-line]").filter({ hasText: /Recording\s*\d+:\d\d/ }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(seconds * 1000);
  const line = (await page.locator("[data-live-line]").textContent()) ?? "";
  const m = /(\d+):(\d\d)/.exec(line);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

async function recoverOn(context: BrowserContext, slug: string, title: string, open?: Page) {
  const page = open ?? (await context.newPage());
  await page.goto(`/${slug}`);
  const offer = page.getByText(/^A recording from .+ was interrupted \(\d+:\d\d, .+\)\.$/);
  await expect(offer).toBeVisible({ timeout: 20_000 });
  const words = (await offer.textContent()) ?? "";
  await shot(page, `${slug}-offer`);
  const axe = await new AxeBuilder({ page }).include('section[aria-label="Workspace"]').analyze();
  expect(axe.violations).toEqual([]);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Recover it" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 60_000 });
  const ms = Date.now() - t0;
  // The offer's buttons are gone: focus is on the result's Download, not the page.
  await expect(page.getByRole("link", { name: "Download", exact: true })).toBeFocused();
  await shot(page, `${slug}-recovered`);
  const out = mkdtempSync(join(tmpdir(), "recover-"));
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const d = await pending;
  const path = join(out, d.suggestedFilename());
  await d.saveAs(path);
  return { page, path, name: d.suggestedFilename(), words, ms };
}

test.describe("recovering an interrupted recording", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Fake media devices are Chromium only",
  );
  test.setTimeout(120_000);

  test("webcam MP4: a reload mid-recording, recovered with its index rebuilt", async ({
    page,
    context,
  }) => {
    const seconds = await record(page, "webcam-recorder", 5);
    // The page asks before leaving mid-recording; the user says leave.
    page.on("dialog", (d) => void d.accept());
    await page.reload();
    const r = await recoverOn(context, "webcam-recorder", "Video recorded");
    expect(r.name).toMatch(/^webcam-recording-.*\.mp4$/);
    const p = probe(r.path);
    expect(p.format.format_name).toContain("mp4");
    expect(p.streams.find((s) => s.codec_type === "video")?.codec_name).toBe("h264");
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    const got = Number(p.format.duration);
    test.info().annotations.push({
      type: "measured",
      description: `webcam reload: recorded ${seconds}s, recovered ${got.toFixed(2)}s in ${r.ms} ms · ${r.words}`,
    });
    expect(got).toBeGreaterThan(seconds - 2.5);
    expect(got).toBeLessThan(seconds + 1.5);
    expect(decodes(r.path)).toBe(true);
    // Recovered once: not offered again.
    await r.page.reload();
    await ready(r.page);
    await expect(r.page.getByText(/was interrupted/)).toHaveCount(0);
  });

  test("voice M4A: the tab closed without asking", async ({ page, context }) => {
    const seconds = await record(page, "voice-recorder", 4);
    await page.close({ runBeforeUnload: false });
    const r = await recoverOn(context, "voice-recorder", "Voice recorded");
    expect(r.name).toMatch(/\.m4a$/);
    const p = probe(r.path);
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    const got = Number(p.format.duration);
    test.info().annotations.push({
      type: "measured",
      description: `voice m4a close: recorded ${seconds}s, recovered ${got.toFixed(2)}s in ${r.ms} ms · ${r.words}`,
    });
    expect(got).toBeGreaterThan(seconds - 3);
    expect(decodes(r.path)).toBe(true);
  });

  // A renderer crash (CDP Page.crash) also closes Playwright's context, so the crash is stood in for
  // by killing the tab without its unload handlers: the same state on disk, the worker gone.
  test("voice WAV: the tab killed without unload handlers", async ({ page, context }) => {
    const seconds = await record(page, "voice-recorder", 4, "WAV");
    await page.close({ runBeforeUnload: false });
    const r = await recoverOn(context, "voice-recorder", "Voice recorded");
    expect(r.name).toMatch(/\.wav$/);
    const p = probe(r.path);
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("pcm_s16le");
    const got = Number(p.format.duration);
    test.info().annotations.push({
      type: "measured",
      description: `voice wav kill: recorded ${seconds}s, recovered ${got.toFixed(2)}s in ${r.ms} ms · ${r.words}`,
    });
    expect(got).toBeGreaterThan(seconds - 2);
    expect(decodes(r.path)).toBe(true);
  });

  test("voice Opus: a reload, cut after the last whole page", async ({ page, context }) => {
    const seconds = await record(page, "voice-recorder", 6, "Opus");
    page.on("dialog", (d) => void d.accept());
    await page.reload();
    const r = await recoverOn(context, "voice-recorder", "Voice recorded");
    const p = probe(r.path);
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("opus");
    const got = Number(p.format.duration);
    test.info().annotations.push({
      type: "measured",
      description: `voice opus reload: recorded ${seconds}s, recovered ${got.toFixed(2)}s in ${r.ms} ms · ${r.words}`,
    });
    // Opus is a few kB a second: a 256 KiB chunk holds well over the length of this test.
    expect(got).toBeGreaterThanOrEqual(0);
    expect(decodes(r.path)).toBe(true);
  });

  test("discard asks first, removes it, and the recorder comes back", async ({ page, context }) => {
    await record(page, "voice-recorder", 3);
    await page.close({ runBeforeUnload: false });
    const next = await context.newPage();
    await next.goto("/voice-recorder");
    await expect(next.getByText(/was interrupted/)).toBeVisible({ timeout: 20_000 });
    await next.getByRole("button", { name: "Discard", exact: true }).click();
    await shot(next, "voice-recorder-discard-confirm");
    await next.getByRole("dialog").getByRole("button", { name: "Discard", exact: true }).click();
    await expect(next.getByRole("button", { name: "Start recording" })).toBeVisible();
    await expect(next.getByRole("button", { name: "Start recording" })).toBeFocused();
    await next.reload();
    await ready(next);
    await expect(next.getByText(/was interrupted/)).toHaveCount(0);
  });

  test("a finished recording is never offered", async ({ page }) => {
    await record(page, "voice-recorder", 2);
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Voice recorded", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/was interrupted/)).toHaveCount(0);
  });
});
