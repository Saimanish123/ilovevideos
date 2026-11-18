/**
 * Lighthouse CI budgets (README.md#design-principles §5 and README.md#architecture §6): the home page,
 * a hub and three tool pages, mobile emulation with Lighthouse's default simulated throttling.
 * Run after `pnpm build`: `pnpm lhci`. Reports stay on disk (.lighthouseci/); nothing is uploaded.
 */
const port = process.env.LHCI_PORT ?? "3440";
const base = `http://localhost:${port}`;

/** Budgets every page shares (README.md#architecture §6). */
const shared = {
  "categories:performance": ["error", { minScore: 0.95 }],
  "categories:accessibility": ["error", { minScore: 1 }],
  "categories:best-practices": ["error", { minScore: 1 }],
  "categories:seo": ["error", { minScore: 1 }],
  "largest-contentful-paint": ["error", { maxNumericValue: 1800 }],
  "cumulative-layout-shift": ["error", { maxNumericValue: 0 }],
  "interaction-to-next-paint": "off",
  // Transfer sizes of the first load, before any file is chosen.
  "resource-summary:document:size": ["error", { maxNumericValue: 61440 }],
  "resource-summary:third-party:count": ["error", { maxNumericValue: 0 }],
};

module.exports = {
  ci: {
    collect: {
      startServerCommand: `pnpm start --port ${port}`,
      startServerReadyPattern: "Ready",
      url: ["/", "/tools/edit", "/compress-video", "/mov-to-mp4", "/trim-video"].map(
        (p) => `${base}${p}`,
      ),
      numberOfRuns: 3,
      // Applied (devtools) throttling with Lighthouse's own mobile slow-4G numbers and 4x CPU. The
      // default simulated mode counts every script fetched before the observed LCP as blocking it; on
      // localhost the scripts land first, so it reported LCP at time-to-interactive although the text
      // is in the HTML and paints at first paint (2026-09-30: observed LCP = FCP on every page).
      settings: {
        chromeFlags: "--no-sandbox --headless=new",
        throttlingMethod: "devtools",
        throttling: {
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1474.56,
          uploadThroughputKbps: 675,
          cpuSlowdownMultiplier: 4,
        },
      },
    },
    assert: {
      // Script budgets per page type (ADR-0107, restating ADR-0031): home and hubs 300 KiB, tool pages
      // 350 KiB gz. The speed assertions in `shared` are unchanged, so the room is spent only while the
      // pages stay fast; heavy parts still load on use (ADR-0030).
      assertMatrix: [
        {
          matchingUrlPattern: "^http://[^/]+/(tools/[^/]+)?$",
          assertions: {
            ...shared,
            "resource-summary:script:size": ["error", { maxNumericValue: 307200 }],
          },
        },
        {
          matchingUrlPattern: "^http://[^/]+/(?!tools/)[^/]+$",
          assertions: {
            ...shared,
            "resource-summary:script:size": ["error", { maxNumericValue: 358400 }],
          },
        },
      ],
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
