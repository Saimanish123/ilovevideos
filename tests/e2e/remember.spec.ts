import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Remembered settings, saved settings and "Your last result" (ADR-0129, ADR-0131), and the privacy
 * page's clear control. Reading a file needs no encoder, so these run on every project; the run
 * that makes a result is a packet copy (remove audio), which WebKit does too.
 * Set REMEMBER_SHOTS=<dir> for screenshots at the viewport's width.
 */
const shots = process.env.REMEMBER_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: false });
};

const choose = async (page: Page, fixture = "sample.mp4") => {
  await page
    .locator('section[aria-label="Workspace"] input[type="file"]')
    .first()
    .setInputFiles(`tests/fixtures/${fixture}`);
};
/** Chooses a quality preset by its visible label, as a tap would. */
const pick = (page: Page, label: string) =>
  page.getByRole("radiogroup").first().getByText(label, { exact: true }).click();
const preset = (page: Page, label: string) =>
  page.getByRole("radiogroup").first().getByRole("radio", { name: label, exact: true });

test.describe("remembered settings", () => {
  test("a changed setting is the next file's start; reset goes back to the page's default", async ({
    page,
  }) => {
    await page.goto("/compress-video");
    await choose(page);
    await expect(page.getByRole("button", { name: "Compress", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(preset(page, "Balanced")).toBeChecked();
    // No way back to show while nothing was restored.
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toHaveCount(0);
    await pick(page, "Smaller");
    await expect(preset(page, "Smaller")).toBeChecked();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("settings:compress-video")))
      .toContain('"preset":"smaller"');

    // A reload and the next file: the setting is back.
    await page.reload();
    await choose(page);
    await expect(preset(page, "Smaller")).toBeChecked({ timeout: 30_000 });
    const reset = page.getByRole("button", { name: "Reset to defaults" });
    await expect(reset).toBeVisible();
    await shot(page, "remember-restored");
    const axe = await new AxeBuilder({ page }).include('section[aria-label="Workspace"]').analyze();
    expect(axe.violations).toEqual([]);
    await reset.click();
    await expect(preset(page, "Balanced")).toBeChecked();
    await expect(reset).toHaveCount(0);
    // The button went with the restored settings: focus is on the disclosure that holds them.
    await expect(page.locator("summary", { hasText: "Saved settings" })).toBeFocused();
    await expect(
      page.getByRole("status").filter({ hasText: "back to the page's defaults" }),
    ).toBeAttached();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("settings:compress-video")))
      .toBeNull();
  });

  test("a page's own preset is never overridden (a size page keeps its size)", async ({ page }) => {
    await page.goto("/compress-video-for-discord");
    await page.evaluate(() =>
      localStorage.setItem(
        "settings:compress-video-for-discord",
        JSON.stringify({ v: 1, values: { preset: "smaller", targetMb: 500, maxHeight: 720 } }),
      ),
    );
    await page.reload();
    await choose(page);
    await expect(page.getByRole("radio", { name: /· 10 MB$/ })).toBeChecked({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: /· 500 MB$/ })).not.toBeChecked();
  });

  test("a stale or edited value is dropped and the page opens with its defaults", async ({
    page,
  }) => {
    await page.goto("/compress-video");
    await page.evaluate(() =>
      localStorage.setItem(
        "settings:compress-video",
        JSON.stringify({ v: 1, values: { preset: "ultra", maxHeight: "big" } }),
      ),
    );
    await page.reload();
    await choose(page);
    await expect(preset(page, "Balanced")).toBeChecked({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toHaveCount(0);
  });

  test("blocked storage: the page still works", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    await page.goto("/compress-video");
    await choose(page);
    await expect(page.getByRole("button", { name: "Compress", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await pick(page, "Best");
    await expect(preset(page, "Best")).toBeChecked();
  });
});

test.describe("saved settings", () => {
  test("save, apply and delete by name, from the keyboard", async ({ page }) => {
    await page.goto("/compress-video");
    await choose(page);
    await expect(page.getByRole("button", { name: "Compress", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await pick(page, "Best");
    const summary = page.locator("summary", { hasText: "Saved settings" });
    await summary.focus();
    await page.keyboard.press("Enter");
    const name = page.getByLabel("Name these settings");
    await name.fill("Archive");
    await name.press("Enter");
    const entry = page.getByRole("button", { name: "Archive", exact: true });
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute("aria-pressed", "true");
    await shot(page, "saved-settings-open");
    // An empty name says why it was not saved.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Type a name first.")).toBeVisible();

    await pick(page, "Smaller");
    await expect(entry).toHaveAttribute("aria-pressed", "false");
    await entry.click();
    await expect(preset(page, "Best")).toBeChecked();
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeVisible();

    await page.getByRole("button", { name: "Delete Archive" }).click();
    await expect(entry).toHaveCount(0);
    // No entry left: focus moves to the name field, and the deletion is announced.
    await expect(page.getByLabel("Name these settings")).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "Deleted Archive." })).toBeAttached();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("presets:compress-video")))
      .toBeNull();
  });
});

test.describe("saved settings inside More options", () => {
  test("a page with More options holds them there, not in a second disclosure", async ({
    page,
  }) => {
    await page.goto("/blur-video");
    await choose(page);
    await expect(page.getByRole("button", { name: "Blur", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // One disclosure: no stage row of its own.
    await expect(page.locator("summary", { hasText: "Saved settings" })).toHaveCount(0);
    await page.locator("summary", { hasText: "More options" }).click();
    const group = page.getByRole("group", { name: "Saved settings" });
    await expect(group).toBeVisible();
    await group.getByLabel("Name these settings").fill("Soft");
    await group.getByRole("button", { name: "Save", exact: true }).click();
    await expect(group.getByRole("button", { name: "Soft", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Saved as Soft." })).toBeAttached();
    await shot(page, "saved-settings-in-more-options");
  });
});

test.describe("your last result", () => {
  test("survives a reload under the drop zone, with Download, until dismissed", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "Playwright's WebKit has no OPFS (getDirectory() fails), so nothing is kept there",
    );
    test.setTimeout(90_000);
    await page.goto("/remove-audio-from-video");
    await choose(page);
    await page.getByRole("button", { name: "Remove audio", exact: true }).click();
    const download = page.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible({ timeout: 60_000 });
    // The copy is written in the background.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("kept-results") ?? ""), {
        timeout: 20_000,
      })
      .toContain("remove-audio-from-video");

    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.reload();
    await expect(page.getByText("Your last result")).toBeVisible({ timeout: 15_000 });
    // The way in stays: a new file can be chosen straight away.
    await expect(
      page.locator('section[aria-label="Workspace"] input[type="file"]').first(),
    ).toBeAttached();
    await shot(page, "last-result");
    const axe = await new AxeBuilder({ page }).include('section[aria-label="Workspace"]').analyze();
    expect(axe.violations).toEqual([]);
    await page.waitForTimeout(500);
    // The row is added at the foot of the drop zone after the page loads; at 390 it falls into the
    // zone's reserved height, at desktop widths the centred prompt moves up by half its height.
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    test.info().annotations.push({
      type: "measured",
      description: `kept result row, layout shift at ${page.viewportSize()?.width}px: ${cls.toFixed(4)}`,
    });
    expect(cls).toBeLessThan(0.01);

    const out = mkdtempSync(join(tmpdir(), "kept-"));
    const pending = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download", exact: true }).click();
    const d = await pending;
    const path = join(out, d.suggestedFilename());
    await d.saveAs(path);
    expect(d.suggestedFilename()).toMatch(/\.mp4$/);
    expect(statSync(path).size).toBeGreaterThan(10_000);

    // A new file while it shows: the stage opens with that file.
    await choose(page);
    await expect(page.getByRole("button", { name: "Remove audio", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // Removing that file leaves the last result; its cross removes it.
    await page.getByRole("button", { name: /^Remove sample/ }).click();
    await page.getByRole("button", { name: "Remove your last result" }).click();
    await expect(page.getByText("Your last result")).toHaveCount(0);
    // The cross went with the row: focus is on the way in.
    await expect(
      page.locator('section[aria-label="Workspace"] input[type="file"]').first(),
    ).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("kept-results") ?? "{}"))
      .toBe("{}");
    await page.reload();
    await expect(
      page.locator('section[aria-label="Workspace"] input[type="file"]').first(),
    ).toBeAttached();
    await expect(page.getByText("Your last result")).toHaveCount(0);
  });

  test("an expired result is not offered and is removed", async ({ page }) => {
    await page.goto("/remove-audio-from-video");
    await page.evaluate(() =>
      localStorage.setItem(
        "kept-results",
        JSON.stringify({
          "remove-audio-from-video": { at: Date.now() - 25 * 3600_000, bytes: 10 },
        }),
      ),
    );
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.getByText("Your last result")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("kept-results"))).toBe("{}");
  });
});

test.describe("privacy page", () => {
  test("lists what is kept and clears it all", async ({ page, browserName }) => {
    const opfs = browserName !== "webkit";
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "What this browser keeps", exact: true }),
    ).toBeVisible();
    await page.evaluate(async (opfs) => {
      localStorage.setItem("settings:compress-video", '{"v":1,"values":{"preset":"best"}}');
      localStorage.setItem("recent-tools", '[{"slug":"trim-video","title":"Trim video"}]');
      if (!opfs) return;
      const root = await navigator.storage.getDirectory();
      const d = await root.getDirectoryHandle("results", { create: true });
      await d.getDirectoryHandle("trim-video", { create: true });
    }, opfs);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    // Measured when the page opens: what was just stored shows after a reload.
    await page.reload();
    await expect(page.getByText(/^This site keeps .+ here: .*settings for 1 page/)).toBeVisible();
    await page.getByRole("button", { name: "Clear what this site stored" }).click();
    await shot(page, "privacy-clear-confirm");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByText(/^Removed .+: recent tools, settings for 1 page/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear what this site stored" })).toBeFocused();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    if (!opfs) return;
    const left = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const n of (root as unknown as { keys(): AsyncIterable<string> }).keys())
        names.push(n);
      return names;
    });
    expect(left).toEqual([]);
    await shot(page, "privacy-cleared");
  });
});
