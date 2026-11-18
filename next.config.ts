import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

/**
 * COOP/COEP are required for SharedArrayBuffer, which the multithreaded
 * ffmpeg.wasm core needs. They also block any cross-origin resource that does
 * not send CORP/CORS headers (third-party ads, embeds). This is a deliberate
 * trade-off recorded in DECISIONS.md (ADR-0005).
 */
const isolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // require-corp, not credentialless: Safari does not support credentialless, so it was never isolated
  // and ffmpeg.wasm could not run there (QA 2026-10-08). Everything the site loads is same-origin,
  // which require-corp allows without a CORP header (ADR-0005, amended).
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

/**
 * Content Security Policy, sent on every response (ADR text: "CSP from a static header plus
 * build-time script hashes"). Pages are static, so a per-request nonce is impossible without making
 * every page dynamic. Instead this header allows inline script for the fallback case, and
 * scripts/csp-hashes.mjs writes a second, stricter policy into each prerendered page as a
 * <meta http-equiv> with the SHA-256 of every inline script on that page and no 'unsafe-inline'.
 * Both policies apply, so on a built page only same-origin files and those exact inline scripts run.
 * JSON-LD is a data block, not a script, and needs neither.
 *
 * connect-src 'self' is the privacy promise in policy form: the page cannot send anything to another
 * origin. blob:/data: are local. 'wasm-unsafe-eval' lets WebAssembly (ffmpeg.wasm) compile; it does
 * not allow eval(). Development adds 'unsafe-eval' (React's dev stack traces) and websockets (HMR).
 */
const isDev = process.env.NODE_ENV === "development";
const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'wasm-unsafe-eval'", "blob:", ...(isDev ? ["'unsafe-eval'"] : [])],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "blob:", "data:"],
  "media-src": ["'self'", "blob:", "data:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", "blob:", "data:", ...(isDev ? ["ws:"] : [])],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "frame-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};
const cspHeader = Object.entries(cspDirectives)
  .map(([k, v]) => `${k} ${(k === "script-src" ? [...v, "'unsafe-inline'"] : v).join(" ")}`)
  .join("; ");

/**
 * A production deploy must know its own origin: canonicals, the sitemap, robots and JSON-LD are built
 * from it, and a missing value would ship http://localhost:3000 canonicals (ADR text: "site URL").
 * Vercel production deploys set VERCEL_ENV=production; other hosts set REQUIRE_SITE_URL=1.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const productionDeploy =
  process.env.VERCEL_ENV === "production" || process.env.REQUIRE_SITE_URL === "1";
if (productionDeploy && (!siteUrl || /localhost|127\.0\.0\.1/.test(siteUrl))) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL must be set to the public origin (https://…) for a production deploy. See README.md#getting-started.",
  );
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // Parallel builds (several agents or E2E runs at once) must not share one output directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  typedRoutes: true,
  // A URL no route matches gets app/global-not-found.tsx: the root layout is a pass-through and
  // <html> lives in the [locale] layout, so the default 404 had no document, no lang and no styles.
  experimental: { globalNotFound: true },
  // src/proxy.ts normalises case, a trailing slash and stray whitespace in one 308 (Next's own
  // trailing-slash redirect ran first and made /TOOLS/EDIT/ two hops).
  skipTrailingSlashRedirect: true,
  // Browser bundles get zod with its eval-based JIT off, so the strict CSP reports nothing (zod-browser.ts).
  turbopack: { resolveAlias: { zod: { browser: "./src/lib/zod-browser.ts" } } },
  async headers() {
    return [
      { source: "/(.*)", headers: [...securityHeaders, ...isolationHeaders] },
      {
        // Long-lived caching for immutable WASM/model assets
        source: "/wasm/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
