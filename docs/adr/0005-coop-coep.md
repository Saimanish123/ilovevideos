# ADR-0005: Cross-origin isolation on all pages (COOP same-origin, COEP credentialless)

**Status:** Accepted · **Date:** 2026-09-02

## Context
Multithreaded ffmpeg.wasm needs SharedArrayBuffer, which needs cross-origin isolation. Isolation blocks third-party resources without CORP/CORS (ads, embeds, many analytics). No market leader isolates their SEO pages because they monetise with ads and convert server-side (see research §5).

## Decision
Set COOP `same-origin` and COEP `credentialless` sitewide. We have no ads and no third-party scripts (ADR-0006), analytics is first-party proxied, fonts are self-hosted, so isolation costs nothing. `credentialless` (rather than `require-corp`) lets cross-origin images/media load without credentials, reducing breakage.

## Consequences
Any future third-party script must send CORP or be proxied. If isolation ever needs to be dropped, the escape hatch is the single-threaded ffmpeg core (slower) — WebCodecs paths are unaffected either way. Safari support for `credentialless` must be verified at implementation time; fall back to `require-corp` with CORP on our own assets if needed.
