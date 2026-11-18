import { defineConfig, devices } from "@playwright/test";

/**
 * Port for the app under test. Override with E2E_PORT when 3000 is taken by something else: a reused
 * server that is not this app turns every new page into a 404 (seen 2026-09-30 with another project's
 * Next server on 3000).
 */
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  webServer: {
    // ENABLE_DEV_ROUTES: /dev/ui renders in the test build for the visual baseline (site.spec, visual.spec).
    command: `ENABLE_DEV_ROUTES=1 pnpm build && pnpm start --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
});
