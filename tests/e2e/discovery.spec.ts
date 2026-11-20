import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "./axe-builder";

/**
 * Finding a tool (ADR-0123 to ADR-0127): this browser's recent tools on home without layout shift,
 * "Not sure which tool?" reading a dropped file on the device, search as a palette (desktop) or a
 * full-screen sheet (phones) with recents and tasks, hubs grouped by task with format pairs behind a
 * disclosure, related tools with a reason each, and the "Then" row handing a result on.
 */
const shots = process.env.PLATFORM_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: join(shots, `${name}-${page.viewportSize()?.width ?? 0}.png`) });
}
// Base UI's focus guards around an open dialog are role="button" spans without a name in WebKit
// (they only bounce focus back into the dialog); they are the library's, not this page's.
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).exclude("[data-base-ui-focus-guard]").analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.length}`,
  );

/** Total layout shift since navigation, as Lighthouse counts it (no recent input). */
async function watchShift(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
}
const shift = (page: Page) => page.evaluate(() => (window as unknown as { __cls: number }).__cls);

test("home: no personal rows on a first visit; Continue and Because appear with zero layout shift", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await watchShift(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#row-continue")).toBeHidden();
  await expect(page.locator("#row-because")).toBeHidden();
  // Search and file reading load on use only.
  expect(requests.filter((u) => /tool-index|engine\.worker|worker/.test(u))).toEqual([]);
  // Every standalone tool is linked from home; no format pair or preset is.
  await expect(page.locator('#tools a[href="/trim-video"]')).toHaveCount(1);
  await expect(page.locator('#tools a[href="/mov-to-mp4"]')).toHaveCount(0);

  for (const slug of ["trim-video", "merge-videos", "extract-audio-from-video"]) {
    await page.goto(`/${slug}`);
    await expect(page.locator("h1")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("recent-tools") ?? ""))
      .toContain(slug);
  }
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const continueRow = page.locator("#row-continue");
  await expect(continueRow).toBeVisible();
  await expect(continueRow.locator("li h3")).toHaveText([
    "Extract audio from video",
    "Merge videos",
    "Trim video",
  ]);
  const because = page.locator("#row-because");
  await expect(because.getByRole("heading", { level: 2 })).toHaveText(
    "Because you used Extract audio from video",
  );
  await expect(because.locator("li")).not.toHaveCount(0);
  // The category rows keep the editorial order (no reorder by use).
  const y = async (id: string) => (await page.locator(id).boundingBox())?.y ?? 0;
  expect(await y("#row-compress")).toBeLessThan(await y("#row-audio"));
  expect(await shift(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
  await continueRow.scrollIntoViewIfNeeded();
  await shot(page, "home-continue");

  // A copied card still opens its tool in the app.
  await continueRow.getByRole("link", { name: /Merge videos/ }).click();
  await expect(page).toHaveURL(/\/merge-videos$/);
  await page.goBack();

  await page.locator("#row-continue").getByRole("button", { name: /Clear/ }).click();
  await expect(page.locator("#row-continue")).toBeHidden();
  await expect(page.locator("#row-because")).toBeHidden();
  // Focus does not fall to <body>: it moves to the next row's "See all".
  await expect(page.getByRole("link", { name: "See all compress tools" })).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("recent-tools"))).toBeNull();
});

test("home: with storage blocked the page works, editorial order, no personal rows", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/trim-video");
  await expect(page.locator("h1")).toHaveText("Trim video");
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("#row-continue")).toBeHidden();
  await expect(page.locator("#row-order")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("home: the hero search field opens search with what was typed", async ({ page, isMobile }) => {
  await page.goto("/");
  // The visible words are the button's name (WCAG 2.5.3).
  const field = page.getByRole("main").getByRole("button", { name: /^Search 150\+ tools/ });
  const box = await field.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(56);
  const dialog = page.getByRole("dialog", { name: "Search tools" });
  if (isMobile) {
    await field.tap();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
    return;
  }
  // One search box at a time: the header's steps back while the hero's is on screen.
  const header = page.getByRole("banner").getByRole("button", { name: "Search tools" });
  await expect(header).toBeHidden();
  await page.mouse.wheel(0, 1200);
  await expect(header).toBeVisible();
  await page.mouse.wheel(0, -1200);
  await expect(header).toBeHidden();
  await field.focus();
  await page.keyboard.type("trim");
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox", { name: "Search tools" });
  await expect(input).toHaveValue("trim");
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("option").first()).toHaveText(/Trim video/);
});

test("home: a file from the hero is read on the device and its suggestions hand it on", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await watchShift(page);
  await page.goto("/");
  await page.locator('main input[type="file"]').setInputFiles("tests/fixtures/sample-tagged.mp4");
  const dialog = page.getByRole("dialog", { name: "Search tools" });
  await expect(dialog.getByText("Location stored in the file")).toBeVisible({ timeout: 30_000 });
  // Only facts with a reason: a 3 s, 261 kB MP4 gets no size or length rows.
  await expect(dialog.getByRole("link")).toHaveText(["Remove the location"]);
  await dialog.getByRole("button", { name: "Back to search" }).click();
  await page.keyboard.press("Escape");

  await page.locator('main input[type="file"]').setInputFiles("tests/fixtures/sample.mov");
  await expect(dialog.getByText("MOV file")).toBeVisible({ timeout: 30_000 });
  expect(await shift(page)).toBe(0);
  await shot(page, "home-file");
  // Nothing about the file travelled: no request names it.
  expect(requests.filter((u) => /sample/.test(u))).toEqual([]);
  await dialog.getByRole("link", { name: "Convert to MP4" }).click();
  await expect(page).toHaveURL(/\/video-converter$/);
  await expect(page.getByRole("region", { name: "Workspace" })).toContainText("sample.mov", {
    timeout: 30_000,
  });
});

test("home rows: arrow keys move between cards, the lift is never clipped", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "keyboard and hover need a desktop pointer");
  await page.goto("/");
  const row = page.locator("#row-edit");
  await row.scrollIntoViewIfNeeded();
  const links = row.locator("li > a");
  // The row's controls load after the page is interactive (their own chunk); wait for them.
  await expect
    .poll(() =>
      links.evaluateAll((as) => as.filter((a) => (a as HTMLElement).tabIndex === 0).length),
    )
    .toBe(1);
  await links.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(links.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(links.first()).toBeFocused();
  // One tab stop per row: Tab leaves the row instead of walking through its cards.
  expect(
    await links.evaluateAll((as) => as.filter((a) => (a as HTMLElement).tabIndex === 0).length),
  ).toBe(1);
  await page.keyboard.press("Tab");
  expect(await row.locator("ul").evaluate((ul) => ul.contains(document.activeElement))).toBe(false);
  // Previous fades away at the start; Next is there while the row overflows.
  await expect(row.getByRole("button", { name: "Previous edit tools" })).toBeHidden();
  await expect(row.getByRole("button", { name: "Next edit tools" })).toBeVisible();

  // Hover lifts the first card; the scroller leaves room, so its top edge stays inside it.
  await page.mouse.move(0, 0);
  await links.first().hover();
  await page.waitForTimeout(500);
  const card = await links.first().boundingBox();
  const list = await row.locator("ul").boundingBox();
  expect(card && list && card.y).toBeGreaterThan(list?.y ?? 0);
  expect(card && list && card.x).toBeGreaterThan(list?.x ?? 0);
  await shot(page, "home-lift");
});

test("search: recents then tasks when empty, job-aware results, never a dead end", async ({
  page,
  isMobile,
}) => {
  await page.goto("/trim-video");
  await expect(page.locator("h1")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("recent-tools") ?? ""))
    .toContain("trim-video");
  // Search opened on a tool page leaves that page out of its recents (Enter would only reload it).
  await page.goto("/compress-video");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("recent-tools") ?? ""))
    .toContain("compress-video");
  await page.getByRole("banner").getByRole("button", { name: "Search tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Search tools" });
  const input = dialog.getByRole("combobox", { name: "Search tools" });
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("group", { name: "Recent" }).getByRole("option")).toHaveText([
    "Trim video",
  ]);
  await expect(
    dialog.getByRole("group", { name: "Browse by task" }).getByRole("option").first(),
  ).toHaveText("Make a video smaller");

  // Phones: a full-screen sheet with a way back; desktop: a palette.
  const box = await dialog.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  if (isMobile) {
    expect(box?.width).toBe(vw);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  } else expect(box?.width).toBeLessThan(vw);
  expect(await axe(page)).toEqual([]);
  await shot(page, "search-empty");

  await input.fill("video too big for whatsapp");
  const options = dialog.getByRole("option");
  await expect(options.first()).toHaveText(/Compress video for WhatsApp/);
  await input.fill("video");
  expect(await options.count()).toBeLessThanOrEqual(isMobile ? 6 : 8);
  for (const o of await options.all())
    expect((await o.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await shot(page, "search-results");

  await input.fill("zzqx");
  await expect(dialog.getByText("No tool matches “zzqx”.")).toBeVisible();
  await expect(dialog.getByRole("option").first()).toHaveText("Make a video smaller");
  await shot(page, "search-none");

  // A problem leads with the standalone tool; a named pair leads with its page (ADR-0154).
  await input.fill("iphone video wont play on windows");
  await expect(options.first()).toHaveText(/Change video codec/);
  await input.fill("hevc to h264");
  await expect(options.first()).toHaveText(/Convert HEVC to H\.264/);
  await options.first().click();
  await expect(page).toHaveURL(/\/hevc-to-h264$/);
});

test("search: a file chosen inside search gets the same suggestions", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/trim-video");
  await page.getByRole("banner").getByRole("button", { name: "Search tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Search tools" });
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mov");
  await expect(dialog.getByText("MOV file")).toBeVisible({ timeout: 30_000 });
  await shot(page, "search-file");
  await dialog.getByRole("link", { name: "Convert to MP4" }).click();
  await expect(page).toHaveURL(/\/video-converter$/);
  await expect(dialog).toHaveCount(0);
});

test("hubs: task headings with links to them; format pairs behind a disclosure, still in the HTML", async ({
  page,
}) => {
  await page.goto("/tools/edit");
  const tasks = page.getByRole("navigation", { name: "Tasks on this page" });
  await expect(tasks.getByRole("link").first()).toHaveText("Cut and join");
  await expect(page.getByRole("heading", { level: 2, name: "Fix the picture" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await shot(page, "hub-edit");

  await page.goto("/tools/convert");
  // Every format page sits in one closed disclosure at the bottom (ADR-0154).
  const summary = page.getByText("All 36 format pages");
  await expect(summary).toBeVisible();
  // Closed, the links are out of the accessibility tree but in the HTML for crawlers.
  await expect(page.locator('a[href="/webm-to-mov"]')).toHaveCount(1);
  await expect(page.locator('a[href="/mov-to-mp4"]')).toHaveCount(1);
  const pair = page.getByRole("link", { name: /Convert WebM to MOV/ });
  await expect(pair).toHaveCount(0);
  await summary.click();
  await expect(pair).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await shot(page, "hub-convert");

  // The platform hub is only families: they stay open.
  await page.goto("/tools/platform");
  await expect(page.getByRole("link", { name: /Compress video for Discord/ })).toBeVisible();
});

test("tool page: related tools are name-only pills; standalone pages link standalone tools", async ({
  page,
}) => {
  await page.goto("/video-converter");
  const related = page.getByRole("region", { name: "Related tools" });
  const pills = related.getByRole("list").getByRole("link");
  // Six tools as pills; "All tools" is a quiet link beside the heading, not a pill.
  await expect(pills).toHaveCount(6);
  await expect(related.getByRole("link", { name: "All tools", exact: true })).toHaveCount(1);
  const index = (await (await page.request.get("/tool-index.json")).json()) as {
    tools: { slug: string; generated?: true }[];
  };
  const generated = new Set(index.tools.filter((t) => t.generated).map((t) => `/${t.slug}`));
  for (const href of await pills.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? "")))
    expect(generated.has(href), `${href}: no format pair or preset on a standalone page`).toBe(
      false,
    );
  for (const p of await pills.all()) {
    const box = await p.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    // Fits its row: never wider than the column.
    expect(box?.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) - 32);
  }
  // The format pages are not listed on the converter any more.
  await expect(page.getByText("Pages for common conversions")).toHaveCount(0);
  expect(await page.getByRole("contentinfo").getByRole("link").count()).toBeLessThanOrEqual(16);
  await related.scrollIntoViewIfNeeded();
  await shot(page, "related");

  // A format pair may show its siblings.
  await page.goto("/mov-to-mp4");
  await expect(
    page
      .getByRole("region", { name: "Related tools" })
      .getByRole("link", { name: "Convert MP4 to MOV" }),
  ).toBeVisible();
});

test("result: the Then row hands the output to the next tool", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/mov-to-mp4");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample.mov");
  await page.getByRole("button", { name: /^Convert/ }).click();
  const then = page.getByRole("navigation", { name: "Then" });
  await expect(then).toBeVisible({ timeout: 60_000 });
  await expect(then.getByRole("link")).toHaveText([
    "Make it smaller",
    "Trim it",
    "Make a GIF of it",
  ]);
  for (const l of await then.getByRole("link").all())
    expect((await l.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await then.scrollIntoViewIfNeeded();
  await shot(page, "then");
  await then.getByRole("link", { name: "Trim it" }).click();
  await expect(page).toHaveURL(/\/trim-video$/);
  await expect(page.getByRole("region", { name: "Workspace" })).toContainText("sample.mp4", {
    timeout: 30_000,
  });
});
