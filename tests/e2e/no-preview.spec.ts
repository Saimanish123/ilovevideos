import { join } from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * A source the browser's player cannot open (AVI everywhere, MKV in Safari) shows one quiet line
 * instead of a black frame and a dead playback bar, and the job still runs. Number fields draw no
 * native spin buttons in any browser, and arrow keys still step them. PHONE_SHOTS=<dir> saves the
 * no-preview state at 390 and 1280.
 */
const shots = process.env.PHONE_SHOTS;

/** WebKit cannot play MKV: the job still runs. */
test("mkv-to-mp4 in Safari: one line instead of a black frame, and the file is made", async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== "webkit", "Chromium plays MKV");
  test.setTimeout(120_000);
  await page.goto("/mkv-to-mp4");
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.mkv");
  const workspace = page.getByRole("region", { name: "Workspace" });
  await expect(
    workspace.getByText("No preview in this browser. The file can still be processed."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(workspace.locator("video")).toBeHidden();
  await expect(workspace.getByRole("button", { name: "Play" })).toHaveCount(0);
  const a11y = await new AxeBuilder({ page }).include("main").analyze();
  expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  if (shots)
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await workspace.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(shots, `no-preview-${info.project.name}-${width}.png`) });
    }
  await page.locator('[data-action="run"]').click();
  await expect(page.locator('[data-action="download"]').first()).toBeVisible({ timeout: 90_000 });
});

/** AVI plays in no browser; on a page that cannot take it either, the line says only that. */
test("compress-video with an AVI: the line does not promise a job that cannot run", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/compress-video");
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.avi");
  const workspace = page.getByRole("region", { name: "Workspace" });
  const line = workspace.getByText(/^No preview in this browser\./);
  await expect(line).toBeVisible({ timeout: 60_000 });
  // Once the file is read: either the job runs (and the line says so) or the page says why it
  // cannot (and the line does not promise it).
  await expect(workspace.getByText("Reading the file")).toHaveCount(0, { timeout: 90_000 });
  const run = page.locator('[data-action="run"]');
  const runs = (await run.count()) > 0 && (await run.isEnabled());
  await expect(line).toHaveText(
    runs
      ? "No preview in this browser. The file can still be processed."
      : "No preview in this browser.",
  );
});

/**
 * The line sits in the stage's own box: nothing changes height when the player gives up or when the
 * second sentence appears (design review 2026-11-19 measured 0.0347 before). Layout shift where the
 * browser reports it (Chromium), and the box's height sampled every frame everywhere.
 */
for (const [slug, fixture, width] of [
  ["compress-video", "sample.avi", 1280],
  ["mkv-to-mp4", "sample.mkv", 390],
] as const) {
  test(`${slug} at ${width}: the no-preview line moves nothing`, async ({ page, browserName }) => {
    test.skip(slug === "mkv-to-mp4" && browserName !== "webkit", "Chromium plays MKV");
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`/${slug}`);
    await page.evaluate(() => {
      const w = window as unknown as { __shift: number; __heights: number[] };
      w.__shift = 0;
      w.__heights = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[])
            if (!e.hadRecentInput) w.__shift += e.value;
        }).observe({ type: "layout-shift" });
      } catch {
        // WebKit reports no layout shifts; the heights below still count.
      }
      const tick = () => {
        const line = [...document.querySelectorAll("p")].find((p) =>
          /^No preview in this browser/.test(p.textContent ?? ""),
        );
        if (line?.parentElement)
          w.__heights.push(Math.round(line.parentElement.getBoundingClientRect().height));
        requestAnimationFrame(tick);
      };
      tick();
    });
    await page.locator('input[type="file"]').first().setInputFiles(`tests/fixtures/${fixture}`);
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace.getByText(/^No preview in this browser\./)).toBeVisible({
      timeout: 60_000,
    });
    await expect(workspace.getByText("Reading the file")).toHaveCount(0, { timeout: 90_000 });
    await page.waitForTimeout(1500);
    const { shift, heights } = await page.evaluate(() => {
      const w = window as unknown as { __shift: number; __heights: number[] };
      return { shift: w.__shift, heights: w.__heights };
    });
    expect(shift).toBe(0);
    expect(new Set(heights).size, `box heights seen: ${[...new Set(heights)].join(", ")}`).toBe(1);
  });
}

/** Chrome cannot decode HEVC: no codec choice can clear it, so the way out replaces the button. */
test("hevc-to-h264 in Chrome: the converter is the way out, and there is no black frame", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "WebKit decodes HEVC");
  test.setTimeout(60_000);
  await page.goto("/hevc-to-h264");
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample-hevc.mp4");
  const workspace = page.getByRole("region", { name: "Workspace" });
  await expect(workspace.getByRole("link", { name: "Convert to MP4" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-action="run"]')).toHaveCount(0);
  await expect(workspace.getByText(/^This browser cannot read the HEVC picture/)).toBeVisible();
  await expect(workspace.getByText("No preview in this browser.", { exact: true })).toBeVisible();
});

test("number fields draw no spin buttons; arrow keys still step them", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/crop-video");
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.mp4");
  const left = page.getByRole("spinbutton", { name: "Left" });
  await expect(left).toBeVisible({ timeout: 30_000 });
  // The field draws as a text field (no spin buttons); the type stays number for arrow keys.
  expect(await left.evaluate((el) => getComputedStyle(el).appearance)).toBe("textfield");
  await expect(left).toHaveAttribute("type", "number");
  await left.focus();
  await left.press("ArrowUp");
  // The crop steps by its even edge (2 px for H.264), not necessarily by 1.
  await expect(left).not.toHaveValue("0");
});
