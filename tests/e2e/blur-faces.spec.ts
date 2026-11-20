import { existsSync, readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";
import { readTruth, scoreFind } from "./face-metrics";
import { pixels, probe, saveDownload, shootWidths, trackUploads } from "./overlay-helpers";

/**
 * Find faces on the blur page (ADR-0113 to ADR-0117), end to end. The fixtures
 * (scripts/vision/make_face_fixtures.py) move, zoom, tilt and cut between NASA crew portraits with
 * every frame's faces known: faces-pan.mp4 (720p, 19 faces over four shots, one without faces),
 * faces-small.mp4 (1080p, 37 faces 15 to 24 px tall) and faces-rotated.mp4 (a phone file shown
 * 360×640). The quality test runs the page's own pipeline through the dev bench and scores every
 * frame against the truth; the page tests check the flow, the keyboard, cancel and a real run whose
 * faces must come out without their detail. OVERLAY_SHOTS=<dir> saves 390, 768 and 1280 shots.
 */

const PAN = "tests/fixtures/faces/faces-pan.mp4";

async function open(page: Page, file = PAN) {
  await page.goto("/blur-video");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blur part of a video");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(page.getByRole("button", { name: "Blur", exact: true })).toBeEnabled({
    timeout: 30_000,
  });
}

const findButton = (page: Page) => page.getByRole("button", { name: "Find faces" });
/** A face's button in the panel (its name adds when it starts, for screen readers). */
const faceButton = (page: Page, n: number) =>
  page.getByRole("button", { name: new RegExp(`^Face ${n}( ?,|$)`) });

const CHECK = "Play it through and draw over any face it missed.";
const announcer = (page: Page) => page.getByTestId("find-announcer");

async function findFaces(page: Page) {
  await findButton(page).click();
  await expect(page.getByText(CHECK, { exact: true })).toBeVisible({ timeout: 180_000 });
}

/** The face count from the summary line, the one place it is shown. */
async function foundCount(page: Page) {
  const line = await page.getByText(/^\d+ faces?, medium blur/).textContent();
  return Number(line?.match(/^\d+/)?.[0]);
}

test.describe("find faces: the page", () => {
  test("finds the faces, names them and keeps the page accessible", async ({ page }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await open(page);
    await shootWidths(page, "faces-ready");
    await findButton(page).click();
    // Held while it runs, with a way out; Add region stays in place, waiting, with its reason.
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Blur", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add region" })).toBeDisabled();
    await expect(page.getByText("Add region is back once the search ends.")).toBeVisible();
    await shootWidths(page, "faces-finding");
    await expect(page.getByText(CHECK, { exact: true })).toBeVisible({ timeout: 180_000 });
    const found = await foundCount(page);
    // 19 faces in the fixture, and one elbow the model takes for a face.
    expect(found).toBeGreaterThanOrEqual(19);
    expect(found).toBeLessThanOrEqual(21);
    await expect(
      page.getByText(new RegExp(`^${found} faces, medium blur · H\\.264 1280×720 · no sound$`)),
    ).toBeVisible();
    // The count is said once on screen (the summary), and in full to screen readers.
    await expect(page.locator("p[tabindex='-1']")).toHaveText(CHECK);
    await expect(announcer(page)).toHaveText(`${found} faces found. ${CHECK}`);
    // The starting region was replaced; the first face is selected and the list is collapsed.
    await expect(page.getByRole("button", { name: "Region 1", exact: true })).toHaveCount(0);
    await expect(faceButton(page, 1)).toHaveAttribute("aria-pressed", "true");
    await expect(faceButton(page, 7)).toHaveCount(0);
    await page.getByRole("button", { name: `${found - 6} more` }).click();
    await expect(faceButton(page, 7)).toBeVisible();
    await page.getByRole("button", { name: "Show fewer" }).click();
    // Find faces is not offered again while found faces remain.
    await expect(findButton(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Blur", exact: true })).toBeEnabled();
    await shootWidths(page, "faces-found");
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // Names stay with their faces: deleting Face 3 leaves Face 4 named Face 4.
    await faceButton(page, 3).click();
    await page.getByRole("button", { name: "Delete face 3" }).click();
    await expect(faceButton(page, 3)).toHaveCount(0);
    await expect(faceButton(page, 4)).toBeVisible();
    // Keyboard: the selected face on the picture is focusable and Delete removes it.
    await faceButton(page, 1).click();
    const face1 = page.getByRole("group", { name: /^Face 1:/ });
    await face1.focus();
    await page.keyboard.press("Delete");
    await expect(page.getByText(new RegExp(`^${found - 2} faces, medium blur`))).toBeVisible();
    // Nothing was uploaded; the model came from this site.
    expect(uploads).toEqual([]);
  });

  test("from the keyboard alone: find, cancel, find again; focus and announcements follow", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(240_000);
    await open(page);
    // Reach Find faces with Tab from Add region, its neighbour. WebKit, like Safari by default,
    // does not Tab to buttons, so there the button is focused directly; every action is a key.
    await page.getByRole("button", { name: "Add region" }).focus();
    if (browserName === "webkit") await findButton(page).focus();
    else await page.keyboard.press("Tab");
    await expect(findButton(page)).toBeFocused();
    await page.keyboard.press("Enter");
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeFocused();
    await expect(announcer(page)).toHaveText(/^Finding faces/);
    await page.keyboard.press("Enter");
    await expect(findButton(page)).toBeFocused();
    await expect(page.getByRole("button", { name: "Region 1", exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(cancel).toBeFocused();
    await expect(announcer(page)).toHaveText(/^\d+ faces found\. Play it through/, {
      timeout: 180_000,
    });
    await expect(faceButton(page, 1)).toBeFocused();
    await expect(faceButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  });

  test("cancel stops the search and leaves the regions as they were", async ({ page }) => {
    await open(page);
    await findButton(page).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(findButton(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Region 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Blur", exact: true })).toBeEnabled();
  });

  test("a video without faces says so, there and aloud, and keeps the starting region", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, "tests/fixtures/sample.mp4");
    await findButton(page).click();
    // The visible line (the announcer says the same, off screen).
    const none = page.locator("p[tabindex='-1']", { hasText: /^No faces found\./ });
    await expect(none).toBeVisible({ timeout: 60_000 });
    await expect(none).toBeFocused();
    await expect(announcer(page)).toHaveText(/^No faces found\./);
    await expect(page.getByRole("button", { name: "Region 1", exact: true })).toBeVisible();
    await expect(findButton(page)).toBeVisible();
  });
});

test.describe("find faces: measured", () => {
  async function bench(page: Page) {
    await page.route("**/__vision-fixtures/*", (route) => {
      const n = new URL(route.request().url()).pathname.split("/").pop() ?? "";
      const path = existsSync(`tests/fixtures/vision/${n}`)
        ? `tests/fixtures/vision/${n}`
        : `tests/fixtures/faces/${n}`;
      route.fulfill({ body: readFileSync(path) });
    });
    await page.goto("/dev/vision");
    await expect(page.locator("[data-bench]")).toHaveAttribute("data-bench", "ready", {
      timeout: 30_000,
    });
  }

  for (const [name, min] of [
    ["faces-pan.mp4", 0.99],
    ["faces-small.mp4", 0.97],
    ["faces-rotated.mp4", 0.99],
  ] as const) {
    test(`hides the faces of ${name}`, async ({ page }) => {
      test.setTimeout(300_000);
      await bench(page);
      const r = await page.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the bench is a dev-only window global
        (n) => (window as any).__vision.findFaces(n, 6),
        name,
      );
      const s = scoreFind(readTruth(name), r.result.samples, r.regions, r.result.sampleSec);
      const { misses, ...summary } = s;
      test.info().annotations.push({
        type: "measured",
        description: `${test.info().project.name} ${name}: ${JSON.stringify({ ...summary, passes: r.result.passes, detectMs: Math.round(r.result.detectMs), totalMs: Math.round(r.result.totalMs) })}`,
      });
      expect(s.recall).toBeGreaterThanOrEqual(0.98);
      expect(s.fullyHidden, JSON.stringify(misses)).toBeGreaterThanOrEqual(min);
      expect(s.mostlyHidden).toBeGreaterThanOrEqual(0.99);
      expect(s.meanRegionsPerFace).toBeLessThanOrEqual(1.1);
    });
  }
});

test.describe("find faces: the blurred file", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding needs Chromium");

  test("blurs every found face so its detail is gone", async ({ page }) => {
    test.setTimeout(400_000);
    await open(page);
    await findFaces(page);
    await page.getByRole("button", { name: "Blur", exact: true }).click();
    const out = await saveDownload(page, 300_000);
    await shootWidths(page, "faces-done");
    const p = probe(out.path);
    const v = p.streams.find((s) => s.codec_type === "video");
    expect(v).toMatchObject({ codec_name: "h264", width: 1280, height: 720 });
    expect(p.duration).toBeGreaterThan(7.9);
    // Detail (mean absolute difference between neighbours) inside each true face box, before and
    // after, at a moment in each shot with faces.
    const truth = readTruth("faces-pan.mp4");
    const detail = (buf: Uint8Array, w: number) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i + w + 1 < buf.length; i++) {
        if ((i + 1) % w === 0) continue;
        s +=
          Math.abs((buf[i] ?? 0) - (buf[i + 1] ?? 0)) + Math.abs((buf[i] ?? 0) - (buf[i + w] ?? 0));
        n += 2;
      }
      return s / n;
    };
    const ratios: number[] = [];
    for (const t of [1.5, 4.5, 7.5]) {
      const f = Math.round(t * truth.fps);
      for (const q of truth.frames[f] ?? []) {
        if ((q[8] ?? 0) < 1) continue;
        const xs = [q[0], q[2], q[4], q[6]] as number[];
        const ys = [q[1], q[3], q[5], q[7]] as number[];
        const box = {
          x: Math.max(0, Math.round(Math.min(...xs))),
          y: Math.max(0, Math.round(Math.min(...ys))),
          w: Math.round(Math.max(...xs) - Math.min(...xs)),
          h: Math.round(Math.max(...ys) - Math.min(...ys)),
        };
        const before = detail(pixels(PAN, f / truth.fps, box), box.w);
        const after = detail(pixels(out.path, f / truth.fps, box), box.w);
        ratios.push(after / before);
      }
    }
    test.info().annotations.push({
      type: "measured",
      description: `face detail left after the default blur: worst ${Math.max(...ratios).toFixed(3)}, mean ${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(3)} over ${ratios.length} faces`,
    });
    expect(ratios.length).toBeGreaterThan(15);
    for (const r of ratios) expect(r).toBeLessThan(0.35);
  });
});
