import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * The installable app (ADR-0102, ADR-0103): the manifest, the service worker (visited pages and the
 * files they loaded work offline; an unvisited page says it is not saved), and the share target (a
 * shared file opens a chooser of tools and is handed to the one chosen). The share POST is made the
 * way an Android share does, from a page the service worker controls.
 */
const fx = (name: string) => resolve("tests/fixtures", name);

async function controlled(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker claims open pages when it activates; a reload is controlled either way.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function share(page: Page, files: { name: string; type: string; path: string }[]) {
  const payload = files.map((f) => ({
    name: f.name,
    type: f.type,
    data: readFileSync(f.path).toString("base64"),
  }));
  await page.evaluate(async (items) => {
    const form = new FormData();
    for (const it of items) {
      const bytes = Uint8Array.from(atob(it.data), (c) => c.charCodeAt(0));
      form.append("media", new File([bytes], it.name, { type: it.type }));
    }
    await fetch("/share-target", { method: "POST", body: form });
  }, payload);
}

test("manifest names the app, its icons and the share target", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.name).toBeTruthy();
  expect(m.display).toBe("standalone");
  expect(m.share_target.action).toBe("/share-target");
  expect(m.share_target.method).toBe("POST");
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
});

test.describe("service worker", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium runs the offline checks");

  test("a visited tool works offline; an unvisited page says it is not saved", async ({
    page,
    context,
  }) => {
    await controlled(page);
    await page.goto("/trim-video");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trim video");
    // Load the tool's own parts once (they are cached on first use, never ahead).
    await page.locator('input[type="file"]').first().setInputFiles(fx("sample.mp4"));
    await expect(page.getByRole("button", { name: "Trim" })).toBeVisible({ timeout: 20_000 });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trim video");
    await page.locator('input[type="file"]').first().setInputFiles(fx("sample.mp4"));
    await expect(page.getByRole("button", { name: "Trim" })).toBeVisible({ timeout: 20_000 });
    await page.goto("/rotate-video").catch(() => undefined);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This page is not saved on this device",
    );
    await context.setOffline(false);
  });

  test("a shared video opens the chooser and is handed to the tool chosen", async ({ page }) => {
    await controlled(page);
    await share(page, [{ name: "holiday.mp4", type: "video/mp4", path: fx("sample.mp4") }]);
    await page.goto("/share");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open a shared file");
    await expect(page.getByText("holiday.mp4")).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await page
      .getByRole("list", { name: "Tools for this file" })
      .getByRole("link", { name: /^Trim video/ })
      .click();
    await expect(page).toHaveURL(/\/trim-video$/);
    await expect(page.getByText("holiday")).toBeVisible({ timeout: 20_000 });
    // Read once: the shared copy is not kept.
    await page.goto("/share");
    await expect(page.getByText("Nothing was received.")).toBeVisible();
  });

  test("two shared videos go to merge together", async ({ page }) => {
    await controlled(page);
    await share(page, [
      { name: "one.mp4", type: "video/mp4", path: fx("sample.mp4") },
      { name: "two.mp4", type: "video/mp4", path: fx("sample-b.mp4") },
    ]);
    await page.goto("/share");
    await expect(page.getByText("2 videos")).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Tools for this file" })
        .getByRole("link", { name: /^Trim video/ }),
    ).toHaveCount(0);
    await page
      .getByRole("list", { name: "Tools for this file" })
      .getByRole("link", { name: /^Merge videos/ })
      .click();
    await expect(page.getByText("one.mp4")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("two.mp4")).toBeVisible();
  });
});
