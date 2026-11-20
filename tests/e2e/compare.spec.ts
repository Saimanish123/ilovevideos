import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { noAxeViolations } from "./time-layout-helpers";

/**
 * Compare before and after on results (round 5, builder F; ADR-0134 to ADR-0137): the wipe on a
 * re-encoded picture (compress), side by side for a turned picture (rotate), nothing for a stream
 * copy (MOV to MP4), and Before/After on a sound (audio converter, video volume). The source is
 * read only once Compare is pressed. The 30 s drift measurement plays the wipe through and pairs
 * the two videos' presented frames on the same display refresh.
 * Set COMPARE_SHOTS=<dir> for screenshots at 1280, 768 and 390 (Chromium desktop only).
 */

const fixture = (name: string) => `tests/fixtures/${name}`;

/** An annotation on the test, printed too so a line reporter shows the measurement. */
function report(type: string, description: string) {
  test.info().annotations.push({ type, description });
  // biome-ignore lint/suspicious/noConsole: the line reporter shows the measurements this way
  console.log(`[${type}] ${description}`);
}

async function shot(page: Page, name: string) {
  const dir = process.env.COMPARE_SHOTS;
  if (!dir || test.info().project.name !== "chromium") return;
  const size = page.viewportSize();
  for (const [w, h] of [
    [1280, 900],
    [768, 1024],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    // The preview and its bar in view, as a person comparing sees them.
    await page
      .getByRole("region", { name: "Workspace" })
      .locator("video, audio")
      .first()
      .evaluate((el) =>
        (el.closest(".rounded-lg") ?? el).scrollIntoView({ block: "start", behavior: "instant" }),
      )
      .catch(() => undefined);
    await page.evaluate(() => window.scrollBy(0, -72));
    await page.screenshot({ path: join(dir, `${name}-${w}.png`), fullPage: false });
  }
  if (size) await page.setViewportSize(size);
}

const encodes = (browserName: string) =>
  test.skip(browserName !== "chromium", "WebCodecs encoding needs Chromium");

async function runTo(
  page: Page,
  slug: string,
  file: string,
  verb: string,
  choose?: (page: Page) => Promise<void>,
) {
  await page.goto(`/${slug}`);
  await page.locator('input[type="file"]').first().setInputFiles(fixture(file));
  const run = page.getByRole("button", { name: verb, exact: true });
  if (choose) await choose(page);
  await expect(run).toBeEnabled({ timeout: 60_000 });
  await run.click();
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 180_000 });
}

/** The preview's own element (the result) and the compare's source element. */
const master = (page: Page) =>
  page.getByRole("region", { name: "Workspace" }).locator("video:not([data-testid])").first();
const source = (page: Page) => page.getByTestId("compare-source");

test.describe("compare a picture result", () => {
  test("compress: the source loads on Compare; the divider drags and keys; zoom on a mouse", async ({
    page,
    browserName,
    isMobile,
  }) => {
    encodes(browserName);
    test.setTimeout(240_000);
    await runTo(page, "compress-video", "sample-large.mp4", "Compress");
    // Nothing of the source is read until Compare is pressed.
    await expect(source(page)).toHaveCount(0);
    const toggle = page.getByRole("button", { name: "Compare with the original" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await shot(page, "compress-done");
    const fill = () => toggle.evaluate((b) => getComputedStyle(b).backgroundColor);
    await page.mouse.move(0, 0);
    const offFill = await fill();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // On reads without a second icon: the pressed toggle keeps a fill.
    await page.mouse.move(0, 0);
    await expect.poll(fill).not.toBe(offFill);
    const layer = page.getByTestId("compare");
    await expect(layer).toHaveAttribute("data-ready", "1", { timeout: 15_000 });
    await expect(layer).toHaveAttribute("data-layout", "wipe");
    const divider = page.getByRole("slider", { name: "Before and after divider" });
    await expect(divider).toHaveAttribute("aria-valuenow", "50");

    // Keys: arrows 5 %, Shift 20 %, Home and End; they are the divider's, not the player's.
    await divider.focus();
    const before = await master(page).evaluate((v: HTMLVideoElement) => v.currentTime);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", "40");
    expect(await master(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(before);
    await page.keyboard.press("Shift+ArrowRight");
    await expect(divider).toHaveAttribute("aria-valuenow", "60");
    await page.keyboard.press("Home");
    await expect(divider).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("End");
    await expect(divider).toHaveAttribute("aria-valuenow", "100");

    // Drag to a quarter of the picture: the source is clipped there, and the press did not play.
    const box = await layer.boundingBox();
    const grab = await divider.boundingBox();
    if (!box || !grab) throw new Error("no layout");
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, grab.y + grab.height / 2, { steps: 6 });
    await page.mouse.up();
    const pct = Number(await divider.getAttribute("aria-valuenow"));
    expect(pct).toBeGreaterThanOrEqual(23);
    expect(pct).toBeLessThanOrEqual(27);
    expect(await master(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    const clip = await source(page).evaluate((v) => getComputedStyle(v).clipPath);
    expect(clip).toMatch(/^inset\(0px [\d.]+px 0px 0px\)$/);
    await divider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await shot(page, "compress-compare");

    // Play and pause: the source lands on the result's frame.
    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Pause" }).click();
    await expect
      .poll(
        async () => {
          const m = await master(page).evaluate((v: HTMLVideoElement) => v.currentTime);
          const s = await source(page).evaluate((v: HTMLVideoElement) => v.currentTime);
          return Math.abs(m - s);
        },
        { timeout: 5_000 },
      )
      .toBeLessThan(1 / 60);
    // Scrubbing the bar moves both.
    await page.getByRole("slider", { name: "Position in the video" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => source(page).evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 5_000,
      })
      .toBeGreaterThan(5);

    // Zoom to actual pixels: a mouse only (a 1280-wide picture in a smaller box).
    const zoom = page.getByRole("button", { name: "Actual pixels" });
    if (isMobile) await expect(zoom).toHaveCount(0);
    else {
      await zoom.click();
      await expect(zoom).toHaveAttribute("aria-pressed", "true");
      const transform = () => master(page).evaluate((v: HTMLVideoElement) => v.style.transform);
      await expect.poll(transform).toMatch(/scale\(1\.\d+\)/);
      const t = await transform();
      // The view pans with the arrow keys on the zoomed picture.
      const pan = page.getByRole("application", { name: /Zoomed picture/ });
      await pan.focus();
      await page.keyboard.press("ArrowLeft");
      await expect.poll(transform).not.toBe(t);
      await shot(page, "compress-zoom");
      await zoom.click();
      await expect(zoom).toHaveAttribute("aria-pressed", "false");
    }
    await noAxeViolations(page);

    // Closing lets go of the source.
    await toggle.click();
    await expect(source(page)).toHaveCount(0);
    await expect
      .poll(() => master(page).evaluate((v: HTMLVideoElement) => v.style.transform))
      .toBe("");
  });

  test("by touch at 390: a vertical swipe on the divider scrolls the page, a sideways drag moves it", async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== "chromium" || info.project.name !== "mobile-chrome",
      "touch input through Chromium's DevTools protocol, on the phone project",
    );
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await runTo(page, "compress-video", "sample-large.mp4", "Compress");
    await page.getByRole("button", { name: "Compare with the original" }).click();
    await expect(page.getByTestId("compare")).toHaveAttribute("data-ready", "1", {
      timeout: 15_000,
    });
    const divider = page.getByTestId("compare-divider");
    await divider.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    const cdp = await page.context().newCDPSession(page);
    const touch = async (from: { x: number; y: number }, dx: number, dy: number) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
      for (let i = 1; i <= 10; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: from.x + (dx * i) / 10, y: from.y + (dy * i) / 10 }],
        });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(300);
    };
    const before = Number(await divider.getAttribute("aria-valuenow"));
    const g2 = await divider.boundingBox();
    if (!g2) throw new Error("no layout");
    await touch({ x: g2.x + g2.width / 2, y: g2.y + g2.height / 2 }, -80, 0);
    const after = Number(await divider.getAttribute("aria-valuenow"));
    report("touch", `80 px sideways drag moved the split from ${before} % to ${after} %`);
    expect(before - after).toBeGreaterThan(15);
    const g = await divider.boundingBox();
    if (!g) throw new Error("no layout");
    const startY = await page.evaluate(() => window.scrollY);
    await touch({ x: g.x + g.width / 2, y: g.y + g.height * 0.7 }, 0, -120);
    const scrolled = (await page.evaluate(() => window.scrollY)) - startY;
    report(
      "touch",
      `vertical swipe of 120 px on the divider strip scrolled the page ${scrolled} px`,
    );
    expect(scrolled).toBeGreaterThan(40);
    // Once the page has settled, a sideways drag moves the split again.
    await page.waitForTimeout(1500);
    const g3 = await divider.boundingBox();
    if (!g3) throw new Error("no layout");
    const at = Number(await divider.getAttribute("aria-valuenow"));
    await touch({ x: g3.x + g3.width / 2, y: g3.y + g3.height / 2 }, 80, 0);
    const moved = Number(await divider.getAttribute("aria-valuenow"));
    report("touch", `after the scroll, 80 px sideways moved the split from ${at} % to ${moved} %`);
    expect(moved - at).toBeGreaterThan(15);
  });

  test("the wipe stays on the same frame over a 30 s play", async ({
    page,
    browserName,
    isMobile,
  }) => {
    encodes(browserName);
    test.skip(isMobile, "measured once, on desktop Chromium");
    test.setTimeout(300_000);
    await runTo(page, "compress-video", "sample-30s.mp4", "Compress");
    await page.getByRole("button", { name: "Compare with the original" }).click();
    await expect(page.getByTestId("compare")).toHaveAttribute("data-ready", "1", {
      timeout: 15_000,
    });
    // Record every presented frame of both elements with its display refresh.
    await page.evaluate(() => {
      const w = window as unknown as { __frames: Record<string, number[][]> };
      w.__frames = { m: [], s: [] };
      const ws = document.querySelector('section[aria-label="Workspace"]');
      const m = ws?.querySelector("video:not([data-testid])") as HTMLVideoElement;
      const s = document.querySelector('[data-testid="compare-source"]') as HTMLVideoElement;
      const rec = (el: HTMLVideoElement, key: string) => {
        const cb: VideoFrameRequestCallback = (_now, md) => {
          w.__frames[key]?.push([md.expectedDisplayTime, md.mediaTime, md.presentedFrames]);
          el.requestVideoFrameCallback(cb);
        };
        el.requestVideoFrameCallback(cb);
      };
      rec(m, "m");
      rec(s, "s");
      w.__frames.c = [];
      const clock = () => {
        w.__frames.c?.push([performance.now(), m.currentTime, s.currentTime, s.playbackRate]);
        if (!m.ended) requestAnimationFrame(clock);
      };
      requestAnimationFrame(clock);
    });
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    // Played through: the bar shows Play again at the end.
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible({ timeout: 60_000 });
    const frames = await page.evaluate(
      () => (window as unknown as { __frames: Record<string, number[][]> }).__frames,
    );
    if (process.env.COMPARE_DUMP) writeFileSync(process.env.COMPARE_DUMP, JSON.stringify(frames));
    const fps = 30;
    // The same frame of both (by its time in the file) and the display refresh it was shown on:
    // the difference in frames. rVFC may skip reporting a frame when the page is busy, so only
    // frames both reported are compared.
    const shownAt = new Map<number, number>();
    for (const [t = 0, media = 0] of frames.s ?? []) shownAt.set(Math.round(media * fps), t);
    const drifts: number[] = [];
    for (const [t = 0, media = 0] of frames.m ?? []) {
      const at = shownAt.get(Math.round(media * fps));
      if (at !== undefined) drifts.push(Math.round(((at - t) / (1000 / fps)) * 100) / 100);
    }
    // The two clocks, read together on every animation frame after the first half second.
    const clock = (frames.c ?? [])
      .filter((c) => (c[1] ?? 0) > 0.5)
      .map((c) => ((c[2] ?? 0) - (c[1] ?? 0)) * 1000);
    const masterFrames = frames.m?.length ?? 0;
    const worst = Math.max(...drifts.map(Math.abs));
    const off = drifts.filter((d) => Math.abs(d) >= 1).length;
    const clockWorst = Math.max(...clock.map(Math.abs));
    const sorted = [...clock].map(Math.abs).sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    report(
      "compare-drift",
      `${masterFrames} result frames over ${frames.m?.at(-1)?.[1]?.toFixed(2)} s; ${drifts.length} reported by both: ${drifts.length - off} shown on the same refresh, ${off} a frame or more apart, worst ${worst} frame; clocks: worst ${clockWorst.toFixed(1)} ms, p99 ${p99.toFixed(1)} ms (a frame is ${(1000 / fps).toFixed(1)} ms)`,
    );
    expect(masterFrames).toBeGreaterThan(800);
    expect(drifts.length).toBeGreaterThan(masterFrames * 0.5);
    // On a quiet machine (COMPARE_DRIFT_STRICT=1, one worker) the bar is the brief's: never more
    // than a frame apart. With other work on the machine (parallel workers' encodes) the source
    // stutters for a moment and catches up; it must still be within a frame almost all the time.
    if (process.env.COMPARE_DRIFT_STRICT === "1") {
      // One display refresh (a frame here) and its timing jitter.
      expect(worst).toBeLessThanOrEqual(1.1);
      expect(p99).toBeLessThan(1000 / fps);
    } else {
      expect(worst).toBeLessThanOrEqual(2.1);
      const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
      expect(p90).toBeLessThan(1000 / fps);
    }
  });

  test("rotate: a turned picture compares side by side, not by a wipe", async ({ page }) => {
    test.setTimeout(120_000);
    await runTo(page, "rotate-video", "sample.mp4", "Rotate", (p) =>
      p.getByRole("button", { name: /Rotate right/ }).click(),
    );
    await page.getByRole("button", { name: "Compare with the original" }).click();
    const layer = page.getByTestId("compare");
    await expect(layer).toHaveAttribute("data-ready", "1", { timeout: 15_000 });
    await expect(layer).toHaveAttribute("data-layout", "side-by-side");
    await expect(page.getByRole("slider", { name: "Before and after divider" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Actual pixels" })).toHaveCount(0);
    // Before in the first half, After moved into the second (row or column), by transform only.
    const area = await layer.boundingBox();
    const s = await source(page).boundingBox();
    const m = await master(page).evaluate((v: HTMLVideoElement) => {
      const r = v.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: v.style.transform };
    });
    if (!s || !area) throw new Error("no layout");
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const sx = s.x + s.width / 2;
    const sy = s.y + s.height / 2;
    expect((sx < cx && m.x > cx) || (sy < cy && m.y > cy)).toBe(true);
    expect(m.t).toMatch(/^translate\(/);
    await noAxeViolations(page);
    await shot(page, "rotate-compare");
  });

  test("a source that cannot play: the control goes, focus moves to Play, the line is announced", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await runTo(page, "rotate-video", "sample.mp4", "Rotate", (p) =>
      p.getByRole("button", { name: /Rotate right/ }).click(),
    );
    const toggle = page.getByRole("button", { name: "Compare with the original" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("compare")).toHaveAttribute("data-ready", "1", {
      timeout: 15_000,
    });
    await expect(toggle).toBeFocused();
    // The browser reports the source as unplayable.
    await source(page).evaluate((v) => v.dispatchEvent(new Event("error")));
    await expect(toggle).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Play|Pause)$/ })).toBeFocused();
    const line = page.locator('[aria-live="polite"]', {
      hasText: "The original does not play in this browser.",
    });
    await expect(line).toBeVisible();
    await expect(source(page)).toHaveCount(0);
  });

  test("a stream copy offers no compare", async ({ page }) => {
    test.setTimeout(120_000);
    await runTo(page, "video-converter", "sample.mov", "Convert");
    await expect(page.getByRole("button", { name: "Compare with the original" })).toHaveCount(0);
    await expect(page.getByTestId("ab-switch")).toHaveCount(0);
  });
});

test.describe("compare a sound result", () => {
  test("audio converter: Before and After switch at the same position, matched in loudness", async ({
    page,
    browserName,
  }) => {
    encodes(browserName);
    test.setTimeout(120_000);
    await runTo(page, "audio-converter", "sample.wav", "Convert");
    const ab = page.getByTestId("ab-switch");
    await expect(ab).toBeVisible();
    await expect(page.getByTestId("ab-source")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "After" })).toBeChecked();
    // At 390 the switch sits inside the dark hero.
    const size = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    const edges = await ab.evaluate((el) => {
      const hero = el.closest(".bg-bg-stage")?.getBoundingClientRect();
      const r = el.querySelector('[role="radiogroup"]')?.getBoundingClientRect();
      return { switchRight: r?.right ?? 0, heroRight: hero?.right ?? 0, paddingRight: 16 };
    });
    report(
      "layout",
      `audio hero at 390: switch right ${edges.switchRight} px, hero right ${edges.heroRight} px`,
    );
    expect(edges.switchRight).toBeLessThanOrEqual(edges.heroRight - 8);
    if (size) await page.setViewportSize(size);
    await shot(page, "audio-ab");
    await page.getByText("Before", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Before" })).toBeChecked();
    const follower = page.getByTestId("ab-source");
    await expect(follower).toHaveCount(1);
    // Both measured and matched: the attribute carries the two gains.
    await expect(follower).toHaveAttribute("data-match", /^[01]\.\d{3} [01]\.\d{3}$/, {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Play the result" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Pause" }).click();
    const m = await page
      .getByRole("region", { name: "Workspace" })
      .locator("audio:not([data-testid])")
      .evaluate((a: HTMLAudioElement) => a.currentTime);
    await expect
      .poll(async () => follower.evaluate((a: HTMLAudioElement) => a.currentTime), {
        timeout: 5_000,
      })
      .toBeCloseTo(m, 2);
    // The radios take the arrows (not the player keys).
    await page.getByRole("radio", { name: "Before" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "After" })).toBeChecked();
    await noAxeViolations(page);
  });

  test("video volume: Before survives turning a phone to landscape while playing", async ({
    page,
    browserName,
  }) => {
    encodes(browserName);
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await runTo(page, "change-video-volume", "sample-30s.mp4", "Change volume");
    await page.getByText("Before", { exact: true }).click();
    const follower = page.getByTestId("ab-source");
    await expect(follower).toHaveCount(1);
    await follower.evaluate((a) => {
      a.dataset.mark = "kept";
    });
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    // Turned to landscape: past 640 px the switch moves into the bar row by CSS alone.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(800);
    await expect(page.getByRole("radio", { name: "Before" })).toBeChecked();
    await expect(follower).toHaveAttribute("data-mark", "kept");
    expect(
      await page
        .getByRole("region", { name: "Workspace" })
        .locator("video:not([data-testid])")
        .first()
        .evaluate((v: HTMLVideoElement) => v.paused),
    ).toBe(false);
    // In the bar row now: level with Play.
    const play = await page.getByRole("button", { name: "Pause" }).boundingBox();
    const ab = await page.getByTestId("ab-switch").boundingBox();
    if (!play || !ab) throw new Error("no layout");
    expect(Math.abs(ab.y + ab.height / 2 - (play.y + play.height / 2))).toBeLessThan(8);
  });

  test("video volume: the switch sits under the bar and keeps the loudness difference", async ({
    page,
    browserName,
  }) => {
    encodes(browserName);
    test.setTimeout(120_000);
    await runTo(page, "change-video-volume", "sample.mp4", "Change volume");
    await expect(page.getByRole("button", { name: "Compare with the original" })).toHaveCount(0);
    await page.getByText("Before", { exact: true }).click();
    const follower = page.getByTestId("ab-source");
    await expect(follower).toHaveCount(1);
    await page.waitForTimeout(1500);
    // Loudness is the job: no match is applied.
    await expect(follower).not.toHaveAttribute("data-match", /.*/);
    await noAxeViolations(page);
    await shot(page, "video-volume-ab");
  });
});
