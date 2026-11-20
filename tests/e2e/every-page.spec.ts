import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { tools } from "../../src/tools/registry";
import type { ToolDefinition } from "../../src/tools/registry/schema";
import AxeBuilder from "./axe-builder";

/**
 * Every page, end to end, generated from the registry (ADR-0148): a new page is covered without
 * touching this file. For each page: it renders with its H1 and no axe violations, takes the fixture
 * that fits what it accepts, runs with the page's defaults, and the download is checked with ffprobe
 * against the page's promise (container and codec, duration, the size cap of a size target, the
 * target format of a pair, the frame of a platform preset). A browser that cannot do a job must say
 * so before the user starts; that counts as the page working as designed and is recorded as
 * "says so". Pages that need a capture device are skipped below, with the reason.
 *
 * EVERY_PAGE_REPORT=<file> appends one JSON line per page and browser (the before/after table in
 * ADR-0148 is made from it). Slow: run with --workers=2 or 3.
 */

const FX = "tests/fixtures/";
const report = process.env.EVERY_PAGE_REPORT;

/** Pages this test does not run, and why. Each one is covered elsewhere where it can be. */
const skips: Record<string, string> = {
  "screen-recorder": "needs a screen to share; capture.spec.ts records Chromium's fake screen",
  "webcam-recorder": "needs a camera; capture.spec.ts records Chromium's fake camera",
  "voice-recorder": "needs a microphone; capture.spec.ts records Chromium's fake microphone",
};

/** The fixture for a pair page's source format (`presetOptions.from`). */
const byFormat: Record<string, string> = {
  mp4: "sample.mp4",
  mov: "sample.mov",
  mkv: "sample.mkv",
  webm: "sample.webm",
  avi: "sample.avi",
  wmv: "sample.wmv",
  flv: "sample.flv",
  mpeg: "sample.mpg",
  ts: "sample.m2t",
  mts: "sample.m2ts",
  "3gp": "sample.3gp",
  vob: "sample.vob",
  ogv: "sample.ogv",
  m4v: "sample-ac3.m4v",
  hevc: "sample-hevc.mp4",
  avc: "sample.mp4",
  wav: "sample.wav",
  m4a: "sample.m4a",
  flac: "sample.flac",
  mp3: "sample.mp3",
  ogg: "sample.ogg",
  aac: "sample.aac",
  wma: "sample.wma",
  opus: "sample.opus",
  aiff: "sample.aiff",
  srt: "subtitles/sample.srt",
  vtt: "subtitles/web.vtt",
  ass: "subtitles/styled.ass",
  sbv: "subtitles/youtube.sbv",
};

/** Pages whose job needs a particular source or several inputs. */
const bySlug: Record<string, string[]> = {
  "merge-videos": ["sample-clicks.mp4", "sample-clicks-b.mp4"],
  // An MP4 is already the converter's default target; an MKV becomes an MP4 with a copy.
  "video-converter": ["sample.mkv"],
  "add-audio-to-video": ["sample.mp4", "sample.mp3"],
  "replace-audio-in-video": ["sample.mp4", "sample.mp3"],
  "picture-in-picture-video": ["overlay/plate-a.mp4", "overlay/plate-b.mp4"],
  "side-by-side-video": ["overlay/plate-a.mp4", "overlay/plate-b.mp4"],
  "merge-audio": ["sample.mp3", "sample-b.mp3"],
  "images-to-video": ["slide-1.jpg", "slide-2.png", "slide-3.gif"],
  "gif-to-mp4": ["sample.gif"],
  "extract-subtitles-from-video": ["sample-subs.mkv"],
  "select-audio-tracks": ["sample-tracks.mkv"],
  "remove-silence-from-video": ["sample-pauses.mp4"],
  "remove-silence-from-audio": ["sample-pauses.wav"],
  "remove-background-noise": ["speech/speech-fan.wav"],
  "stabilize-video": ["sample-shaky.mp4"],
  "sharpen-video": ["sample-soft.mp4"],
  "denoise-video": ["sample-grainy.mp4"],
  "remove-black-bars-from-video": ["sample-letterbox.mp4"],
  "vertical-video-to-horizontal": ["sample-vertical.mp4"],
  "change-video-creation-date": ["sample-dated.mov"],
  "remove-metadata-from-video": ["sample-tagged.mp4"],
  "cut-video-into-shorts": ["sample-clips.mp4"],
  "remove-green-screen-from-video": ["overlay/greenscreen.mp4"],
  "sharpest-frame-from-video": ["sample-blur.mp4"],
  "key-bpm-finder": ["music-128-a-minor.mp3"],
  "repair-video": ["sample-cut.mp4"],
};

/** Pages whose answer is the panel itself (no button, no download), and what the answer shows. */
const answers: Record<string, RegExp> = {
  "video-info": /640\s*×\s*360/,
  "key-bpm-finder": /128\sBPM/,
};

/**
 * Pages whose one choice has no useful default (a turn, a frame, the text, the new date, how far to
 * move): the minimal setup a person makes before pressing the button.
 */
const choices: Record<string, (page: Page) => Promise<void>> = {
  "rotate-video": (page) => page.getByRole("button", { name: "Rotate right" }).click(),
  "crop-video": (page) => page.getByRole("radio", { name: /^1:1/ }).locator("xpath=..").click(),
  "add-text-to-video": (page) => page.getByRole("textbox", { name: "Text" }).fill("Hello"),
  "change-video-creation-date": (page) =>
    page.getByRole("textbox", { name: "Date and time" }).fill("2024-01-02T03:04:05"),
  "shift-subtitle-timing": (page) => page.getByRole("button", { name: "+1 s" }).click(),
  "trim-audio": async (page) => {
    const start = page.getByRole("spinbutton", { name: "Start" });
    await start.fill("1");
    await start.press("Tab");
  },
};

/** Second inputs a page asks for after its main file (a logo, a subtitle file), by `accept`. */
const secondInput = (accept: string): string | undefined =>
  /image/.test(accept)
    ? "logo.png"
    : /srt|vtt|subrip/.test(accept)
      ? "subtitles/sample.srt"
      : /video/.test(accept)
        ? "sample-intro.mp4"
        : /audio/.test(accept)
          ? "sample.mp3"
          : undefined;

function fixturesFor(t: ToolDefinition): string[] {
  const own = bySlug[t.slug];
  if (own) return own.map((f) => FX + f);
  if (t.family === "compress-size" || t.family === "compress-platform")
    return [`${FX}sample-large.mp4`];
  const from = t.presetOptions.from;
  if (typeof from === "string" && byFormat[from]) return [FX + byFormat[from]];
  const kind = t.accepts[0];
  return [
    FX +
      (kind === "audio"
        ? "sample.mp3"
        : kind === "subtitle"
          ? "subtitles/sample.srt"
          : kind === "gif"
            ? "sample.gif"
            : kind === "image"
              ? "slide-1.jpg"
              : "sample.mp4"),
  ];
}

/** Engines whose output keeps the source's length with the page's defaults. */
const keepsLength = new Set([
  "compress",
  "convert-video",
  "convert-audio",
  "aspect-ratio",
  "crop",
  "rotate",
  "filter",
  "framerate",
  "pad",
  "video-fade",
  "mute",
  "strip-metadata",
  "edit-metadata",
  "cover",
  "codec",
  "bitrate",
  "faststart",
  "watermark",
  "text-overlay",
  "time-overlay",
  "chroma-key",
  "clarity",
  "volume",
  "audio-fade",
  "image-overlay",
]);

interface Stream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
}
function ffprobe(path: string): { format: string; duration: number; streams: Stream[] } {
  const out = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height:format=format_name,duration",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as { streams: Stream[]; format: { format_name: string; duration?: string } };
  return {
    format: out.format.format_name,
    duration: Number(out.format.duration ?? 0),
    streams: out.streams,
  };
}

const containerOf: Record<string, RegExp> = {
  mp4: /mp4/,
  mov: /mov/,
  m4a: /mp4|m4a/,
  mkv: /matroska/,
  webm: /webm/,
  avi: /avi/,
  mp3: /mp3/,
  wav: /wav/,
  flac: /flac/,
  ogg: /ogg/,
  opus: /ogg/,
  aiff: /aiff/,
};
const audioCodecOf: Record<string, RegExp> = {
  mp3: /mp3/,
  wav: /pcm/,
  flac: /flac/,
  m4a: /aac|alac/,
  ogg: /vorbis|opus/,
};

async function download(page: Page): Promise<{ path: string; name: string; bytes: Buffer }> {
  const link = page.locator('[data-action="download"]').first();
  const href = await link.getAttribute("href");
  const name = (await link.getAttribute("download")) ?? "out.bin";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const bytes = Buffer.from(b64, "base64");
  const path = join(mkdtempSync(join(tmpdir(), "every-page-")), name);
  writeFileSync(path, bytes);
  return { path, name, bytes };
}

/** Checks the output against what the page promises; throws with the reason when it does not. */
function checkOutput(
  t: ToolDefinition,
  source: string,
  out: { path: string; name: string; bytes: Buffer },
) {
  expect(out.bytes.length, "the output is not empty").toBeGreaterThan(
    t.produces === "subtitle" || t.produces === "text" ? 0 : 100,
  );
  const ext = out.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "zip") {
    expect(out.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    return;
  }
  const to = t.presetOptions.to;
  if (t.produces === "subtitle" || t.produces === "text") {
    const text = out.bytes.toString("utf8");
    if (to === "vtt" || ext === "vtt")
      expect(text.startsWith("WEBVTT") || text.startsWith("﻿WEBVTT")).toBe(true);
    else if (to === "ass" || ext === "ass") expect(text).toContain("[Events]");
    else if (to === "txt" || ext === "txt") expect(text).not.toContain("-->");
    else if (ext === "srt") expect(text).toContain("-->");
    return;
  }
  if (t.produces === "image" || t.produces === "gif") {
    const magic = out.bytes.subarray(0, 12).toString("latin1");
    expect(magic, "an image file").toMatch(/PNG|GIF8|JFIF|Exif|WEBP|ftypavi[fs]|\xff\xd8/);
    return;
  }
  const p = ffprobe(out.path);
  const src = ffprobe(source);
  if (typeof to === "string") {
    expect(ext, `the file is ${to}`).toBe(to === "mpeg" ? "mpg" : to);
    const c = containerOf[to];
    if (c) expect(p.format).toMatch(c);
    const ac = audioCodecOf[to];
    if (ac) expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name ?? "").toMatch(ac);
  }
  const video = p.streams.find((s) => s.codec_type === "video");
  if (t.produces === "video") expect(video, "the output has a picture").toBeTruthy();
  if (t.produces === "audio")
    expect(
      p.streams.some((s) => s.codec_type === "audio"),
      "the output has sound",
    ).toBe(true);
  if (t.engine === "codec" && typeof t.presetOptions.codec === "string")
    expect(video?.codec_name).toBe(
      t.presetOptions.codec === "avc" ? "h264" : t.presetOptions.codec,
    );
  expect(p.duration, "the output has a length").toBeGreaterThan(0.2);
  if (keepsLength.has(t.engine) && src.duration > 0)
    expect(
      Math.abs(p.duration - src.duration),
      `${p.duration} s for a ${src.duration} s source`,
    ).toBeLessThan(0.35);
  // A size target's promise: the file fits.
  if (t.presetOptions.preset === "target" && typeof t.presetOptions.targetMb === "number")
    expect(out.bytes.length).toBeLessThanOrEqual(t.presetOptions.targetMb * 1e6);
  // A platform frame's promise: its shape, within its largest size.
  const ratio = t.presetOptions.ratio;
  if (typeof ratio === "string" && video?.width && video.height) {
    const [rw, rh] = ratio.split(":").map(Number) as [number, number];
    expect(Math.abs(video.width / video.height - rw / rh)).toBeLessThan(0.02);
    if (typeof t.presetOptions.maxWidth === "number")
      expect(video.width).toBeLessThanOrEqual(t.presetOptions.maxWidth);
    if (typeof t.presetOptions.maxHeight === "number")
      expect(video.height).toBeLessThanOrEqual(t.presetOptions.maxHeight);
  }
}

/** Fills the page's other file wells (a logo, a subtitle file) when the run waits for them. */
async function fillSecondInputs(page: Page, run: Locator) {
  if ((await run.count()) === 0 || (await run.isEnabled({ timeout: 1000 }).catch(() => true)))
    return;
  const wells = page
    .getByRole("region", { name: "Workspace" })
    .locator('input[type="file"]:not([data-replace])');
  for (let i = 0; i < (await wells.count()); i++) {
    const well = wells.nth(i);
    const file = secondInput((await well.getAttribute("accept")) ?? "");
    if (file) await well.setInputFiles(FX + file).catch(() => undefined);
    if (await run.isEnabled({ timeout: 1000 }).catch(() => false)) return;
  }
}

type Outcome = "made" | "settled" | "says so" | "result shown";

const record = (row: Record<string, unknown>) => {
  if (report) appendFileSync(report, `${JSON.stringify(row)}\n`);
};

for (const t of tools) {
  test(`${t.slug} works end to end`, async ({ page }, info) => {
    test.skip(t.slug in skips, skips[t.slug]);
    test.setTimeout(300_000);
    const started = Date.now();
    let outcome: Outcome | "failed" = "failed";
    let detail = "";
    try {
      await page.goto(`/${t.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.content.en.title);
      const axe = await new AxeBuilder({ page }).include("main").analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

      const files = fixturesFor(t);
      await page.locator('input[type="file"]').first().setInputFiles(files);
      const answer = answers[t.slug];
      if (answer) {
        await expect(
          page
            .getByRole("region", { name: "Workspace" })
            .getByText(answer)
            .filter({ visible: true })
            .first(),
        ).toBeVisible({ timeout: 120_000 });
        outcome = "result shown";
        return;
      }
      const bar = page.locator("[data-action-bar]");
      const status = bar.getByRole("status");
      const run = page.locator('[data-action="run"]');
      // Ready: a button, a settled answer, or the reason in its place (including this browser's).
      await expect(bar.or(page.locator('[data-action="download"]')).first()).toBeVisible({
        timeout: 120_000,
      });
      await fillSecondInputs(page, run);
      await choices[t.slug]?.(page);
      // The browser check settles shortly after ready (ADR-0147), and a page may load a part first
      // (the person finder): wait for the button or a reason that names the browser.
      await expect
        .poll(
          async () =>
            ((await run.count()) > 0 && (await run.isEnabled({ timeout: 1000 }))) ||
            /this browser/i.test((await status.textContent().catch(() => "")) ?? "") ||
            (await run.count()) === 0,
          { timeout: 60_000 },
        )
        .toBe(true)
        .catch(() => undefined);
      await page.waitForTimeout(800);
      const says = ((await status.textContent().catch(() => "")) ?? "").trim();
      if ((await run.count()) === 0 || !(await run.isEnabled({ timeout: 1000 }))) {
        if (/this browser/i.test(says)) {
          outcome = "says so";
          detail = says;
          return;
        }
        if (t.presetOptions.preset === "target" || t.family === "compress-platform") {
          // A file that already fits: the page says so and makes nothing (compress-families.spec).
          await expect(page.getByText(/fits|already/i).first()).toBeVisible();
          outcome = "settled";
          detail = says;
          return;
        }
        if (await page.locator('[data-action="download"]').count()) {
          // noAction pages put their answer in the panel (video info).
        } else if ((await run.count()) === 0) {
          outcome = "result shown";
          detail = says;
          return;
        }
        throw new Error(`The run cannot start with the defaults: "${says}"`);
      }
      await run.click();
      const done = page.locator('[data-action="download"]');
      const failed = page.getByRole("region", { name: "Workspace" }).locator('[role="alert"]');
      await expect(done.first().or(failed.first())).toBeVisible({ timeout: 280_000 });
      if (!(await done.count()))
        throw new Error(`Failed: ${(await failed.first().textContent()) ?? ""}`);
      const out = await download(page);
      checkOutput(t, files[0] ?? "", out);
      outcome = "made";
      detail = `${out.name} ${out.bytes.length} B`;
    } catch (e) {
      detail = (String(e instanceof Error ? e.message : e).split("\n")[0] ?? "").replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal colour codes in messages
        /\u001b\[\d+m/g,
        "",
      );
      throw e;
    } finally {
      record({
        project: info.project.name,
        slug: t.slug,
        engine: t.engine,
        outcome,
        detail,
        ms: Date.now() - started,
      });
    }
  });
}

test("every page in the registry is listed once", () => {
  const slugs = tools.map((t) => t.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const s of Object.keys(skips)) expect(slugs, `skip for ${s}`).toContain(s);
  for (const s of Object.keys(bySlug)) expect(slugs, `fixture for ${s}`).toContain(s);
  // Fixtures exist.
  for (const t of tools)
    for (const f of fixturesFor(t)) expect(readFileSync(f).length).toBeGreaterThan(0);
});
