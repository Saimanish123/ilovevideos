import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Batch queue on a single-file tool (feature catalog L1). Several files share one set of options,
 * run one at a time, and each row gets its own status and Download plus one ZIP of everything.
 * A file that cannot be read says so on its own row and is not counted; one that already does the
 * job is skipped.
 * WebKit is skipped: Playwright's WebKit build has no WebCodecs encoder.
 */
const shots = process.env.PLATFORM_SHOTS;
const fx = (name: string, mimeType = "video/mp4") => ({
  name,
  mimeType,
  buffer: readFileSync(join("tests/fixtures", name)),
});
const notMedia = {
  name: "notes.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Shopping list: milk, eggs, a new tripod.\n".repeat(40)),
};

function trackUploads(page: Page): number[] {
  const uploads: number[] = [];
  page.on("request", (req) => {
    const body = req.postData();
    if (body && body.length > 1024) uploads.push(body.length);
  });
  return uploads;
}

async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: true });
}

const rowDownloads = (page: Page) => page.getByRole("link", { name: /^Download (?!all)/ });

test.describe("batch queue", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebCodecs encoding is Chromium only");

  test("compresses three videos one by one, skips one that fits, fails an unreadable file", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const uploads = trackUploads(page);
    await page.goto("/compress-video");
    const stage = page.getByRole("region", { name: "Workspace" });
    await expect(stage.getByText("One file or several at once")).toBeVisible();
    await page
      .locator('input[type="file"]')
      .setInputFiles([
        fx("sample.mp4"),
        fx("sample-tagged.mp4"),
        fx("sample-b.mp4"),
        fx("sample-square.mp4"),
        notMedia,
      ]);

    const list = stage.getByRole("list", { name: "Videos" });
    await expect(list.getByRole("listitem")).toHaveCount(5, { timeout: 30_000 });
    // Per-row answers before anything runs.
    const row = (name: string) => list.getByRole("listitem").filter({ hasText: name });
    // Before anything runs, an unreadable file says so; "Failed." is kept for run failures.
    await expect(row("notes.txt")).toContainText("Cannot read.");
    await expect(row("notes.txt")).not.toContainText("Failed.");
    await expect(row("notes.txt")).toContainText("is a text file, not a video or audio file");
    await expect(row("sample-square.mp4")).toContainText("Skipped.");
    await expect(stage.getByRole("status")).toContainText("3 of 4 videos will run");
    await expect(page.getByText("4 videos · ")).toContainText("1 file cannot be read");
    await shot(page, "batch-ready");
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations.map((v) => v.id),
    ).toEqual([]);

    const button = page.getByRole("button", { name: "Compress", exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: /all files/ })).toBeVisible();

    const zip = page.getByRole("link", { name: "Download all (ZIP)" });
    await expect(zip).toBeVisible({ timeout: 200_000 });
    await expect(page.getByText("3 of 4 videos ready")).toBeVisible();
    await expect(
      page.getByText("1 skipped, 1 could not be read; each row says why."),
    ).toBeVisible();
    await expect(rowDownloads(page)).toHaveCount(3);
    for (const link of await rowDownloads(page).all()) {
      const href = await link.getAttribute("href");
      expect(href).toMatch(/^blob:/);
      const size = await page.evaluate(
        async (u) => (await (await fetch(u ?? "")).blob()).size,
        href,
      );
      expect(size).toBeGreaterThan(1000);
    }
    await expect(row("notes.txt")).toContainText("Cannot read.");
    await shot(page, "batch-done");
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations.map((v) => v.id),
    ).toEqual([]);

    // The ZIP holds the three outputs and passes an integrity test.
    const [file] = await Promise.all([page.waitForEvent("download"), zip.click()]);
    expect(file.suggestedFilename()).toBe("compress-video-3-files.zip");
    const path = await file.path();
    let listing = "";
    try {
      listing = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (listing) {
      expect(listing).toContain("No errors detected");
      expect(listing.match(/testing: .*OK/g)).toHaveLength(3);
      expect(listing).toContain("sample-compressed.mp4");
    }
    expect(uploads, "no request carried a body over 1 KB").toEqual([]);
  });

  test("Escape stops the batch; with nothing finished it returns to ready", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/compress-video");
    await page
      .locator('input[type="file"]')
      // The large clip takes seconds, so Escape lands while the first file is still working.
      .setInputFiles([fx("sample-large.mp4"), fx("sample.mp4")]);
    const button = page.getByRole("button", { name: "Compress", exact: true });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await button.click();
    await page.keyboard.press("Escape");
    await expect(button).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Download all (ZIP)" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Videos" }).getByRole("listitem")).toHaveCount(2);
  });

  test("removing rows down to none goes back to the drop zone", async ({ page }) => {
    await page.goto("/compress-video");
    await page.locator('input[type="file"]').setInputFiles([fx("sample.mp4"), notMedia]);
    const list = page.getByRole("list", { name: "Videos" });
    await expect(list.getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });
    await page.getByRole("button", { name: "Remove notes.txt" }).click();
    await expect(page.getByText("1 video with these settings")).toBeVisible();
    await page.getByRole("button", { name: "Remove sample.mp4" }).click();
    await expect(page.getByText("One file or several at once")).toBeVisible();
  });
});

test("pages with a per-file primary control take one file", async ({ page }) => {
  for (const slug of ["trim-video", "crop-video", "add-subtitles-to-video", "video-info"]) {
    await page.goto(`/${slug}`);
    await expect(page.locator('input[type="file"]')).not.toHaveAttribute("multiple");
    await expect(page.getByText("Your file stays on this device.")).toBeVisible();
  }
  // Merge keeps its own multi-input meaning.
  await page.goto("/merge-videos");
  await expect(page.locator('input[type="file"]')).toHaveAttribute("multiple");
});

// Review screenshots of the batch and the palette at 390 and 1280 (PLATFORM_SHOTS=<dir> only).
for (const width of [390, 1280]) {
  test.describe(`review screenshots at ${width}`, () => {
    test.skip(!shots, "screenshots only when PLATFORM_SHOTS is set");
    test.use({
      viewport: { width, height: 844 },
      ...(width < 768 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    });

    test("workspace and palette", async ({ page }, info) => {
      test.skip(info.project.name !== "chromium", "desktop Chromium project only");
      test.setTimeout(120_000);
      const dir = shots ?? "";
      const stage = page.getByRole("region", { name: "Workspace" });
      const snap = async (name: string) =>
        stage.screenshot({ path: join(dir, `${name}-${width}.png`), animations: "disabled" });
      await page.goto("/compress-video");
      await snap("stage-idle");
      await page
        .locator('input[type="file"]')
        .setInputFiles([fx("sample.mp4"), fx("sample-b.mp4"), fx("sample-square.mp4"), notMedia]);
      await expect(page.getByText("2 of 3 videos will run")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await snap("stage-batch-ready");
      await page.getByRole("button", { name: "Compress", exact: true }).click();
      await expect(page.getByRole("link", { name: "Download all (ZIP)" })).toBeVisible({
        timeout: 90_000,
      });
      await snap("stage-batch-done");
      await page.getByRole("banner").getByRole("button", { name: "Search tools" }).click();
      await page.getByRole("combobox", { name: "Search tools" }).fill("convert mp4");
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(dir, `palette-${width}.png`) });
    });
  });
}
