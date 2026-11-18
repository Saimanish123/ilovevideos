import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { canonicalPath } from "@/lib/canonical-path";
import { routing } from "@/lib/i18n/routing";

const intl = createMiddleware(routing);

/**
 * Proxy (Next 16's name for middleware; `middleware.ts` is deprecated). It runs before every page:
 * locale routing through next-intl, and the lowercase redirect below. It deliberately does not set a
 * CSP nonce: nonces force every page to render per request, and these pages are static. The CSP is a
 * static header (next.config.ts) plus per-page script hashes written at build (scripts/csp-hashes.mjs).
 *
 * One address per page. An uppercase path (/Trim-Video), a trailing slash (/tools/edit/) or whitespace
 * pasted around a segment (/trim-video%20) is redirected once, with a 308, to the canonical form
 * instead of rendering a duplicate page (SEO audit 2026-09-30; QA 2026-10-08). Next's own
 * trailing-slash redirect is off (next.config.ts) so all of these take a single hop.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const target = canonicalPath(pathname);
  if (target !== pathname) {
    // A plain URL, not a clone of nextUrl: NextURL re-adds the trailing slash it was parsed with.
    const url = new URL(`${target}${request.nextUrl.search}`, request.url);
    return NextResponse.redirect(url, 308);
  }
  return intl(request);
}

export const config = {
  // Skip static files, API routes, wasm assets
  matcher: ["/((?!api|_next|_vercel|wasm|.*\\..*).*)"],
};
