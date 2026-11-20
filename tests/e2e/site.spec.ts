import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * The site shell: home, a hub, the plain-language pages and the kitchen sink. Each renders one H1,
 * carries BreadcrumbList (or, on home, only Organization and WebSite) and never FAQPage, HowTo or
 * SoftwareApplication, has zero axe violations, raises no CSP violation, and on touch devices every
 * control outside running prose is at least 44px tall.
 */

const pages = [
  { path: "/", h1: "Free online video tools, one job per page.", breadcrumb: false },
  { path: "/tools/edit", h1: "Edit video tools", breadcrumb: true },
  { path: "/tools/convert", h1: "Video and audio converters", breadcrumb: true },
  { path: "/trim-video", h1: "Trim video", breadcrumb: true },
  { path: "/privacy", h1: "Privacy", breadcrumb: true },
  { path: "/about", h1: "About", breadcrumb: true },
  { path: "/licences", h1: "Open-source licences", breadcrumb: true },
];

async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (execute|load|connect)/i.test(m.text()))
      violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return violations;
}

for (const p of pages) {
  test(`${p.path} renders, is accessible and has the right structured data`, async ({ page }) => {
    const csp = await collectCspViolations(page);
    const res = await page.goto(p.path);
    expect(res?.status()).toBe(200);
    expect(res?.headers()["set-cookie"]).toBeUndefined();
    expect(res?.headers()["content-security-policy"]).toContain("connect-src 'self'");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.h1);
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join();
    expect(ld.includes("BreadcrumbList")).toBe(p.breadcrumb);
    expect(ld).not.toMatch(/FAQPage|HowTo|SoftwareApplication|SearchAction/);
    if (p.breadcrumb)
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(csp).toEqual([]);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  });
}

test("the built pages carry a strict script policy with hashes and no unsafe-inline", async ({
  page,
}) => {
  await page.goto("/");
  const meta = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(meta).toMatch(/script-src 'self'[^;]*'sha256-/);
  expect(meta).not.toContain("'unsafe-inline' ");
  expect(meta?.split(";").find((d) => d.trim().startsWith("script-src"))).not.toContain(
    "unsafe-inline",
  );
});

test("touch targets are at least 44px outside running prose", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, "44px applies to touch pointers");
  for (const path of [
    "/",
    "/tools/captions",
    "/tools/gif",
    "/privacy",
    "/licences",
    "/trim-video",
  ]) {
    await page.goto(path);
    // Measure the page at rest: a box caught mid-entrance (ADR-0157) reads a fraction of a pixel short.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
          .map((a) => a.finished),
      ),
    );
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a, button, input, [role=button]")]
        .filter((el) => !el.closest("p, dd, pre"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 1 && r.height > 1 && (r.height < 44 || r.width < 44))
        .map(
          ({ el, r }) =>
            `${el.tagName} "${el.textContent?.trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}px`,
        ),
    );
    expect(small, path).toEqual([]);
  }
});

test("tool cards and OG images use the tool's illustration", async ({ page, request }) => {
  await page.goto("/tools/captions");
  // Every card on the hub has an illustration, none falls back to the glyph.
  const cards = page.locator("main ul li a:has(h3)");
  expect(await cards.count()).toBeGreaterThan(3);
  for (const card of await cards.all()) await expect(card.locator("svg")).toHaveCount(1);
  await page.goto("/add-subtitles-to-video");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  // A plain static file: no locale redirect and no query string, which robots' /*?* would block.
  expect(new URL(og ?? "").pathname).toBe("/og/add-subtitles-to-video.png");
  expect(new URL(og ?? "").search).toBe("");
  expect(await page.locator('meta[property="og:image:alt"]').getAttribute("content")).toContain(
    "Add subtitles",
  );
  expect(await page.locator('meta[name="twitter:image"]').getAttribute("content")).toBe(og);
  const img = await request.get(new URL(og ?? "").pathname, { maxRedirects: 0 });
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  // Hubs and legal pages carry a card too.
  for (const path of ["/tools/captions", "/privacy"]) {
    await page.goto(path);
    const hubOg = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(new URL(hubOg ?? "").pathname).toMatch(/^\/og\/[a-z0-9-]+\.png$/);
    expect((await request.get(new URL(hubOg ?? "").pathname)).status()).toBe(200);
  }
});

test("the kitchen sink is excluded from robots and the sitemap", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /dev/");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/dev/");
  expect(sitemap).toContain("/privacy");
});
