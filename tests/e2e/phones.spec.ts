import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * The most used pages on small and tall phones, with touch (ADR-0148): 360×640 (the smallest common
 * Android screen) and 412×915 (a current tall Android screen), in Chrome's and Safari's engines. A
 * tap on the drop zone opens the file picker; once a file is in there is no sideways scroll, every
 * control is a 44px target, the primary action can be reached and tapped, and axe finds nothing.
 * PHONE_SHOTS=<dir> saves idle and ready screenshots per page and size.
 */
const shots = process.env.PHONE_SHOTS;

const pages: [slug: string, fixture: string][] = [
  ["compress-video", "sample.mp4"],
  ["video-converter", "sample.mkv"],
  ["trim-video", "sample.mp4"],
  ["merge-videos", "sample.mp4"],
  ["video-to-gif", "sample.mp4"],
  ["audio-converter", "sample.mp3"],
  ["resize-video-for-tiktok", "sample.mp4"],
  ["crop-video", "sample.mp4"],
  ["mp4-to-mp3", "sample.mp4"],
  ["extract-audio-from-video", "sample.mp4"],
  ["mov-to-mp4", "sample.mov"],
  ["remove-audio-from-video", "sample.mp4"],
  ["rotate-video", "sample.mp4"],
  ["change-video-speed", "sample.mp4"],
  ["add-subtitles-to-video", "sample.mp4"],
];

const sizes = [
  { width: 360, height: 640 },
  { width: 412, height: 915 },
];

async function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Controls in the workspace smaller than 44px both ways (a checkbox counts its label). */
async function smallTargets(page: Page) {
  return page
    .getByRole("region", { name: "Workspace" })
    .locator(
      "button, a[href], [role=slider], [role=tab], input[type=radio], input[type=checkbox], input[type=number], input[type=text], select, summary",
    )
    .evaluateAll((els) =>
      els
        .map((el) => {
          const target =
            (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) ||
            el.getAttribute("role") === "radio"
              ? (el.closest("label") ?? el)
              : el;
          const r = target.getBoundingClientRect();
          const hidden = getComputedStyle(el).visibility === "hidden";
          return { html: el.outerHTML.slice(0, 100), w: r.width, h: r.height, hidden };
        })
        .filter((r) => !r.hidden && r.w > 0 && r.h > 0 && r.h < 44 && r.w < 44),
    );
}

test.describe("phones", () => {
  test.skip(
    ({ isMobile }) => !isMobile,
    "phone profiles only (mobile-chrome and mobile-safari): touch and the mobile viewport",
  );

  for (const size of sizes) {
    test.describe(`${size.width}×${size.height}`, () => {
      test.use({ viewport: size, hasTouch: true });

      for (const [slug, fixture] of pages) {
        test(`${slug} fits, taps and reaches its action`, async ({ page }, info) => {
          test.setTimeout(90_000);
          await page.goto(`/${slug}`);
          await page.waitForLoadState("networkidle");
          expect(await sideways(page), "no sideways scroll when idle").toBeLessThanOrEqual(0);
          // The drop zone starts on the first screen, and a tap on it opens the file picker.
          const input = page.locator('section[aria-label="Workspace"] input[type="file"]').first();
          const id = await input.getAttribute("id");
          // On phones the full-width "Choose" button (a label for the input) is the way in.
          const target = page.locator(`label[for="${id}"]:visible`).last();
          const box = await target.boundingBox();
          expect(box, "the drop zone is on the page").toBeTruthy();
          if (box)
            expect(box.y, "the drop zone starts on the first screen").toBeLessThan(size.height);
          const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
          await target.tap();
          await (await chooser).setFiles(`tests/fixtures/${fixture}`);
          if (shots) {
            mkdirSync(shots, { recursive: true });
          }
          const run = page.locator('[data-action="run"]');
          await expect(run).toBeVisible({ timeout: 45_000 });
          await page.waitForTimeout(600);
          expect(await sideways(page), "no sideways scroll with a file in").toBeLessThanOrEqual(0);
          expect(await smallTargets(page)).toEqual([]);
          // The primary action is reachable: in view after scrolling to it, and 44px tall.
          await run.scrollIntoViewIfNeeded();
          const r = await run.boundingBox();
          expect(r && r.height >= 44, "the primary is a 44px target").toBe(true);
          if (r)
            expect(r.y + r.height, "the primary fits on the screen").toBeLessThanOrEqual(
              size.height,
            );
          const a11y = await new AxeBuilder({ page }).include("main").analyze();
          expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
          if (shots) {
            await page.getByRole("region", { name: "Workspace" }).scrollIntoViewIfNeeded();
            await page.screenshot({
              path: join(shots, `${info.project.name}-${slug}-${size.width}.png`),
            });
          }
        });
      }
    });
  }
});
