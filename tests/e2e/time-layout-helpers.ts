import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Helpers for the time and layout specs (freeze frame, zoom, picture in picture, side by side,
 * clips): read the download back, probe it with the local ffprobe and ffmpeg, take review shots.
 * Set TIME_LAYOUT_SHOTS=<dir> for screenshots at the project's viewport plus 768.
 */
const shots = process.env.TIME_LAYOUT_SHOTS;

export async function shot(page: Page, name: string) {
  if (!shots) return;
  const size = page.viewportSize();
  const scroll = await page.evaluate(() => window.scrollY);
  for (const [w, h] of [
    [1280, 900],
    [768, 1024],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    // The workspace in view, as a person working in it sees it.
    await page
      .getByRole("region", { name: "Workspace" })
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);
    await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
  }
  if (size) await page.setViewportSize(size);
  await page.evaluate((y) => window.scrollTo(0, y), scroll);
}

export function trackUploads(page: Page) {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
}

export async function noAxeViolations(page: Page) {
  const a11y = await new AxeBuilder({ page }).include("main").analyze();
  expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

export async function saveLink(
  page: Page,
  name: string | RegExp = "Download",
  timeout = 240_000,
): Promise<{ path: string; name: string }> {
  const link = page.getByRole("link", { name }).first();
  await expect(link).toBeVisible({ timeout });
  const href = await link.getAttribute("href");
  const file = (await link.getAttribute("download")) ?? "out.bin";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const path = join(mkdtempSync(join(tmpdir(), "time-layout-")), file);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return { path, name: file };
}

export interface Probe {
  streams: {
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    duration?: string;
    nb_frames?: string;
  }[];
  duration: number;
}

export function probe(path: string): Probe {
  const out = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,duration,nb_frames:format=duration",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as { streams: Probe["streams"]; format: { duration: string } };
  return { streams: out.streams, duration: Number(out.format.duration) };
}

/** Gray pixels of one frame at `t`, scaled to `w`×`h`. */
export function grayFrame(path: string, t: number, w = 64, h = 36, vf = ""): Buffer {
  return execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(t),
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    `${vf ? `${vf},` : ""}scale=${w}:${h}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ]);
}

/** Mean absolute difference (0–255) between two gray frames. */
export function frameDiff(a: Buffer, b: Buffer): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / a.length;
}

/** RMS level (0–1) of the sound from `from` to `to` seconds, mono. */
export function rms(path: string, from: number, to: number): number {
  const raw = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(from),
    "-t",
    String(to - from),
    "-i",
    path,
    "-vn",
    "-ac",
    "1",
    "-f",
    "f32le",
    "-",
  ]);
  const n = Math.floor(raw.length / 4);
  let s = 0;
  for (let i = 0; i < n; i++) s += raw.readFloatLE(i * 4) ** 2;
  return Math.sqrt(s / Math.max(1, n));
}

/**
 * Average PSNR (dB, all planes) of `a` from `aFrom` against `b` from `bFrom`, over `seconds`, with
 * an optional filter on each side first (scale, crop). Read from ffmpeg's psnr filter.
 */
export function psnr(
  a: string,
  aFrom: number,
  b: string,
  bFrom: number,
  seconds: number,
  filters: { a?: string; b?: string } = {},
): number {
  const side = (from: number, f?: string) =>
    `trim=${from}:${from + seconds},setpts=PTS-STARTPTS${f ? `,${f}` : ""},format=yuv420p`;
  const r = spawnSync("ffmpeg", [
    "-v",
    "info",
    "-i",
    a,
    "-i",
    b,
    "-filter_complex",
    `[0:v]${side(aFrom, filters.a)}[x];[1:v]${side(bFrom, filters.b)}[y];[x][y]psnr`,
    "-f",
    "null",
    "-",
  ]);
  const m = /PSNR .*average:([0-9.]+|inf)/.exec(r.stderr.toString());
  return m?.[1] === "inf" ? Number.POSITIVE_INFINITY : Number(m?.[1] ?? Number.NaN);
}
