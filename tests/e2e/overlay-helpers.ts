import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * Shared steps for the region and layer specs (blur, add image, green screen): saving the result,
 * probing it and reading pixels back with the local ffmpeg, and screenshots at 390, 768 and 1280
 * when OVERLAY_SHOTS=<dir> is set.
 */

export const shots = process.env.OVERLAY_SHOTS;

/** Screenshots of the current state at 390, 768 and 1280, then back to the project's viewport. */
export async function shootWidths(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const size = page.viewportSize();
  const scroll = await page.evaluate(() => window.scrollY);
  for (const [w, h] of [
    [390, 844],
    [768, 1024],
    [1280, 900],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    // The workspace's top just under the sticky header.
    await page.evaluate(() => {
      const el = document.querySelector("section[aria-label='Workspace']");
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72);
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(shots, `${name}-${w}.png`) });
  }
  if (size) await page.setViewportSize(size);
  await page.evaluate((y) => window.scrollTo(0, y), scroll);
}

export const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

export async function saveDownload(page: Page, timeout = 240_000) {
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout });
  const href = await download.getAttribute("href");
  const name = (await download.getAttribute("download")) ?? "out.mp4";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const path = join(mkdtempSync(join(tmpdir(), "overlay-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return { path, name };
}

export function probe(path: string) {
  const out = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,nb_read_frames:format=duration",
      "-count_frames",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as {
    streams: {
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      nb_read_frames?: string;
    }[];
    format: { duration: string };
  };
  return { streams: out.streams, duration: Number(out.format.duration) };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Grey (or RGB) pixels of a box of the frame at `t` seconds. */
export function pixels(path: string, t: number, box: Box, fmt: "gray" | "rgb24" = "gray") {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      `crop=${box.w}:${box.h}:${box.x}:${box.y}`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      fmt,
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
}

export const mean = (a: Uint8Array) => a.reduce((s, v) => s + v, 0) / a.length;

/** Standard deviation of the values (detail left in a box). */
export function spread(a: Uint8Array) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

/** Root-mean-square difference of two equally sized pixel buffers, in 8-bit levels. */
export function rms(a: Uint8Array, b: Uint8Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(s / a.length);
}

/** Where the preview shows picture pixel (x, y) of a `width`-wide source, in page coordinates. */
export async function pictureToPage(page: Page, width: number) {
  const v = page.locator("section[aria-label='Workspace'] video").first();
  await v.scrollIntoViewIfNeeded();
  const b = await v.boundingBox();
  if (!b) throw new Error("no preview");
  const k = b.width / width;
  return (x: number, y: number) => ({ x: b.x + x * k, y: b.y + y * k });
}

/** Seeks the preview, as scrubbing does, and waits for the frame. */
export async function seek(page: Page, t: number) {
  await page
    .locator("section[aria-label='Workspace'] video")
    .first()
    .evaluate(
      (v: HTMLVideoElement, time) =>
        new Promise<void>((resolve) => {
          v.addEventListener("seeked", () => resolve(), { once: true });
          v.currentTime = time;
        }),
      t,
    );
}

/**
 * Letter-scale difference of two grey boxes (`w` wide): the RMS of (a − b) after taking off its
 * local mean over a 17 px square, so what remains is detail at the size of strokes and letters,
 * not the coarse distribution of brightness.
 */
export function letterDetail(a: Uint8Array, b: Uint8Array, w: number, h: number, r = 8) {
  const d = new Float64Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = (a[i] ?? 0) - (b[i] ?? 0);
  // Summed-area table for the box means.
  const s = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      s[(y + 1) * (w + 1) + x + 1] =
        (d[y * w + x] ?? 0) +
        (s[y * (w + 1) + x + 1] ?? 0) +
        (s[(y + 1) * (w + 1) + x] ?? 0) -
        (s[y * (w + 1) + x] ?? 0);
  let sum = 0;
  let n = 0;
  for (let y = r; y < h - r; y++)
    for (let x = r; x < w - r; x++) {
      const x0 = x - r;
      const y0 = y - r;
      const x1 = x + r + 1;
      const y1 = y + r + 1;
      const box =
        ((s[y1 * (w + 1) + x1] ?? 0) -
          (s[y0 * (w + 1) + x1] ?? 0) -
          (s[y1 * (w + 1) + x0] ?? 0) +
          (s[y0 * (w + 1) + x0] ?? 0)) /
        ((2 * r + 1) * (2 * r + 1));
      sum += ((d[y * w + x] ?? 0) - box) ** 2;
      n++;
    }
  return Math.sqrt(sum / Math.max(1, n));
}
