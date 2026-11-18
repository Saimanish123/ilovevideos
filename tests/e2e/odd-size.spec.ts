import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Odd picture sizes, colour tags and re-encode bitrates on the picture tools (ADR-0060).
 * A 641×361 VP9 clip goes through every picture re-encode: H.264 outputs are 640×360 (the last column
 * and row cut, never scaled), VP9 keeps 641×361, and each output is compared with ffmpeg's own
 * equivalent (the same cut and filter on the source) by PSNR. An untagged SD clip must come out
 * tagged BT.601 (smpte170m) with its colours intact. Re-encodes stay near the source's bitrate, a
 * 60 fps reverse included. Encoding needs WebCodecs: Chromium only.
 */
const ODD = "tests/fixtures/sample-odd.webm";
const SD = "tests/fixtures/sample-sd-untagged.mp4";
const workspace = (page: Page) => page.getByRole("region", { name: "Workspace" });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const pick = (page: Page, name: string | RegExp) =>
  page
    .locator("label", { has: page.getByRole("radio", { name, exact: typeof name === "string" }) })
    .first()
    .click();

const drop = async (page: Page, slug: string, fixture: string) => {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').setInputFiles(fixture);
};

async function save(page: Page): Promise<string> {
  const download = workspace(page).getByRole("link", { name: "Download", exact: true });
  await expect(download).toBeVisible({ timeout: 240_000 });
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
  const path = join(mkdtempSync(join(tmpdir(), "odd-size-")), name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}

interface Stream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  nb_read_frames?: string;
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
}
const probe = (path: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,nb_read_frames,color_space,color_primaries,color_transfer:format=duration",
      "-of",
      "json",
      path,
    ]).toString(),
  ) as { streams: Stream[]; format: { duration: string } };
const video = (path: string) => probe(path).streams.find((s) => s.codec_type === "video");

/** Bytes of the video stream alone, as bits per second over the file's duration. */
function videoKbps(path: string): number {
  const bytes = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:v:0",
    "-c",
    "copy",
    "-f",
    "matroska",
    "-",
  ]).length;
  return (bytes * 8) / Number(probe(path).format.duration) / 1000;
}

/**
 * Average PSNR (dB) of the RGB `out` shows against the RGB of ffmpeg's `ref` chain on the source,
 * frame for frame. Each side is read by its own colour tags; the untagged source as `srcMatrix`
 * (an untagged SD picture is BT.601 by convention).
 */
function psnr(
  out: string,
  src: string,
  ref: string,
  { srcMatrix = "smpte170m", luma = false } = {},
): number {
  const read = `scale=in_color_matrix=auto:in_range=auto,format=${luma ? "gray" : "gbrp"}`;
  const err = execFileSync(
    "sh",
    [
      "-c",
      `ffmpeg -v info -i "$0" -i "$1" -lavfi "[0:v]${read}[o];[1:v]setparams=colorspace=${srcMatrix}:range=tv,${ref},${read}[r];[o][r]psnr" -f null - 2>&1`,
      out,
      src,
    ],
    { encoding: "utf8" },
  );
  const m = /average:([\d.]+|inf)/.exec(err);
  return m?.[1] === "inf" ? 99 : Number(m?.[1] ?? 0);
}

/** PSNR (dB) of the RGB the output shows against the source's, each read by its own colour tags. */
const rgbPsnr = (out: string, src: string, srcMatrix: string) =>
  psnr(out, src, "null", { srcMatrix });

/** The `-vf` chain of the ffmpeg command the result shows: ffmpeg's equivalent of the run. */
async function shownVf(page: Page): Promise<string> {
  const command = (await workspace(page).locator("details pre").first().textContent()) ?? "";
  const m = /-vf (?:"([^"]+)"|(\S+))/.exec(command);
  return (m?.[1] ?? m?.[2] ?? "null").replace(/,format=yuv420p$/, "");
}

const CUT = "crop=640:360:0:0";

test.describe("odd sizes, colour tags and bitrates", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("black and white: 641×361 becomes 640×360, said in the result", async ({ page }) => {
    test.setTimeout(180_000);
    await drop(page, "black-and-white-video", ODD);
    await button(page, "Make black and white").click();
    const out = await save(page);
    const v = video(out);
    expect([v?.codec_name, v?.width, v?.height]).toEqual(["h264", 640, 360]);
    expect(Number(v?.nb_read_frames)).toBe(90);
    await expect(workspace(page)).toContainText("641×361 → 640×360 (H.264 needs even edges)");
    // The same picture as the shown ffmpeg command's cut and colour filter. Drawn frames lose some
    // saturated red and blue to the decoder's BT.709 reading (corrected after the fact), so luma.
    const vf = await shownVf(page);
    expect(vf.startsWith(CUT)).toBe(true);
    expect(psnr(out, ODD, vf, { luma: true })).toBeGreaterThan(35);
  });

  test("frame rate: 30 → 24 at 640×360, near ffmpeg's crop and fps", async ({ page }) => {
    test.setTimeout(180_000);
    await drop(page, "change-video-frame-rate", ODD);
    await pick(page, /^24\sfps/);
    await button(page, "Change frame rate").click();
    const out = await save(page);
    const v = video(out);
    expect([v?.width, v?.height]).toEqual([640, 360]);
    expect(Number(v?.nb_read_frames)).toBe(72);
    const vf = await shownVf(page);
    expect(vf).toBe(`${CUT},fps=24`);
    expect(psnr(out, ODD, vf, { luma: true })).toBeGreaterThan(35);
  });

  test("reverse and boomerang encode at 640×360", async ({ page }) => {
    test.setTimeout(240_000);
    await drop(page, "reverse-video", ODD);
    await button(page, "Reverse").click();
    const out = await save(page);
    expect([video(out)?.width, video(out)?.height]).toEqual([640, 360]);
    // Frames go to the encoder as decoded (cut, never drawn), read as BT.601: full colour.
    const vf = await shownVf(page);
    expect(vf).toBe(`${CUT},reverse`);
    expect(psnr(out, ODD, vf)).toBeGreaterThan(35);

    await drop(page, "boomerang-video", ODD);
    await button(page, "Make boomerang").click();
    const boom = await save(page);
    expect([video(boom)?.width, video(boom)?.height]).toEqual([640, 360]);
  });

  test("flip keeps 641×361 in VP9; text is drawn at 640×360", async ({ page }) => {
    test.setTimeout(240_000);
    await drop(page, "flip-video", ODD);
    await button(page, "Flip").click();
    const flipped = await save(page);
    const f = video(flipped);
    expect([f?.codec_name, f?.width, f?.height]).toEqual(["vp9", 641, 361]);
    expect(await shownVf(page)).toBe("hflip");
    expect(psnr(flipped, ODD, "hflip", { luma: true })).toBeGreaterThan(35);

    await drop(page, "add-text-to-video", ODD);
    await page.locator("#overlay-text").fill("Odd");
    const add = button(page, "Add text");
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await add.click();
    const text = await save(page);
    expect([video(text)?.width, video(text)?.height]).toEqual([640, 360]);
  });

  test("rotate and flip: VP9 turns to exactly 361×641, H.264 to 360×640, unscaled", async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    // WebM keeps VP9, which takes odd sizes: the exact turned size, compared with ffmpeg's turn.
    await drop(page, "flip-video", ODD);
    await expect(button(page, "Flip")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Rotate right" }).click();
    await button(page, "Flip").click();
    const webm = await save(page);
    const w = video(webm);
    expect([w?.codec_name, w?.width, w?.height]).toEqual(["vp9", 361, 641]);
    expect(await shownVf(page)).toBe("transpose=1,hflip");
    expect(psnr(webm, ODD, "transpose=1,hflip", { luma: true })).toBeGreaterThan(35);

    // MKV is written as H.264: the odd edge is cut before the turn, then turned, never scaled.
    const mkv = info.outputPath("sample-odd.mkv");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", ODD, "-c", "copy", mkv]);
    await drop(page, "flip-video", mkv);
    await expect(button(page, "Flip")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Rotate right" }).click();
    await button(page, "Flip").click();
    const h264 = await save(page);
    const h = video(h264);
    expect([h?.codec_name, h?.width, h?.height]).toEqual(["h264", 360, 640]);
    expect(await shownVf(page)).toBe(`${CUT},transpose=1,hflip`);
    expect(psnr(h264, mkv, `${CUT},transpose=1,hflip`, { luma: true })).toBeGreaterThan(35);
  });

  test("codec: H.264 is offered for 641×361 and writes 640×360", async ({ page }) => {
    test.setTimeout(180_000);
    // The panel (src/components/tool/options/codec.tsx) still asks the encoder at 641×361; the
    // engine asks at plan.size. Remove once the panel uses plan.size.
    await drop(page, "change-video-codec", ODD);
    await expect(workspace(page)).not.toContainText("Checking", { timeout: 30_000 });
    await pick(page, /^H\.264/);
    const run = button(page, "Change codec");
    await expect(run).toBeEnabled();
    await run.click();
    const out = await save(page);
    expect([video(out)?.codec_name, video(out)?.width, video(out)?.height]).toEqual([
      "h264",
      640,
      360,
    ]);
    expect(psnr(out, ODD, CUT)).toBeGreaterThan(30);
  });

  test("border, keep the size: the result names the 640×360 frame", async ({ page }) => {
    test.setTimeout(180_000);
    await drop(page, "add-border-to-video", ODD);
    await pick(page, "Keep the size");
    await button(page, "Add border").click();
    const out = await save(page);
    expect([video(out)?.width, video(out)?.height]).toEqual([640, 360]);
    await expect(workspace(page)).toContainText("frame kept at 640×360: H.264 needs even edges");
    await expect(workspace(page)).not.toContainText("frame size kept");
  });

  test("re-encodes stay near the source's bitrate", async ({ page }) => {
    test.setTimeout(240_000);
    // VP9 at about 220 kb/s is about 330 kb/s of H.264; the density alone asked for 829 kb/s.
    const source = videoKbps(ODD);
    await drop(page, "black-and-white-video", ODD);
    await button(page, "Make black and white").click();
    const bw = videoKbps(await save(page));
    expect(bw).toBeLessThan(Math.max(200, (source / 0.65) * 1.3));

    // 60 fps: the reverse encoder is told the rate, so it keeps to the asked bitrate (the source's
    // 730 kb/s here) instead of spending twice that.
    const src60 = videoKbps("tests/fixtures/sample-60fps.mp4");
    await drop(page, "reverse-video", "tests/fixtures/sample-60fps.mp4");
    await button(page, "Reverse").click();
    const rev = videoKbps(await save(page));
    expect(rev).toBeLessThan(src60 * 1.35);
  });

  test("untagged SD comes out tagged BT.601 with its colours", async ({ page }) => {
    test.setTimeout(240_000);
    // Frame rate: frames go to the encoder as decoded (re-tagged, never drawn).
    await drop(page, "change-video-frame-rate", SD);
    await pick(page, /^24\sfps/);
    await button(page, "Change frame rate").click();
    const fps = await save(page);
    expect(video(fps)?.color_space).toBe("smpte170m");
    expect(video(fps)?.color_primaries).toBe("smpte170m");
    expect(rgbPsnr(fps, SD, "smpte170m")).toBeGreaterThan(40);

    // Border: frames are drawn on a canvas, read as BT.601 first.
    await drop(page, "add-border-to-video", SD);
    await pick(page, "Keep the size");
    await button(page, "Add border").click();
    const border = await save(page);
    expect(video(border)?.color_space).toBe("smpte170m");
  });
});
