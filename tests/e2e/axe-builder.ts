import { AxeBuilder as Base } from "@axe-core/playwright";

/**
 * AxeBuilder that checks the page at rest. Entrances, reveals and state arrivals fade in (ADR-0157);
 * axe measures contrast at the instant it runs, so text caught mid-fade would read as low contrast
 * although the page a person reads is fine. Before analysing, wait for every finite CSS animation and
 * transition on the page to end (infinite ones, such as a spinner, are skipped), at most 2 s.
 */
export default class AxeBuilder extends Base {
  override async analyze() {
    const page = (this as unknown as { page: import("@playwright/test").Page }).page;
    await page
      .evaluate(async () => {
        // A scroll just before (scrollIntoViewIfNeeded) reveals rows from an IntersectionObserver,
        // whose callback runs at the next rendering step: let two frames pass so those fades exist.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Promise.race([
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
              .map((a) => a.finished.catch(() => undefined)),
          ),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      })
      .catch(() => undefined);
    return super.analyze();
  }
}
