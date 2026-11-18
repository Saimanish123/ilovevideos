import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 2 video edits end to end: frame rate, codec, fast start, loop and boomerang, reverse, border,
 * blurred background, black and white, looks, brightness and fades. Each run drops a fixture, checks
 * the ready state's real numbers, runs, saves the download and reads it back with ffprobe/ffmpeg
 * (codec, size, frame count, duration, pixels, and packet hashes where a stream must be copied).
 * Encoding needs WebCodecs, so those tests run in Chromium only; rendering, blocked states and axe run
 * everywhere. Set VIDEO_EDITS_SHOTS=<dir> to save ready-state screenshots at the current viewport.
 */
const shots = process.env.VIDEO_EDITS_SHOTS;
const workspace = (page: Page) => page.getByRole("region", { name: "Workspace" });

const shot = async (page: Page, name: string) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: true });
};

const trackUploads = (page: Page) => {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
};

/** Choose a card or segment: the radio is visually hidden, so click its label as a person would. */
const pick = (page: Page, name: string | RegExp) =>
  page
    .locator("label", { has: page.getByRole("radio", { name, exact: typeof name === "string" }) })
    .first()
    .click();

const drop = async (page: Page, slug: string, fixture: string) => {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').setInputFiles(`tests/fixtures/${fixture}`);
};

/** Waits for Download, saves the blob next to a temp dir and returns its path. */
async function save(page: Page): Promise<string> {
  const download = workspace(page).getByRole("link", { name: "Download", exact: true });
  await expect(download).toBeVisible({ timeout: 240_000 });
  await expect(download).toHaveAttribute("href", /^blob:/);
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
  const path = join(mkdtempSync(join(tmpdir(), "video-edits-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}

interface Stream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  nb_read_frames?: string;
  codec_tag_string?: string;
}
const probe = (path: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,codec_tag_string:format=duration,format_name",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as { streams: Stream[]; format: { duration: string; format_name: string } };
const video = (p: ReturnType<typeof probe>) => p.streams.find((s) => s.codec_type === "video");
const audio = (p: ReturnType<typeof probe>) => p.streams.find((s) => s.codec_type === "audio");

/** MD5 of every packet of one stream (a:0 or v:0), as ffmpeg's streamhash muxer writes it. */
const hash = (path: string, stream: string) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    `0:${stream}`,
    "-c",
    "copy",
    "-f",
    "streamhash",
    "-hash",
    "md5",
    "-",
  ])
    .toString()
    .trim()
    .replace(/^\d+,/, "");

/** RGB of an 8×8 thumbnail of the frame at `t` seconds (or the last frame with t < 0). */
function pixels(path: string, t: number, crop?: string): number[][] {
  const seek = t >= 0 ? ["-ss", String(t)] : ["-sseof", "-0.1"];
  const vf = `${crop ? `${crop},` : ""}scale=8:8:flags=area`;
  const raw = execFileSync("ffmpeg", [
    "-v",
    "error",
    ...seek,
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    vf,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ]);
  const out: number[][] = [];
  for (let i = 0; i + 2 < raw.length; i += 3)
    out.push([raw[i] ?? 0, raw[i + 1] ?? 0, raw[i + 2] ?? 0]);
  return out;
}
const luma = (px: number[][]) =>
  px.reduce((s, [r = 0, g = 0, b = 0]) => s + 0.2126 * r + 0.7152 * g + 0.0722 * b, 0) / px.length;

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test.describe("video edits: rendering and blocked states", () => {
  test("each page names its job before a file", async ({ page }) => {
    const pages: [string, string][] = [
      ["change-video-frame-rate", "Drop a video to lower its frame rate"],
      ["change-video-codec", "Drop a video to change its codec"],
      ["hevc-to-h264", "Drop a video to re-encode it as H.264"],
      ["optimize-video-for-web", "Drop an MP4 or MOV to make it start playing sooner"],
      ["loop-video", "Drop a video to repeat it"],
      ["boomerang-video", "Drop a short clip to make it a boomerang"],
      ["reverse-video", "Drop a video to play it backwards"],
      ["add-border-to-video", "Drop a video to add a border around it"],
      ["black-and-white-video", "Drop a video to make it black and white"],
      ["adjust-video-brightness", "Drop a video to brighten it or change its colours"],
      ["fade-video", "Drop a video to fade it in and out"],
    ];
    for (const [slug, prompt] of pages) {
      await page.goto(`/${slug}`);
      await expect(workspace(page), slug).toContainText(prompt);
    }
  });

  test("an index already at the front is settled, with nothing to press", async ({ page }) => {
    await drop(page, "optimize-video-for-web", "sample.mp4");
    await expect(page.getByTestId("faststart-state")).toHaveText("Already fast start", {
      timeout: 30_000,
    });
    await expect(workspace(page)).toContainText("There is nothing to move");
    await expect(button(page, "Optimise")).toHaveCount(0);
  });

  test("formats only ffmpeg reads get a way out on reverse", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    test.skip(browserName === "webkit", "ffmpeg inspection runs in Chromium in these tests");
    await drop(page, "reverse-video", "sample.avi");
    await expect(workspace(page)).toContainText(/Convert this .* file to MP4 first/, {
      timeout: 90_000,
    });
    await expect(workspace(page).getByRole("link", { name: "Convert to MP4" })).toBeVisible();
  });

  for (const slug of [
    "change-video-frame-rate",
    "black-and-white-video",
    "fade-video",
    "add-border-to-video",
    "optimize-video-for-web",
    "change-video-codec",
  ]) {
    test(`${slug}: ready state has no axe violations`, async ({ page }) => {
      test.setTimeout(90_000);
      await drop(
        page,
        slug,
        slug === "change-video-frame-rate"
          ? "sample-60fps.mp4"
          : slug === "optimize-video-for-web"
            ? "sample.mov"
            : "sample.mp4",
      );
      await expect(workspace(page).getByRole("button").first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(500);
      await shot(page, `${slug}-ready`);
      const results = await new AxeBuilder({ page }).include("main").analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});

test.describe("video edits: engines", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("frame rate: 60 → 30 keeps every 2nd frame, copies the sound", async ({ page }) => {
    test.setTimeout(180_000);
    const uploads = trackUploads(page);
    await drop(page, "change-video-frame-rate", "sample-60fps.mp4");
    await expect(page.getByTestId("fps-change")).toHaveText(/60\sfps → 30\sfps/, {
      timeout: 30_000,
    });
    await expect(workspace(page)).toContainText("Keeps every 2nd frame: motion stays even.");
    await expect(workspace(page)).toContainText("The sound is copied as it is.");
    await pick(page, /^24\sfps/);
    await expect(workspace(page)).toContainText("Drops 3 of every 5 frames");
    await pick(page, /^30\sfps/);
    await button(page, "Change frame rate").click();
    const out = await save(page);
    const p = probe(out);
    expect(video(p)?.codec_name).toBe("h264");
    expect(video(p)?.r_frame_rate).toBe("30/1");
    expect(Number(video(p)?.nb_read_frames)).toBeGreaterThanOrEqual(59);
    expect(Number(video(p)?.nb_read_frames)).toBeLessThanOrEqual(61);
    expect(Number(p.format.duration)).toBeCloseTo(2, 0);
    expect(hash(out, "a:0")).toBe(hash("tests/fixtures/sample-60fps.mp4", "a:0"));
    await expect(workspace(page)).toContainText(
      /60\sfps → 30\sfps · 640×360 · re-encoded · sound copied/,
    );
    expect(uploads).toEqual([]);
  });

  test("codec: VP9 in WebM with Opus sound, availability shown first", async ({ page }) => {
    test.setTimeout(240_000);
    await drop(page, "change-video-codec", "sample.mp4");
    await expect(page.getByTestId("codec-source")).toHaveText(/H\.264 in .*, 640×360, AAC sound/, {
      timeout: 30_000,
    });
    await expect(workspace(page)).not.toContainText("Checking", { timeout: 20_000 });
    await expect(workspace(page).getByText("Current codec", { exact: true })).toBeVisible();
    await pick(page, "VP9");
    await expect(workspace(page)).toContainText("Output VP9 in WebM");
    await expect(workspace(page)).toContainText("the sound is encoded to Opus.");
    await button(page, "Change codec").click();
    const out = await save(page);
    const p = probe(out);
    expect(p.format.format_name).toContain("webm");
    expect(video(p)?.codec_name).toBe("vp9");
    expect(audio(p)?.codec_name).toBe("opus");
    expect(Number(p.format.duration)).toBeCloseTo(3, 0);
  });

  test("hevc-to-h264: VP9 WebM becomes H.264 MP4; an H.264 file is settled", async ({ page }) => {
    test.setTimeout(240_000);
    await drop(page, "hevc-to-h264", "sample.mp4");
    await expect(workspace(page)).toContainText("This video is already H.264", { timeout: 30_000 });
    await expect(button(page, "Convert")).toHaveCount(0);
    await drop(page, "hevc-to-h264", "sample.webm");
    const convert = button(page, "Convert");
    await expect(convert).toBeEnabled({ timeout: 30_000 });
    await convert.click();
    const out = await save(page);
    const p = probe(out);
    expect(video(p)?.codec_name).toBe("h264");
    expect(audio(p)?.codec_name).toBe("aac");
    expect(out.endsWith(".mp4")).toBe(true);
  });

  test("fast start: index moved to the front, every packet identical", async ({ page }) => {
    test.setTimeout(120_000);
    await drop(page, "optimize-video-for-web", "sample.mov");
    await expect(page.getByTestId("faststart-state")).toHaveText("The index is at the end", {
      timeout: 30_000,
    });
    await expect(workspace(page)).toContainText(/Moves the .* index in front of .* of media/);
    await button(page, "Optimise").click();
    const out = await save(page);
    const boxes = execFileSync("python3", [
      "-c",
      "import sys,struct\nf=open(sys.argv[1],'rb');o=[]\nwhile True:\n h=f.read(8)\n if len(h)<8: break\n s,t=struct.unpack('>I4s',h);o.append(t.decode())\n if s==1: s=struct.unpack('>Q',f.read(8))[0];f.seek(s-16,1)\n else: f.seek(s-8,1)\nprint(' '.join(o))",
      out,
    ])
      .toString()
      .trim()
      .split(" ");
    expect(boxes.indexOf("moov")).toBeLessThan(boxes.indexOf("mdat"));
    expect(hash(out, "v:0")).toBe(hash("tests/fixtures/sample.mov", "v:0"));
    expect(hash(out, "a:0")).toBe(hash("tests/fixtures/sample.mov", "a:0"));
    await expect(workspace(page)).toContainText("Ready to stream: index at the front");
  });

  test("loop: three plays copied, nine seconds, no re-encode", async ({ page }) => {
    test.setTimeout(120_000);
    await drop(page, "loop-video", "sample.mp4");
    await expect(page.getByTestId("loop-length")).toHaveText(/0:03 → 0:09/, { timeout: 30_000 });
    await expect(workspace(page)).toContainText("nothing is re-encoded");
    await pick(page, "To a length");
    await expect(page.getByTestId("loop-length")).toHaveText(/0:03 → 0:15/);
    await pick(page, "A number of times");
    await button(page, "Loop").click();
    const out = await save(page);
    const p = probe(out);
    expect(video(p)?.codec_name).toBe("h264");
    expect(Number(video(p)?.nb_read_frames)).toBe(270);
    expect(Number(p.format.duration)).toBeCloseTo(9, 0);
    expect(audio(p)?.codec_name).toBe("aac");
  });

  test("boomerang: forwards then backwards, repeated, silent", async ({ page }) => {
    test.setTimeout(240_000);
    await drop(page, "boomerang-video", "sample.mp4");
    const make = button(page, "Make boomerang");
    await expect(make).toBeEnabled({ timeout: 30_000 });
    await make.click();
    const out = await save(page);
    const p = probe(out);
    expect(audio(p)).toBeUndefined();
    // Three bounces of 90 + 89 frames.
    expect(Number(video(p)?.nb_read_frames)).toBe(3 * 179);
    // The turning point: the frame just past the middle of a bounce matches the source's end.
    const end = pixels("tests/fixtures/sample.mp4", -1);
    const turn = pixels(out, 89 / 30);
    const diff =
      end.reduce((s, px, i) => s + Math.abs((px[0] ?? 0) - (turn[i]?.[0] ?? 0)), 0) / end.length;
    expect(diff).toBeLessThan(12);
  });

  test("reverse: last frame first, sound reversed and encoded", async ({ page }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await drop(page, "reverse-video", "sample.mp4");
    await expect(page.getByTestId("reverse-frames")).toHaveText("90 frames, last first", {
      timeout: 30_000,
    });
    await expect(workspace(page)).toContainText("The sound is reversed too and encoded to AAC.");
    await shot(page, "reverse-ready");
    await button(page, "Reverse").click();
    const out = await save(page);
    const p = probe(out);
    expect(video(p)?.codec_name).toBe("h264");
    expect(Number(video(p)?.nb_read_frames)).toBe(90);
    expect(audio(p)?.codec_name).toBe("aac");
    expect(Number(p.format.duration)).toBeCloseTo(3, 0);
    // The first frame out is the source's last, not its first.
    const first = pixels(out, 0);
    const srcLast = pixels("tests/fixtures/sample.mp4", -1);
    const srcFirst = pixels("tests/fixtures/sample.mp4", 0);
    const d = (a: number[][], b: number[][]) =>
      a.reduce((s, px, i) => s + Math.abs((px[1] ?? 0) - (b[i]?.[1] ?? 0)), 0) / a.length;
    expect(d(first, srcLast)).toBeLessThan(d(first, srcFirst));
    expect(uploads).toEqual([]);
  });

  test("border: 5% white around the picture, preview drawn, even size", async ({ page }) => {
    test.setTimeout(180_000);
    await drop(page, "add-border-to-video", "sample.mp4");
    await expect(page.getByTestId("border-size")).toHaveText(/640×360 → 676×396/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("border-frame")).toBeVisible();
    await pick(page, "Black");
    await button(page, "Add border").click();
    const out = await save(page);
    const p = probe(out);
    expect(video(p)?.width).toBe(676);
    expect(video(p)?.height).toBe(396);
    // The top-left corner is the border colour (black), the middle is the picture.
    expect(luma(pixels(out, 1, "crop=16:16:0:0"))).toBeLessThan(24);
    expect(luma(pixels(out, 1, "crop=200:200:238:98"))).toBeGreaterThan(40);
  });

  test("vertical to horizontal: 16:9 frame with blurred, not black, sides", async ({ page }) => {
    test.setTimeout(240_000);
    await drop(page, "vertical-video-to-horizontal", "sample-vertical.mp4");
    const make = button(page, "Make horizontal");
    await expect(make).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByTestId("blur-bars")).toBeVisible();
    await expect(workspace(page)).toContainText("blurred bars at the sides");
    await make.click();
    const out = await save(page);
    const p = probe(out);
    expect(video(p)?.width).toBe(2560);
    expect(video(p)?.height).toBe(1440);
    // The left side holds the blurred picture: not black.
    expect(luma(pixels(out, 0.5, "crop=200:1440:0:0"))).toBeGreaterThan(20);
  });

  test("black and white: preview filtered, compare toggles, grey pixels out", async ({ page }) => {
    test.setTimeout(180_000);
    await drop(page, "black-and-white-video", "sample.mp4");
    const run = button(page, "Make black and white");
    await expect(run).toBeEnabled({ timeout: 30_000 });
    const preview = workspace(page).locator("video");
    await expect(preview).toHaveCSS("filter", /url\(.*video-filter-preview/);
    await pick(page, "Before");
    await expect(preview).toHaveCSS("filter", "none");
    await page.keyboard.press("c");
    await pick(page, "After");
    await expect(preview).toHaveCSS("filter", /url\(/);
    await pick(page, /^High contrast/);
    await run.click();
    const out = await save(page);
    expect(hash(out, "a:0")).toBe(hash("tests/fixtures/sample.mp4", "a:0"));
    for (const [r = 0, g = 0, b = 0] of pixels(out, 1)) {
      expect(Math.abs(r - g)).toBeLessThanOrEqual(8);
      expect(Math.abs(g - b)).toBeLessThanOrEqual(8);
    }
    await expect(workspace(page)).toContainText("Black and white: high contrast");
  });

  test("brightness: the default lift makes the picture brighter", async ({ page }) => {
    test.setTimeout(180_000);
    await drop(page, "adjust-video-brightness", "sample.mp4");
    const run = button(page, "Apply");
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await run.click();
    const out = await save(page);
    // testsrc2 is mostly saturated colour, which a midtone lift barely moves; the average still rises
    // (+0.6 of 255 measured once the untagged SD source is read as BT.601, as ffmpeg reads it; the
    // +2 seen before came partly from reading it as BT.709).
    expect(luma(pixels(out, 1))).toBeGreaterThan(
      luma(pixels("tests/fixtures/sample.mp4", 1)) + 0.3,
    );
    // The same picture as the shown command's power curve on the source (34.3 dB measured).
    const command = (await workspace(page).locator("details pre").first().textContent()) ?? "";
    const vf = /-vf "([^"]+)"/.exec(command)?.[1]?.replace(/,format=yuv420p$/, "") ?? "null";
    const read = "scale=in_color_matrix=auto:in_range=auto,format=gbrp";
    const log = execFileSync(
      "sh",
      [
        "-c",
        `ffmpeg -v info -i "$0" -i "$1" -lavfi "[0:v]${read}[o];[1:v]setparams=colorspace=smpte170m:range=tv,${read},${vf},${read}[r];[o][r]psnr" -f null - 2>&1`,
        out,
        "tests/fixtures/sample.mp4",
      ],
      { encoding: "utf8" },
    );
    expect(Number(/average:([\d.]+)/.exec(log)?.[1] ?? 0)).toBeGreaterThan(30);
    await expect(workspace(page)).toContainText(
      "Adjusted: brightness +20, contrast 0, saturation 0",
    );
  });

  test("fade: black at the ends, full in the middle, sound faded", async ({ page }) => {
    test.setTimeout(180_000);
    await drop(page, "fade-video", "sample.mp4");
    const run = button(page, "Add fade");
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByTestId("fade-in-ramp")).toBeVisible();
    // Keyboard on the fade-in handle: Shift+→ is one second more, ← a tenth less.
    const handle = page.getByRole("slider", { name: "Fade in ends" });
    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.9");
    await page.keyboard.press("ArrowRight");
    await shot(page, "fade-ready");
    await run.click();
    const out = await save(page);
    const p = probe(out);
    expect(audio(p)?.codec_name).toBe("aac");
    expect(luma(pixels(out, 0))).toBeLessThan(20);
    expect(luma(pixels(out, 1.5))).toBeGreaterThan(luma(pixels(out, 0)) + 30);
    await expect(workspace(page)).toContainText(/Fades in over 1\ss, out over 1\ss/);
  });
});
