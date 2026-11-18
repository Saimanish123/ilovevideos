import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  estimateMotion,
  IDENTITY,
  type Motion,
  plausible,
  pyramid,
} from "../../src/tools/engines/stabilize/motion";
import { noAxeViolations, probe, psnr, saveLink, trackUploads } from "./time-layout-helpers";

/**
 * Picture quality, end to end (builder D, ADR-0081 to ADR-0085): stabilize, sharpen, denoise,
 * remove black bars and change bitrate, each on a fixture from scripts/make-quality-fixtures.mjs,
 * with the output read back by the local ffmpeg and measured. Encoding runs on Chromium (WebKit's
 * WebCodecs encoders are skipped here as in the other specs); every page renders and passes axe
 * on all three projects. Set TIME_LAYOUT_SHOTS=<dir> for screenshots at 1280, 768 and 390.
 */

/**
 * Review shots at 1280, 768 and 390 (TIME_LAYOUT_SHOTS=<dir>), Chromium desktop only so a later
 * project does not overwrite them, each after the layout and the preview canvases have settled at
 * the new size (a shot right after the resize caught the overlays mid-layout).
 */
async function shot(page: Page, name: string) {
  const dir = process.env.TIME_LAYOUT_SHOTS;
  if (!dir || test.info().project.name !== "chromium") return;
  const size = page.viewportSize();
  for (const [w, h] of [
    [1280, 900],
    [768, 1024],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    await page
      .getByRole("region", { name: "Workspace" })
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(dir, `${name}-${w}.png`), fullPage: false });
  }
  if (size) await page.setViewportSize(size);
}

/** An annotation on the test, printed too so a line reporter shows the measurement. */
function report(a: { type: string; description: string }) {
  test.info().annotations.push(a);
  // biome-ignore lint/suspicious/noConsole: the line reporter shows the measurements this way
  console.log(`[${a.type}] ${a.description}`);
}

const chromiumOnly = (browserName: string) =>
  test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");

async function open(page: Page, slug: string, h1: string, fixture: string, verb: string) {
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  const run = page.getByRole("button", { name: verb, exact: true });
  await expect(run).toBeEnabled({ timeout: 60_000 });
  return run;
}

/** Runs the primary button by keyboard (focus, Enter) and waits for the result. */
async function runByKeyboard(page: Page, run: ReturnType<Page["getByRole"]>, name: string) {
  await run.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await shot(page, `${name}-processing`);
}

/** The cumulative camera path of a video, measured on 320×180 grey frames with the engine's estimator. */
function measuredPath(path: string): Motion[] {
  const W = 320;
  const H = 180;
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `scale=${W}:${H}:flags=area`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 1 << 30 },
  );
  const n = Math.floor(raw.length / (W * H));
  const out: Motion[] = [];
  let prev: ReturnType<typeof pyramid> | null = null;
  let x = 0;
  let y = 0;
  let th = 0;
  for (let k = 0; k < n; k++) {
    const data = new Float32Array(W * H);
    for (let i = 0; i < data.length; i++) data[i] = raw[k * W * H + i] as number;
    const p = pyramid({ data, width: W, height: H });
    if (prev) {
      const e = estimateMotion(prev, p);
      const m = plausible(e, W, H) ? e.motion : IDENTITY;
      x += m.tx;
      y += m.ty;
      th += Math.atan2(m.b, m.a);
    }
    out.push({ a: Math.cos(th), b: Math.sin(th), tx: x, ty: y });
    prev = p;
  }
  return out;
}

/** RMS of the second difference (frame-to-frame jerk) of x and y, pixels at 320 wide, and of the turn (°). */
function jerk(path: Motion[]) {
  const d = (f: (m: Motion) => number) => {
    let s = 0;
    for (let k = 2; k < path.length; k++)
      s += (f(path[k] as Motion) - 2 * f(path[k - 1] as Motion) + f(path[k - 2] as Motion)) ** 2;
    return Math.sqrt(s / Math.max(1, path.length - 2));
  };
  return {
    x: d((m) => m.tx),
    y: d((m) => m.ty),
    turn: d((m) => (Math.atan2(m.b, m.a) * 180) / Math.PI),
  };
}

const ffmpeg = (args: string[]) =>
  spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "pipe" });

test.describe("stabilize video", () => {
  test("renders, has no axe violations, and states the plan", async ({ page }) => {
    await open(
      page,
      "stabilize-video",
      "Stabilize video",
      "tests/fixtures/sample-shaky.mp4",
      "Stabilize",
    );
    await expect(
      page.getByText(/Medium, zoomed up to 15% · H\.264 640×360 · sound copied/),
    ).toBeVisible();
    await shot(page, "stabilize-ready");
    await noAxeViolations(page);
    await page.getByRole("radio", { name: "Show borders" }).locator("xpath=..").click();
    await expect(page.getByText(/Medium, borders at moving edges/)).toBeVisible();
  });

  test("steadies a shaky clip far below its shake, sound copied", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    const run = await open(
      page,
      "stabilize-video",
      "Stabilize video",
      "tests/fixtures/sample-shaky.mp4",
      "Stabilize",
    );
    await runByKeyboard(page, run, "stabilize");
    await expect(page.getByText("Stabilized", { exact: true })).toBeVisible({ timeout: 240_000 });
    await shot(page, "stabilize-done");
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-shaky-stabilized.mp4");
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.streams[0]).toMatchObject({ width: 640, height: 360 });
    expect(p.duration).toBeCloseTo(4, 0);
    const before = jerk(measuredPath("tests/fixtures/sample-shaky.mp4"));
    const after = jerk(measuredPath(path));
    report({
      type: "jerk",
      description: `before x ${before.x.toFixed(2)} y ${before.y.toFixed(2)} turn ${before.turn.toFixed(3)}°; after x ${after.x.toFixed(2)} y ${after.y.toFixed(2)} turn ${after.turn.toFixed(3)}° (px at 320 wide)`,
    });
    expect(after.x).toBeLessThan(before.x * 0.15);
    expect(after.y).toBeLessThan(before.y * 0.15);
    expect(after.turn).toBeLessThan(before.turn * 0.15);
    expect(uploads).toEqual([]);
  });

  test("cancel returns to the ready state", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    const run = await open(
      page,
      "stabilize-video",
      "Stabilize video",
      "tests/fixtures/sample-shaky.mp4",
      "Stabilize",
    );
    await run.click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(run).toBeEnabled({ timeout: 5_000 });
  });
});

/** The grain-free picture of sample-grainy.mp4 and sample-soft.mp4, made again by the fixture script. */
let cleanPath: string | undefined;
function cleanReference(): string {
  if (cleanPath) return cleanPath;
  const out = join(mkdtempSync(join(tmpdir(), "quality-ref-")), "clean.mp4");
  execFileSync("node", ["scripts/make-quality-fixtures.mjs", "--clean", out]);
  cleanPath = out;
  return out;
}

/** PSNR (dB, all planes) of a file against the clean reference, frame by frame. */
const vsClean = (file: string, ref: string, seconds = 2) => psnr(file, 0, ref, 0, seconds);

/** FFmpeg's filter on a fixture, written losslessly, or at `kbps` with libx264 (the shown command). */
function ffmpegFiltered(fixture: string, vf: string, kbps?: number): string {
  const dir = mkdtempSync(join(tmpdir(), "quality-ffmpeg-"));
  const out = join(dir, "out.mp4");
  const codec = kbps ? ["-c:v", "libx264", "-b:v", `${kbps}k`] : ["-c:v", "libx264", "-qp", "0"];
  ffmpeg(["-i", fixture, "-vf", vf, ...codec, out]);
  return out;
}

/** One frame of a video as a PNG. */
function frameOf(file: string, n: number): string {
  const out = join(mkdtempSync(join(tmpdir(), "quality-frame-")), `f${n}.png`);
  ffmpeg(["-i", file, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", out]);
  return out;
}

/** PSNR (dB, all planes, read as 4:2:0) between two still pictures. */
function stillPsnr(a: string, b: string): number {
  const r = spawnSync("ffmpeg", [
    "-hide_banner",
    "-i",
    a,
    "-i",
    b,
    "-filter_complex",
    "[0:v]format=yuv420p[x];[1:v]format=yuv420p[y];[x][y]psnr",
    "-f",
    "null",
    "-",
  ]);
  return Number(/average:([0-9.]+)/.exec(r.stderr.toString())?.[1] ?? Number.NaN);
}

/**
 * The live preview's canvas as a PNG, with the frame number it shows: the renderer's own output,
 * not re-encoded. "steps" walks one frame at a time from the start to frame 30 (denoise then
 * carries each cleaned frame on, as the file does); "alone" draws frame 30 by itself.
 */
async function previewFrame(
  page: Page,
  mode: "alone" | "steps",
): Promise<{ png: string; frame: number }> {
  const canvas = page.getByTestId("clarity-preview");
  await expect(canvas).toHaveAttribute("data-drawn", "1");
  const t = await page.evaluate(async (steps) => {
    const v = document.querySelector("video") as HTMLVideoElement;
    const seek = (to: number) =>
      new Promise<void>((resolve) => {
        v.addEventListener("seeked", () => setTimeout(resolve, 50), { once: true });
        v.currentTime = to;
      });
    if (steps) {
      await seek(0.5 / 30 + 0.2);
      for (let n = 0; n <= 30; n++) await seek((n + 0.5) / 30);
    } else await seek(30.5 / 30);
    return v.currentTime;
  }, mode === "steps");
  const url = await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
  const png = join(mkdtempSync(join(tmpdir(), "quality-canvas-")), "canvas.png");
  writeFileSync(png, Buffer.from(url.split(",")[1] ?? "", "base64"));
  return { png, frame: Math.floor(t * 30) };
}

/**
 * The preview frame against the clean reference: the shown frame is the one at the video's time,
 * give or take one (the element's clock), so the best of the three neighbours is taken; the wrong
 * neighbours score some 10 dB lower, so the pick is unambiguous.
 */
function previewVsClean(shot: { png: string; frame: number }, ref: string) {
  let best = { frame: shot.frame, db: -1 };
  for (const n of [shot.frame - 1, shot.frame, shot.frame + 1]) {
    if (n < 0) continue;
    const db = stillPsnr(shot.png, frameOf(ref, n));
    if (db > best.db) best = { frame: n, db };
  }
  return best;
}

test.describe("denoise video", () => {
  test("measures the grain, renders the split, no axe violations", async ({ page }) => {
    await open(
      page,
      "denoise-video",
      "Denoise video",
      "tests/fixtures/sample-grainy.mp4",
      "Denoise",
    );
    await expect(
      page.getByText(/Medium noise reduction · grain \d+\.\d levels · H\.264 640×360/),
    ).toBeVisible();
    await expect(page.getByRole("slider", { name: "Before and after divider" })).toBeVisible();
    await shot(page, "denoise-ready");
    await noAxeViolations(page);
    // The divider moves by keyboard.
    const divider = page.getByRole("slider", { name: "Before and after divider" });
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", "45");
  });

  test("the renderer matches FFmpeg's nlmeans and beats hqdn3d on a frame", async ({
    page,
    browserName,
  }) => {
    chromiumOnly(browserName);
    test.setTimeout(240_000);
    await open(
      page,
      "denoise-video",
      "Denoise video",
      "tests/fixtures/sample-grainy.mp4",
      "Denoise",
    );
    const ref = cleanReference();
    const fixture = "tests/fixtures/sample-grainy.mp4";
    const nlm = ffmpegFiltered(fixture, "nlmeans=s=6:p=5:r=11");
    const hq = ffmpegFiltered(fixture, "hqdn3d=16:12:24:18");
    const alone = previewVsClean(await previewFrame(page, "alone"), ref);
    const played = previewVsClean(await previewFrame(page, "steps"), ref);
    const at = (file: string, n: number) => stillPsnr(frameOf(file, n), frameOf(ref, n));
    report({
      type: "psnr",
      description: `frame ${alone.frame} drawn alone ${alone.db} dB; frame ${played.frame} after stepping from the start ${played.db} dB; same frames: source ${at(fixture, alone.frame)} / ${at(fixture, played.frame)}, nlmeans s=6 p=5 r=11 ${at(nlm, alone.frame)} / ${at(nlm, played.frame)}, hqdn3d 16:12:24:18 ${at(hq, alone.frame)} / ${at(hq, played.frame)} dB`,
    });
    expect(alone.db).toBeGreaterThan(at(hq, alone.frame));
    expect(played.db).toBeGreaterThan(at(hq, played.frame) + 1);
    expect(played.db).toBeGreaterThan(at(nlm, played.frame) - 0.3);
  });

  test("writes the cleaned file: grain gone, sound copied", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    test.setTimeout(240_000);
    const run = await open(
      page,
      "denoise-video",
      "Denoise video",
      "tests/fixtures/sample-grainy.mp4",
      "Denoise",
    );
    // The grain figure measured on the page is the one the file is made with (not measured again).
    const grain = /grain (\d+\.\d) levels/.exec(
      (await page
        .getByText(/Medium noise reduction · grain/)
        .first()
        .textContent()) ?? "",
    )?.[1];
    expect(grain).toBeTruthy();
    await runByKeyboard(page, run, "denoise");
    await expect(page.getByText("Grain reduced", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await expect(page.getByText(`medium · grain ${grain} levels`)).toBeVisible();
    await shot(page, "denoise-done");
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-grainy-denoised.mp4");
    expect(probe(path).streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    const ref = cleanReference();
    const kbps = Math.round(
      Number(
        JSON.parse(
          execFileSync("ffprobe", [
            "-v",
            "error",
            "-select_streams",
            "v",
            "-show_entries",
            "stream=bit_rate",
            "-of",
            "json",
            path,
          ]).toString(),
        ).streams[0].bit_rate,
      ) / 1000,
    );
    const fixture = "tests/fixtures/sample-grainy.mp4";
    const source = vsClean(fixture, ref);
    const ours = vsClean(path, ref);
    const nlmeans = vsClean(ffmpegFiltered(fixture, "nlmeans=s=6:p=5:r=11", kbps), ref);
    const hqdn3d = vsClean(ffmpegFiltered(fixture, "hqdn3d=16:12:24:18", kbps), ref);
    report({
      type: "psnr",
      description: `whole file against clean, at ${kbps} kb/s: source ${source} dB, this page (browser H.264) ${ours} dB; FFmpeg then libx264 at the same rate: nlmeans ${nlmeans} dB, hqdn3d ${hqdn3d} dB`,
    });
    expect(ours).toBeGreaterThan(source + 2);
  });
});

test.describe("sharpen video", () => {
  test("renders with its split and fine-tune field, no axe violations", async ({ page }) => {
    await open(page, "sharpen-video", "Sharpen video", "tests/fixtures/sample-soft.mp4", "Sharpen");
    await expect(page.getByText(/Medium sharpening · H\.264 640×360 · sound copied/)).toBeVisible();
    await shot(page, "sharpen-ready");
    await noAxeViolations(page);
    // The percentage types freely and commits on Enter.
    const field = page.getByLabel("Strength, percent of Medium");
    await field.fill("150");
    await field.press("Enter");
    await expect(page.getByText(/150% sharpening/)).toBeVisible();
  });

  test("the renderer brings a softened frame back like FFmpeg's unsharp", async ({
    page,
    browserName,
  }) => {
    chromiumOnly(browserName);
    test.setTimeout(240_000);
    await open(page, "sharpen-video", "Sharpen video", "tests/fixtures/sample-soft.mp4", "Sharpen");
    const ref = cleanReference();
    const fixture = "tests/fixtures/sample-soft.mp4";
    const shown = previewVsClean(await previewFrame(page, "alone"), ref);
    const at = (file: string) => stillPsnr(frameOf(file, shown.frame), frameOf(ref, shown.frame));
    const unsharp = ffmpegFiltered(
      fixture,
      "unsharp=luma_msize_x=7:luma_msize_y=7:luma_amount=1.5:chroma_amount=0",
    );
    const unsharp5 = ffmpegFiltered(fixture, "unsharp=5:5:1.5:5:5:0");
    report({
      type: "psnr",
      description: `frame ${shown.frame} against the unblurred picture: soft ${at(fixture)} dB, this page (Medium) ${shown.db} dB, FFmpeg unsharp 7×7 1.5 ${at(unsharp)} dB, unsharp 5×5 1.5 ${at(unsharp5)} dB`,
    });
    expect(shown.db).toBeGreaterThan(at(fixture) + 2);
    expect(shown.db).toBeGreaterThan(Math.min(at(unsharp), at(unsharp5)) - 0.5);
  });

  test("writes the sharpened file with the sound copied", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    test.setTimeout(240_000);
    const run = await open(
      page,
      "sharpen-video",
      "Sharpen video",
      "tests/fixtures/sample-soft.mp4",
      "Sharpen",
    );
    await runByKeyboard(page, run, "sharpen");
    await expect(page.getByText("Sharpened", { exact: true })).toBeVisible({ timeout: 240_000 });
    await shot(page, "sharpen-done");
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-soft-sharpened.mp4");
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.duration).toBeCloseTo(2, 0);
    const ref = cleanReference();
    report({
      type: "psnr",
      description: `whole file against the unblurred picture: soft source ${vsClean("tests/fixtures/sample-soft.mp4", ref)} dB, this page (browser H.264) ${vsClean(path, ref)} dB`,
    });
  });
});

test.describe("remove black bars", () => {
  test("finds the letterbox through a dark scene and names the subtitles in the bar", async ({
    page,
  }) => {
    await open(
      page,
      "remove-black-bars-from-video",
      "Remove black bars from video",
      "tests/fixtures/sample-letterbox.mp4",
      "Remove bars",
    );
    await expect(page.getByText("Found letterbox bars")).toBeVisible();
    await expect(page.getByTestId("bars-found")).toHaveText(/46\spx top and bottom/);
    await expect(page.getByText(/640×360 → 640×268/)).toBeVisible();
    const keep = page.getByRole("checkbox", { name: "Keep what shows in the bottom bar" });
    await expect(keep).toBeVisible();
    await shot(page, "bars-ready");
    await noAxeViolations(page);
    await keep.check();
    await expect(page.getByText(/640×360 → 640×\d+/)).not.toHaveText(/640×268/);
  });

  test("crops the bars off", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    test.setTimeout(120_000);
    const run = await open(
      page,
      "remove-black-bars-from-video",
      "Remove black bars from video",
      "tests/fixtures/sample-letterbox.mp4",
      "Remove bars",
    );
    await runByKeyboard(page, run, "bars");
    await expect(page.getByText("Black bars removed", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await shot(page, "bars-done");
    const { path } = await saveLink(page);
    const p = probe(path);
    expect(p.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    expect(p.streams[0]).toMatchObject({ width: 640, height: 268 });
    // The kept picture is the source's middle, pixel for pixel (after one encode).
    const kept = psnr(path, 0, "tests/fixtures/sample-letterbox.mp4", 0, 0.9, {
      b: "crop=640:268:0:46",
    });
    report({ type: "psnr", description: `kept picture against the source's middle ${kept} dB` });
    expect(kept).toBeGreaterThan(35);
  });

  test("a video without bars is already done", async ({ page }) => {
    await page.goto("/remove-black-bars-from-video");
    await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.mp4");
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: /No black bars in \d+ frames: the picture already fills the frame\./ }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Remove bars", exact: true })).toHaveCount(0);
  });
});

test.describe("change video bitrate", () => {
  test("renders with the source's bitrate and a live estimate, no axe violations", async ({
    page,
  }) => {
    await open(
      page,
      "change-video-bitrate",
      "Change video bitrate",
      "tests/fixtures/sample.mp4",
      "Change bitrate",
    );
    await expect(page.getByText(/The source's picture uses [\d,]+ kb\/s\./)).toBeVisible();
    await shot(page, "bitrate-ready");
    await noAxeViolations(page);
    const field = page.getByLabel("Video bitrate in kilobits per second");
    await field.fill("300");
    await field.press("Enter");
    await expect(
      page.getByText(/300 kb\/s variable · H\.264 640×360 · sound copied · about/),
    ).toBeVisible();
  });

  test("writes the bitrate asked for and copies the sound", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    test.setTimeout(120_000);
    const run = await open(
      page,
      "change-video-bitrate",
      "Change video bitrate",
      "tests/fixtures/sample.mp4",
      "Change bitrate",
    );
    const field = page.getByLabel("Video bitrate in kilobits per second");
    await field.fill("300");
    await field.press("Enter");
    await runByKeyboard(page, run, "bitrate");
    await expect(page.getByText("Bitrate changed", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await shot(page, "bitrate-done");
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-300k.mp4");
    const out = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,bit_rate",
        "-of",
        "json",
        path,
      ]).toString(),
    ) as { streams: { codec_name: string; bit_rate: string }[] };
    expect(out.streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    const kbps = Number(out.streams[0]?.bit_rate) / 1000;
    report({
      type: "bitrate",
      description: `asked 300 kb/s, written ${kbps.toFixed(0)} kb/s`,
    });
    expect(kbps).toBeGreaterThan(300 * 0.6);
    expect(kbps).toBeLessThan(300 * 1.3);
  });

  test("leaving the sound out writes the picture alone", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    test.setTimeout(120_000);
    const run = await open(
      page,
      "change-video-bitrate",
      "Change video bitrate",
      "tests/fixtures/sample.mp4",
      "Change bitrate",
    );
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "None" }).click();
    await expect(page.getByText(/· sound removed ·/)).toBeVisible();
    await run.click();
    await expect(page.getByText("Bitrate changed", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    const { path } = await saveLink(page);
    expect(probe(path).streams.map((s) => s.codec_type)).toEqual(["video"]);
  });
});

test.describe("picture quality edge cases", () => {
  for (const [slug, h1, verb] of [
    ["sharpen-video", "Sharpen video", "Sharpen"],
    ["denoise-video", "Denoise video", "Denoise"],
    ["change-video-bitrate", "Change video bitrate", "Change bitrate"],
  ] as const)
    test(`${h1}: cancel mid-run returns to the ready state`, async ({ page, browserName }) => {
      chromiumOnly(browserName);
      const run = await open(page, slug, h1, "tests/fixtures/sample-large.mp4", verb);
      await run.click();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(run).toBeEnabled({ timeout: 5_000 });
    });

  test("stabilize keeps a phone's rotation: 640×360 turned 90° comes out 360×640", async ({
    page,
    browserName,
  }) => {
    chromiumOnly(browserName);
    test.setTimeout(120_000);
    const run = await open(
      page,
      "stabilize-video",
      "Stabilize video",
      "tests/fixtures/sample-rotated.mp4",
      "Stabilize",
    );
    await run.click();
    await expect(page.getByText("Stabilized", { exact: true })).toBeVisible({ timeout: 120_000 });
    const { path } = await saveLink(page);
    const out = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v",
        "-show_entries",
        "stream=width,height:stream_side_data=rotation",
        "-of",
        "json",
        path,
      ]).toString(),
    ) as { streams: { width: number; height: number; side_data_list?: { rotation?: number }[] }[] };
    const s = out.streams[0];
    const turned = Math.abs(s?.side_data_list?.[0]?.rotation ?? 0) % 180 === 90;
    // Shown upright either way: as 360×640 pixels, or as 640×360 with a 90° flag.
    expect(turned ? [s?.height, s?.width] : [s?.width, s?.height]).toEqual([360, 640]);
  });

  test("denoise writes an odd-sized VP9 WebM as even H.264 MP4", async ({ page, browserName }) => {
    chromiumOnly(browserName);
    test.setTimeout(120_000);
    const run = await open(
      page,
      "denoise-video",
      "Denoise video",
      "tests/fixtures/sample-odd.webm",
      "Denoise",
    );
    await expect(page.getByText(/H\.264 640×360/)).toBeVisible();
    await run.click();
    await expect(page.getByText("Grain reduced", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    const { path, name } = await saveLink(page);
    expect(name).toBe("sample-odd-denoised.mp4");
    const p = probe(path);
    expect(p.streams[0]).toMatchObject({ codec_name: "h264", width: 640, height: 360 });
  });

  test("change bitrate keeps an MKV in MKV and a VP9 WebM in VP9 where it can", async ({
    page,
    browserName,
  }) => {
    chromiumOnly(browserName);
    test.setTimeout(120_000);
    let run = await open(
      page,
      "change-video-bitrate",
      "Change video bitrate",
      "tests/fixtures/sample.mkv",
      "Change bitrate",
    );
    await run.click();
    let link = await saveLink(page);
    expect(link.name).toMatch(/\.mkv$/);
    expect(probe(link.path).streams.map((s) => s.codec_name)).toEqual(["h264", "aac"]);
    run = await open(
      page,
      "change-video-bitrate",
      "Change video bitrate",
      "tests/fixtures/sample.webm",
      "Change bitrate",
    );
    await expect(page.getByText(/· (VP9|H\.264) 640×360 ·/)).toBeVisible();
    const vp9 = await page.getByText(/· VP9 640×360 ·/).count();
    await run.click();
    link = await saveLink(page);
    const codecs = probe(link.path).streams.map((s) => s.codec_name);
    expect(codecs).toEqual(vp9 ? ["vp9", "opus"] : ["h264", "aac"]);
    report({ type: "codec", description: `VP9 WebM source written as ${codecs.join(" + ")}` });
  });

  test("files only ffmpeg reads are sent to the converter first", async ({ page }) => {
    await page.goto("/sharpen-video");
    await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.avi");
    await expect(page.getByRole("link", { name: "Convert it to MP4 first" })).toBeVisible({
      timeout: 30_000,
    });
  });
});
