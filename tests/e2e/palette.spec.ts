import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Command palette (feature catalog L4): ⌘K or Ctrl+K anywhere, or the header's search button. It
 * searches every registry tool on the device; nothing loads for it before it opens, and the query
 * is never part of a request.
 */
const shots = process.env.PLATFORM_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(shots, `${name}-${w}.png`) });
}

const palette = (page: Page) => page.getByRole("dialog", { name: "Search tools" });
const input = (page: Page) => palette(page).getByRole("combobox", { name: "Search tools" });

test("keyboard: ⌘K opens, arrows move, Enter opens the tool, Escape closes and restores focus", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "no hardware keyboard on the phone profiles");
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/trim-video");
  await page.waitForLoadState("networkidle");
  // Nothing for the palette loads with the page.
  expect(requests.filter((u) => u.includes("tool-index"))).toEqual([]);

  // Focus somewhere on the page first, so the restore target is known.
  const allTools = page.getByRole("banner").getByRole("link", { name: "All tools" });
  await allTools.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  // The unfiltered list is every tool outside a generated family.
  await expect(palette(page).getByRole("option").first()).toHaveText(/Compress video/);

  await page.keyboard.type("mov mp4");
  const options = palette(page).getByRole("option");
  await expect(options.first()).toContainText("Convert MOV to MP4");
  await expect(options.first()).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("ArrowUp");
  await expect(options.first()).toHaveAttribute("data-highlighted", "");
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`),
  ).toEqual([]);
  await shot(page, "palette-results");

  // Tab stays inside the dialog (focus is trapped).
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => palette(page).evaluate((d) => d.contains(document.activeElement)))
      .toBe(true);
  }

  // Escape closes and puts focus back where it was.
  await page.keyboard.press("Escape");
  await expect(palette(page)).toHaveCount(0);
  await expect(allTools).toBeFocused();

  // Reopen, search, Enter goes to the highlighted tool.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(input(page)).toHaveValue("");
  await page.keyboard.type("shrink");
  await expect(palette(page).getByRole("option").first()).toContainText("Compress video");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/compress-video$/);
  await expect(palette(page)).toHaveCount(0);

  // The query never travelled: no request carries it, and only the static index was fetched.
  expect(requests.filter((u) => /shrink|mov(%20|\+| )mp4/i.test(u))).toEqual([]);
  expect(requests.filter((u) => u.includes("tool-index"))).toHaveLength(1);
});

test("click: the header button opens it, a tap on a result navigates", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("banner").getByRole("button", { name: "Search tools" });
  const box = await trigger.boundingBox();
  expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await trigger.click();
  await expect(input(page)).toBeFocused();
  await input(page).fill("zzqx");
  await expect(palette(page).getByText(/No tool matches “zzqx”/)).toBeVisible();
  await shot(page, "palette-empty");
  await input(page).fill("mute");
  const first = palette(page).getByRole("option").first();
  await expect(first).toContainText("Remove audio from video");
  const optionBox = await first.boundingBox();
  expect(optionBox?.height).toBeGreaterThanOrEqual(44);
  await shot(page, "palette-mute");
  await first.click();
  await expect(page).toHaveURL(/\/remove-audio-from-video$/);
  await expect(palette(page)).toHaveCount(0);
});

test("closing with the mouse returns focus to the search button", async ({ page, isMobile }) => {
  test.skip(isMobile, "focus return is checked with a keyboard");
  await page.goto("/compress-video");
  const trigger = page.getByRole("banner").getByRole("button", { name: "Search tools" });
  await trigger.click();
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
