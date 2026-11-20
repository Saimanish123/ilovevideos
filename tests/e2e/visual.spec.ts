import { expect, test } from "@playwright/test";

/**
 * Visual regression baseline for the UI kit and the home page at 375, 768 and 1280 (README.md
 * Architecture §8). Chromium only, light theme only (ADR-0010). Baselines are per operating system
 * because font rasterisation differs; generate them with `pnpm exec playwright test visual
 * --project=chromium --update-snapshots` on the machine that will compare. CI skips this spec until
 * Linux baselines are committed (set VISUAL=1 to run it there).
 */

test.skip(!!process.env.CI && !process.env.VISUAL, "no Linux baseline committed yet");

const widths = [375, 768, 1280];

for (const width of widths) {
  for (const path of ["/dev/ui", "/"]) {
    test(`${path} at ${width}`, async ({ page }, info) => {
      test.skip(info.project.name !== "chromium", "one engine for the baseline");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Sections below the fold reveal once as they scroll into view (ADR-0157); a full-page capture
      // does not scroll, so walk down the page first and come back, as a reader would.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
          window.scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
        window.scrollTo(0, 0);
      });
      await expect(page).toHaveScreenshot(`${path === "/" ? "home" : "dev-ui"}-${width}.png`, {
        fullPage: true,
        animations: "disabled",
        maxDiffPixelRatio: 0.002,
      });
    });
  }
}
