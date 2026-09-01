# ilovevideos — Vision

> Every video utility a person could need, one page each, free, no account, and the file never has to leave their device.

## What we are building

A web product structured like iLovePDF, for video. Each operation (compress, convert MOV to MP4, trim, make a GIF, extract audio, add subtitles…) is its own page with its own URL, its own search intent, its own copy, and a single-purpose workspace. Hundreds of such pages, generated from one tool registry, backed by a small number of shared processing engines.

## Why it can win

Existing tools (Clideo, Kapwing, VEED, 123apps, FreeConvert, Online-Convert…) share the same weaknesses:

1. **Upload-first architecture.** Everything is uploaded to their servers, which means slow round-trips, file size caps, queueing, and a real privacy problem for personal video.
2. **Freemium friction.** Watermarks, sign-up walls, per-day limits, "upgrade to remove".
3. **Generic, ad-heavy UX.** Cluttered pages, cookie banners, low-quality prose written for crawlers.
4. **Programmatic-page sprawl without substance.** Thousands of "X to Y" pages with identical text.

We invert each:

1. **Device-first processing.** WebCodecs + WebAssembly in the browser. Hardware-accelerated where the browser allows. Files stay local. A server path exists only as an explicit, opt-in fallback for cases the browser truly cannot handle, with auto-deletion and no logging of content.
2. **Free, no account, no watermark, no daily cap.** Monetisation, if any, is a Pro tier for batch/server-heavy work and a self-hostable/API offering later. Never at the expense of the free experience.
3. **Premium, monochrome, Apple-grade UI.** See `05-design-principles.md`. The product should feel like a native utility, not a website.
4. **Real content on every page.** Each tool page teaches something true and specific. Pages that cannot justify unique content do not ship.

## Who it is for

- Someone with a phone video that is too big for WhatsApp, Discord, or email.
- A creator resizing one clip for TikTok, Reels, and YouTube Shorts.
- An office worker who needs an MP4 from a MOV, a GIF from a screen recording, an MP3 from a lecture video.
- A developer or editor who knows ffmpeg exists and does not want to open a terminal.
- Anyone who does not want to upload a personal video to a stranger's server.

## Non-goals

- Not a full video editor (timeline, multi-track). Single-purpose tools only. Composability comes from chaining tools, not from a timeline.
- Not a social/creator platform. No accounts, no cloud storage, no sharing features.
- Not an AI-video generator. AI is used narrowly where it is a utility (speech-to-text for captions, silence detection), and runs on-device where possible.

## Course corrections to the original brief

These are deliberate adjustments to the initial idea, recorded so we do not relitigate them.

1. **Naming and trademark risk.** iLovePDF (ilovepdf.com, iloveimg.com) is a registered brand owned by iLovePDF S.L. "ilovevideos" is a deliberate echo of that brand and a name in that pattern (iLoveVideo, ilovevideos, etc.) may be contested or already registered. We proceed with `ilovevideos` as a working codename, but the product must be name-agnostic in code (single `SITE_NAME` constant, no hardcoded brand strings), and a decision on the final name and domain is a launch blocker. See `docs/research/01-competitive-research.md` for what exists today.
2. **"Hundreds of features" is a page-count goal, not an engine-count goal.** Roughly 40–50 distinct processing engines, parameterised (format pairs, platform presets, target sizes), generate 300–600 well-differentiated pages. Building 300 separate features would take years; building 45 engines and a registry takes months. The user-visible result is the same, and pages stay maintainable.
3. **"Complete privacy" needs a precise definition.** We promise: on-device processing for every tool where it is technically possible; no upload without explicit consent; no cookies requiring consent; cookieless analytics only; no content logging on the server path; auto-deletion within one hour on the server path. We do not promise "100% client-side for everything" because 4K HEVC on a mid-range phone is not realistic in a browser today. Honesty is the differentiator.
4. **SEO requires static HTML, real content and patience.** Client-rendered SPAs do not rank. Every tool page is pre-rendered at build time with full prose, structured data and internal links. Ranking for "compress video online" against incumbents with a decade of backlinks takes 6–18 months; we win long-tail first (platform/size-specific pages, format pairs, "for Discord", "under 8 MB"), then head terms.
5. **Internationalisation is designed in from day one, shipped later.** iLovePDF's traffic is majority non-English. The routing (`/[locale]/[tool]`), the content model and the registry are locale-aware from the first commit, even though only English ships at launch.
6. **Monochrome with one exception.** Strict grayscale chrome. Destructive-action hover and the focus ring are the only permitted colour. User content supplies all other colour.
7. **No ads at launch.** Ads conflict with the security headers needed for multi-threaded WebAssembly, with privacy claims, and with the premium feel. Revenue, when needed, comes from a Pro tier (batch, server processing, larger files, API). Decision recorded in ADR-0006.

## Success criteria (12 months)

- 400+ indexed tool pages, each with unique content and passing Core Web Vitals.
- Top-10 rankings for 100+ long-tail queries; top-3 for 20+.
- 95% of processing sessions complete fully on-device.
- Lighthouse 95+/100/100/100 on every page.
- Zero cookie banners, zero accounts, zero watermarks.
