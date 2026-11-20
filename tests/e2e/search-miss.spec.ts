import { expect, type Page, type Request, test } from "@playwright/test";

/**
 * Failed searches are counted (ADR-0150 to ADR-0152): one beacon per query, after typing settles
 * with no results or when search closes without a tool opened, carrying only the normalised query
 * and a count. An opened result sends nothing; a blocked network breaks nothing.
 */
const palette = (page: Page) => page.getByRole("dialog", { name: "Search tools" });
const input = (page: Page) => palette(page).getByRole("combobox", { name: "Search tools" });

async function openSearch(page: Page) {
  await page.getByRole("banner").getByRole("button", { name: "Search tools" }).click();
  await expect(input(page)).toBeFocused();
}

/** Closes the way each device does: Cancel on the phone sheet, Escape on desktop. */
async function closeSearch(page: Page, isMobile: boolean) {
  if (isMobile) await palette(page).getByRole("button", { name: "Cancel" }).click();
  else await page.keyboard.press("Escape");
  await expect(palette(page)).toHaveCount(0);
}

/**
 * Records beacons as they leave. Observed, not routed: WebKit's beacons bypass `page.route`, so they
 * reach the test server, which counts them in its own file (playwright.config, SEARCH_MISS_FILE).
 */
function catchBeacons(page: Page) {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/search-miss") seen.push(r);
  });
  return seen;
}

const bodyOf = (r: Request) => JSON.parse(r.postData() ?? "null") as unknown;

test("a search with no results sends one beacon with the query, once", async ({
  page,
  isMobile,
}) => {
  const beacons = await catchBeacons(page);
  await page.goto("/trim-video");
  await openSearch(page);
  await input(page).fill("Blorp  Zzqx!");
  await expect(palette(page).getByText(/No tool matches “/)).toBeVisible();
  // Not per keystroke: nothing before typing settles.
  expect(beacons).toHaveLength(0);
  await expect.poll(() => beacons.length, { timeout: 5000 }).toBe(1);
  const [beacon] = beacons;
  expect(beacon?.method()).toBe("POST");
  expect(new URL(beacon?.url() ?? "").pathname).toBe("/api/search-miss");
  expect(bodyOf(beacon as Request)).toEqual({
    q: "blorp zzqx",
    results: 0,
    opened: false,
    zero: true,
  });
  // No cookie travels with it (the site sets none).
  expect(await beacon?.headerValue("cookie")).toBeFalsy();

  // Closing, reopening and typing the same query again sends nothing more.
  await closeSearch(page, isMobile);
  await openSearch(page);
  await input(page).fill("blorp zzqx");
  await page.waitForTimeout(2000);
  await closeSearch(page, isMobile);
  await page.waitForTimeout(300);
  expect(beacons).toHaveLength(1);
});

test("closing search with results and no tool opened sends the count", async ({
  page,
  isMobile,
}) => {
  const beacons = await catchBeacons(page);
  await page.goto("/trim-video");
  await openSearch(page);
  await input(page).fill("make it louder");
  await expect(palette(page).getByRole("option").first()).toBeVisible();
  const listed = await palette(page).getByRole("option").count();
  await page.waitForTimeout(1500);
  expect(beacons).toHaveLength(0);
  await closeSearch(page, isMobile);
  await expect.poll(() => beacons.length, { timeout: 5000 }).toBe(1);
  expect(bodyOf(beacons[0] as Request)).toEqual({
    q: "make it louder",
    results: listed,
    opened: false,
    zero: false,
  });
});

test("opening a result sends nothing", async ({ page }) => {
  const beacons = await catchBeacons(page);
  await page.goto("/trim-video");
  await openSearch(page);
  await input(page).fill("shrink");
  const first = palette(page).getByRole("option").first();
  await expect(first).toContainText("Compress video");
  await page.waitForTimeout(1500);
  await first.click();
  await expect(page).toHaveURL(/\/compress-video$/);
  await page.waitForTimeout(1500);
  expect(beacons).toHaveLength(0);
});

test("a blocked network breaks nothing", async ({ page, context, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/trim-video");
  // Search loads its list first; then the network goes away.
  await openSearch(page);
  await expect(palette(page).getByRole("option").first()).toBeVisible();
  await context.setOffline(true);
  await input(page).fill("qqxv blorp");
  await expect(palette(page).getByText(/No tool matches “/)).toBeVisible();
  await page.waitForTimeout(2000);
  await input(page).fill("louder");
  await expect(palette(page).getByRole("option").first()).toBeVisible();
  await closeSearch(page, isMobile);
  // Search still works offline, and navigates once the network is back.
  await openSearch(page);
  await input(page).fill("mute");
  await expect(palette(page).getByRole("option").first()).toContainText("Remove audio from video");
  await closeSearch(page, isMobile);
  await context.setOffline(false);
  await openSearch(page);
  await input(page).fill("mute");
  const first = palette(page).getByRole("option").first();
  await expect(first).toContainText("Remove audio from video");
  await first.click();
  await expect(page).toHaveURL(/\/remove-audio-from-video$/);
  expect(errors).toEqual([]);
});

test("the endpoint takes only the beacon's body and sets nothing", async ({ request }) => {
  const ok = await request.post("/api/search-miss", {
    data: JSON.stringify({ q: "e2e endpoint check", results: 0, opened: false, zero: true }),
    headers: { "content-type": "text/plain;charset=UTF-8" },
  });
  expect(ok.status()).toBe(204);
  expect(ok.headers()["set-cookie"]).toBeUndefined();
  expect(await ok.text()).toBe("");

  const extra = await request.post("/api/search-miss", {
    data: { q: "blorp", results: 0, opened: false, zero: true, name: "holiday.mov" },
  });
  expect(extra.status()).toBe(400);
  const big = await request.post("/api/search-miss", { data: "x".repeat(4096) });
  expect(big.status()).toBe(413);
  expect((await request.get("/api/search-miss")).status()).toBe(405);
});
