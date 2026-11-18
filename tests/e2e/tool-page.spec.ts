import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("tool page renders, is accessible and has breadcrumb structured data", async ({ page }) => {
  await page.goto("/compress-video");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compress video");
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((s) => s.includes("BreadcrumbList"))).toBe(true);
  expect(ld.some((s) => /FAQPage|HowTo|SoftwareApplication/.test(s))).toBe(false);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
