/**
 * Whether `/dev/*` routes render. They are for review only: on under `next dev`, and in a production
 * build only when it was made with ENABLE_DEV_ROUTES=1 (Playwright's visual baseline). Evaluated at
 * build time for static pages, so a normal production build ships a 404 for every dev route.
 */
export function devRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_ROUTES === "1";
}
