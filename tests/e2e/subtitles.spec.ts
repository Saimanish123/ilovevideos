import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Subtitle utilities and add subtitles to a video, end to end. Text tools run in every project;
 * the video paths need WebCodecs encoding (burn-in) or ffmpeg.wasm (soft tracks), so they run on
 * Chromium only. Outputs are read back: text files as text, videos with ffprobe (stream codec,
 * language tag, default flag, duration). Set SUBTITLE_SHOTS=<dir> to save 390 and 1280 screenshots.
 */
const shots = process.env.SUBTITLE_SHOTS;
/** Design review 2: the settled states at 390 go to their own folder when set. */
const reviewShots = process.env.REVIEW_SHOTS;
/** A 390 px shot for design review, then back to the project's own viewport. */
const review = async (page: Page, name: string, focus?: import("@playwright/test").Locator) => {
  if (!reviewShots) return;
  const size = page.viewportSize();
  const scroll = await page.evaluate(() => window.scrollY);
  await page.setViewportSize({ width: 390, height: 844 });
  if (focus) await focus.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(reviewShots, `${name}-390.png`) });
  if (size) await page.setViewportSize(size);
  // Back where the test was, so the next pointer action does not land under the sticky header.
  await page.evaluate((y) => window.scrollTo(0, y), scroll);
};
const fx = (name: string) => `tests/fixtures/subtitles/${name}`;

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

/** Segmented radios are visually hidden inside their label: click the label, as a person would. */
const pick = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true }).locator("xpath=..").click();

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).include("main").analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
};

async function saveDownload(page: Page): Promise<{ path: string; name: string }> {
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 240_000 });
  const href = await download.getAttribute("href");
  const name = (await download.getAttribute("download")) ?? "out.bin";
  const b64 = await page.evaluate(async (u) => {
    const blob = await (await fetch(u ?? "")).blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  }, href);
  const path = join(mkdtempSync(join(tmpdir(), "subtitles-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return { path, name };
}

const downloadText = async (page: Page) => {
  const { path, name } = await saveDownload(page);
  return { text: execFileSync("cat", [path]).toString("utf8"), name };
};

interface Stream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  tags?: { language?: string };
  disposition?: { default?: number };
}
function probe(path: string): { streams: Stream[]; duration: number } {
  const out = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height:stream_tags=language:stream_disposition=default:format=duration",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as { streams: Stream[]; format: { duration: string } };
  return { streams: out.streams, duration: Number(out.format.duration) };
}

test.describe("subtitle utilities", () => {
  test("SRT to WebVTT: cue list, what is dropped, the file read back", async ({ page }) => {
    const uploads = trackUploads(page);
    await page.goto("/srt-to-vtt");
    const zone = page.getByRole("region", { name: "Workspace" });
    await expect(zone).toContainText("Drop an SRT file to convert it to WebVTT");
    await expect(zone).toContainText("SRT, WebVTT, ASS, SSA or SBV");
    await shot(page, "srt-to-vtt-idle");
    await page.locator('input[type="file"]').setInputFiles(fx("bom-crlf.srt"));
    const list = page.getByRole("list", { name: /Cues in bom-crlf\.srt/ });
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(list).toContainText("top of the picture");
    await expect(page.getByText("Font colour and face tags on 1 cue are removed.")).toBeVisible();
    await expect(page.getByText(/Line 20: "00:00:0x,000" is not a valid time/)).toBeVisible();
    await shot(page, "srt-to-vtt-ready");
    await axe(page);
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await expect(page.getByText("Converted to WebVTT: 5 cues")).toBeVisible();
    await expect(page.getByText(/read back: 5 cues in WebVTT/)).toBeVisible();
    await shot(page, "srt-to-vtt-done");
    const { text, name } = await downloadText(page);
    expect(name).toBe("bom-crlf.vtt");
    expect(
      text.startsWith("WEBVTT\n\n00:00:00.500 --> 00:00:02.000\n<i>Previously on the show</i>"),
    ).toBe(true);
    expect(text).toContain("00:00:04.500 --> 00:00:06.000 line:0\nSign at the top");
    expect(text).toContain("Positioned &amp; &lt;3 hearts");
    expect(uploads).toEqual([]);
  });

  test("a WebVTT file on SRT to WebVTT: settled, with a way to another format", async ({
    page,
  }) => {
    await page.goto("/srt-to-vtt");
    await page.locator('input[type="file"]').setInputFiles(fx("web.vtt"));
    await expect(page.getByRole("status")).toContainText("Already WebVTT. Nothing to convert.");
    await expect(page.getByRole("button", { name: "Convert", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Convert to another format" })).toBeVisible();
    await review(page, "srt-to-vtt-settled", page.getByRole("region", { name: "Workspace" }));
    await axe(page);
  });

  test("a clean file on fix overlaps: settled, no dead button", async ({ page }) => {
    await page.goto("/fix-subtitle-overlaps");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.srt"));
    await expect(page.getByRole("status")).toContainText("No timing problems found");
    await expect(page.getByRole("button", { name: "Fix", exact: true })).toHaveCount(0);
    await review(page, "fix-clean", page.getByRole("region", { name: "Workspace" }));
    await axe(page);
  });

  test("shift timing: before and after in the list, the file moved", async ({ page }) => {
    await page.goto("/shift-subtitle-timing");
    await page.locator('input[type="file"]').setInputFiles(fx("youtube.sbv"));
    const shift = page.getByRole("button", { name: "Shift", exact: true });
    await expect(shift).toBeDisabled();
    await pick(page, "Later");
    await page.getByLabel("Amount").fill("2.5");
    await expect(page.getByText("3 cues, first line now at 0:03.10")).toBeVisible();
    await expect(page.getByText(/was 0:00\.60 – 0:04\.16/)).toBeVisible();
    await page.getByRole("button", { name: "+100 ms" }).click();
    await expect(page.getByText(/move \+2\.6 s/)).toBeVisible();
    await shot(page, "shift-ready");
    await axe(page);
    await shift.click();
    await expect(page.getByText("Moved +2.6 s: 3 cues")).toBeVisible();
    const { text, name } = await downloadText(page);
    expect(name).toBe("youtube-shifted.sbv");
    expect(text.startsWith("0:00:03.199,0:00:06.760\n>> ALICE:")).toBe(true);
  });

  test("first line at a time", async ({ page }) => {
    await page.goto("/shift-subtitle-timing");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.srt"));
    await pick(page, "First line at");
    await page.getByLabel("First line starts at").fill("1:00");
    await page.getByRole("button", { name: "Shift", exact: true }).click();
    const { text } = await downloadText(page);
    expect(text).toContain("00:01:00,000 --> 00:01:01,200");
  });

  test("fix overlaps: problems with line numbers, then repaired", async ({ page }) => {
    await page.goto("/fix-subtitle-overlaps");
    await page.locator('input[type="file"]').setInputFiles(fx("broken-timing.srt"));
    await expect(page.getByText("Line 14: the end time is before the start time.")).toHaveCount(0);
    await expect(page.getByText(/6 problems found ·/)).toBeVisible();
    await shot(page, "fix-ready");
    await axe(page);
    await page.getByRole("button", { name: "Fix", exact: true }).click();
    await expect(page.getByText("Fixed 6 timing problems: 6 cues")).toBeVisible();
    const { text } = await downloadText(page);
    expect(text).toContain("1\n00:00:01,000 --> 00:00:03,000\nRuns into the next cue");
    expect(text).toContain("6\n00:00:13,000 --> 00:00:14,500\nSpeaker one\nSpeaker two");
  });

  test("frame rate: 23.976 to 25", async ({ page }) => {
    await page.goto("/change-subtitle-frame-rate");
    await page.locator('input[type="file"]').setInputFiles(fx("sample.srt"));
    await expect(page.getByText(/Every time is multiplied by 0\.9590/).first()).toBeVisible();
    await page.getByRole("button", { name: "Change frame rate", exact: true }).click();
    await expect(page.getByText("Re-timed from 23.976 to 25 fps: 2 cues")).toBeVisible();
    const { text } = await downloadText(page);
    // 1,400 ms × 24000/1001/25 = 1,342.66 → 1,343 ms
    expect(text).toContain("00:00:01,343");
  });

  test("a file with no timings is refused with a reason", async ({ page }) => {
    await page.goto("/subtitle-converter");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.srt",
      mimeType: "text/plain",
      buffer: Buffer.from("just some notes\nwith no times\n"),
    });
    await expect(page.getByRole("region", { name: "Workspace" }).getByRole("alert")).toContainText(
      "This file has no subtitle timings in it.",
    );
  });

  test("ASS to SRT lists what the script loses", async ({ page }) => {
    await page.goto("/ass-to-srt");
    await page.locator('input[type="file"]').setInputFiles(fx("styled.ass"));
    await expect(page.getByText(/3 styles \(fonts, sizes, colours, outlines\)/)).toBeVisible();
    await expect(page.getByText("1 vector drawing is removed.")).toBeVisible();
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const { text } = await downloadText(page);
    expect(text).toContain("{\\an8}<b>CITY HALL</b>");
    expect(text).not.toContain("{\\pos");
  });
});

test.describe("add subtitles to a video", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "needs WebCodecs and ffmpeg.wasm");

  const open = async (page: Page, video: string, subs: string) => {
    await page.goto("/add-subtitles-to-video");
    await expect(page.getByRole("region", { name: "Workspace" })).toContainText(
      "Drop a video to add subtitles to",
    );
    await page.locator('input[type="file"]').first().setInputFiles(video);
    const add = page.getByRole("button", { name: "Add subtitles", exact: true });
    await expect(add).toBeDisabled({ timeout: 30_000 });
    await expect(page.getByText("Add the subtitle file first.")).toBeVisible();
    await page.locator('input[type="file"][accept*=".srt"]').setInputFiles(subs);
    await expect(add).toBeEnabled();
    return add;
  };

  test("soft track in MP4: mov_text, language and default flag, picture copied", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    const add = await open(page, "tests/fixtures/sample.mp4", fx("sample.srt"));
    await page.getByLabel("Language").click();
    await page.getByRole("option", { name: "English" }).click();
    await expect(
      page.getByText(/English · MP4's own subtitle track · nothing re-encoded/),
    ).toBeVisible();
    // The cues are drawn over the preview as a native text track.
    await expect(page.locator("video track[kind=subtitles]")).toHaveCount(1);
    await shot(page, "add-subtitles-ready");
    await axe(page);
    await add.click();
    await expect(page.getByText("Subtitles added", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await shot(page, "add-subtitles-done");
    const { path } = await saveDownload(page);
    const p = probe(path);
    const sub = p.streams.find((s) => s.codec_type === "subtitle");
    expect(sub).toMatchObject({ codec_name: "mov_text", tags: { language: "eng" } });
    expect(sub?.disposition?.default).toBe(1);
    expect(p.streams.find((s) => s.codec_type === "video")?.codec_name).toBe("h264");
    expect(p.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    expect(p.duration).toBeCloseTo(3, 1);
    expect(uploads).toEqual([]);
  });

  test("burned in: H.264 with the sound copied", async ({ page }) => {
    test.setTimeout(240_000);
    const add = await open(page, "tests/fixtures/sample.mp4", fx("sample.srt"));
    await pick(page, "Burn in");
    await pick(page, "Large");
    await add.click();
    await expect(page.getByText("Subtitles burned in", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    const p = probe((await saveDownload(page)).path);
    expect(p.streams.map((s) => s.codec_type)).toEqual(["video", "audio"]);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
    expect(p.streams[1]?.codec_name).toBe("aac");
  });

  test("WebM gets a WebVTT track; cues past the end are left out", async ({ page }) => {
    test.setTimeout(240_000);
    const add = await open(page, "tests/fixtures/sample.webm", fx("web.vtt"));
    await expect(
      page.getByText(/start after the video ends at 0:03 and are left out/),
    ).toBeVisible();
    await add.click();
    const p = probe((await saveDownload(page)).path);
    expect(p.streams.find((s) => s.codec_type === "subtitle")).toMatchObject({
      codec_name: "webvtt",
      tags: { language: "eng" },
    });
    expect(p.duration).toBeLessThan(3.2);
  });

  test("MKV keeps an ASS script as ASS; burning it in keeps the styling through libass", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const add = await open(page, "tests/fixtures/sample.mkv", fx("styled.ass"));
    await add.click();
    let p = probe((await saveDownload(page)).path);
    expect(p.streams.find((s) => s.codec_type === "subtitle")?.codec_name).toBe("ass");
    await page.getByRole("button", { name: "Start over" }).click();
    const again = await open(page, "tests/fixtures/sample.mp4", fx("styled.ass"));
    await pick(page, "Burn in");
    await expect(page.getByRole("checkbox", { name: /Keep the ASS styling/ })).toBeChecked();
    await expect(page.getByText(/ASS styling kept/)).toBeVisible();
    await again.click();
    await expect(page.getByText("Subtitles burned in", { exact: true })).toBeVisible({
      timeout: 300_000,
    });
    p = probe((await saveDownload(page)).path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
  });

  test("AVI is copied into MKV with an SRT track", async ({ page }) => {
    test.setTimeout(240_000);
    const add = await open(page, "tests/fixtures/sample.avi", fx("sample.srt"));
    await add.click();
    const { path, name } = await saveDownload(page);
    expect(name).toBe("sample-subtitled.mkv");
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["mpeg4", "mp3", "subrip"]);
  });
});
