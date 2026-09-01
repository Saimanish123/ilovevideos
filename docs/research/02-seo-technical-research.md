# Technical SEO Research (verified 2026-09-02)

Condensed from a live-fetch research pass against developers.google.com, web.dev, Chrome developer docs, OpenAI/Anthropic crawler docs, and direct crawls of iLovePDF, CloudConvert, FreeConvert, Convertio, ezgif and 123apps (robots.txt, sitemaps, rendered HTML, response headers). Items marked *(unverified)* are third-party claims.

## 1. Google policy: scale is not the violation

- **Scaled content abuse** (spam-policies, updated 2026-08-28): "many pages generated for the primary purpose of manipulating search rankings and not helping users." Named examples include automated *translating* "where little value is provided." A working tool on the page is, by construction, helping the user.
- **Doorway abuse**: "generating pages to funnel visitors into the actual usable or relevant portion of a site" and "substantially similar pages that are closer to search results than a clearly defined, browseable hierarchy."
  - **Funnel test**: the tool must run *on* the landing URL. `/mov-to-mp4` is the converter, not a page with a button to `/app`.
  - **Hierarchy test**: pages must sit in a browseable taxonomy (home → category hub → format hub → tool), with breadcrumbs.
- Helpful-content is folded into core ranking (no separate penalty/recovery cycle). Google ran spam updates in Mar, Jun and Aug 2026; assume one within 90 days of launch.
- Google's helpful-content guidance flags "extensive automation across many subjects." A video-tool site is *one* subject. Do not add off-topic converters (FreeConvert has 3,812 unit/time pages; do not copy that).

## 2. Measured competitor scale

| Site | Sitemap URLs | Unique pages | Locales | Notes |
|---|---|---|---|---|
| iLovePDF | 1,415 | ~53/locale | 25 | Localised slugs (`/es/comprimir_pdf`), **no hreflang at all**; 1,415 useless `changefreq: daily` |
| ezgif | 350 | 350 | 1 | Honest, varied `lastmod` |
| CloudConvert | no sitemap (404) | hundreds | 1 | `/mov-to-mp4` is 192 words; hub `/mp4-converter` links 43 pair pages both directions |
| FreeConvert | 100,986 | 6,752 | 15 | 2,188 pair pages = ~7% of N², ~20% of N×M; median source fans to ~19 targets. 15 hreflang alternates per URL, 20k URLs/shard because the **50 MB** limit binds before 50k URLs |
| Convertio | 84 shards | — | many | Sitemap index broken (child returns 404) |

- FreeConvert `mov-to-mp4` vs `avi-to-mp4`: **91.4% identical** text; the unique 8.6% is real format-specific prose. That is the bar, not "1,000 unique words."
- **Composition pattern**: author content once per *format* (O(N)), compose per *pair* (O(N²)). 30 format profiles → 360 non-duplicate pair pages.
- **Bounded matrix**: never N×N. Demand-weighted target list per media class.

## 3. Structured data in 2026

| Type | Status | Action |
|---|---|---|
| **FAQPage** | Rich result stopped 2026-05-07; docs removed 2026-08-31 | Keep FAQ as visible HTML. Markup is harmless but useless. **Do not build for it.** |
| **HowTo** | Removed Sept 2023 | Never emit |
| **SoftwareApplication** | Live; requires `offers` (price 0) **and** `aggregateRating` or `review` | Fake ratings across 500 pages = manual-action risk. **Omit until real user ratings exist.** |
| **BreadcrumbList** | Live | Emit on every page; also satisfies the hierarchy test |
| **Organization** | Live | Once, sitewide |
| **WebSite + SearchAction** (sitelinks searchbox) | Retired 2024-11-21 | Plain `WebSite` node is fine; no `SearchAction` |
| **VideoObject** | Live | Only where a video is actually watchable on the page |
| **Product** | E-commerce only | Never for a free tool |
| **llms.txt** | Google: "not needed… won't affect visibility" (2026-06-15) | Skip |

Google's AI-optimization guide (2026-07-10): "Structured data isn't required for generative AI search… no special schema.org markup." What matters: text in the HTML, crawlable, internal links, page experience. `nosnippet`/`max-snippet` gate AI Overviews inclusion; `Google-Extended` blocks only Gemini training and has no Search/AI Overview effect.

## 4. i18n

- Three hreflang methods are "equivalent from Google's perspective." Reciprocity is mandatory: "if two pages don't both point to each other, the tags will be ignored." Use `GB` not `UK`. Never auto-redirect by IP.
- Subdirectories (`/es/`) recommended for language targeting.
- **Launch English only.** 500 tools × 20 MT locales = 9,500 machine-translated pages vs 500 authored: the spam-policy "translating" bullet verbatim. Add 5–8 locales in Phase 2 by translating the O(N) format profiles properly.
- Put hreflang in the **sitemap**, not `<head>` (saves ~2 KB above the LCP on every page); shard ≤ 15k URLs; gzip; CI-test reciprocity and that every index child returns 200.

## 5. Core Web Vitals

- Thresholds unchanged: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75. No new CWV.
- **Soft navigations** shipped unflagged in Chrome 151 (2026-07-28); SPA route changes are becoming measurable in CrUX. Our tool pages are separate static documents, so this does not bite us.
- Page experience: "Core Web Vitals are used by our ranking systems" but "there is no single signal." Weak, real, non-decisive.
- **Not one market leader ships client-side WASM on SEO landing pages** (FreeConvert, CloudConvert, ezgif, iLovePDF all convert server-side; none set full cross-origin isolation). Reasons: ffmpeg.wasm core is ~31 MB, and COOP/COEP `require-corp` breaks ad networks, third-party embeds and non-CORP analytics.
- Our position (ADR-0005/0006): we have no ads and no third-party scripts, so isolation costs us nothing; WebCodecs needs no SharedArrayBuffer at all; ffmpeg core loads only after a user gesture, in a worker. Escape hatch if isolation ever hurts: drop COOP/COEP and use the single-threaded ffmpeg core.
- Do not use `isInputPending()` (Google: "we no longer recommend using this API"). Use `scheduler.yield()` with fallback. All encoding in workers with transferable buffers.
- LCP element should be the server-rendered H1 + drop zone (block-level text, no image). Fixed drop-zone dimensions for CLS.

## 6. Sitemaps, robots, crawl

- 50 MB uncompressed or 50k URLs per file; with hreflang the byte limit binds first (~1.6 KB/URL). Shard **by locale** so Search Console shows per-locale indexation.
- `lastmod` is used only "if consistently and verifiably accurate." Emit real content-change dates; never deploy-stamp. **Google ignores `changefreq` and `priority`.**
- Crawl budget is not a concern below ~10k slow-changing URLs. Block parameter URLs in robots.txt (`Disallow: /*?*`), not with `noindex`.
- IndexNow: Bing/Yandex only; Google does not support it. Google Indexing API is JobPosting/BroadcastEvent only.
- Crawlers: training vs retrieval. `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` are retrieval (blocking removes us from AI answers; for a *task* site, AI answers hand users a link to a working tool, pure upside). `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended` are training-only; blocking is free. All six competitors block nothing.
- Self-referential canonical everywhere; cross-canonical only true aliases (`mpg`/`mpeg`); locale pages canonicalise to themselves.

## 7. Prioritised checklist (adopted into `07-seo-strategy.md`)

P0: tool runs on landing URL · format-profile library before pair pages · bounded matrix · pair-specific remux-vs-transcode angle · English only · no fabricated ratings.
P1: BreadcrumbList + visible breadcrumbs · hub-and-spoke (category → format hub → tool, both directions) · varied related modules · self canonical · robots as above · locale-sharded gzipped sitemaps with CI 200-check · honest `lastmod` · LCP = H1 + drop zone · Organization JSON-LD + real about/privacy pages.
P2: FAQ as visible HTML · per-pair comparison table · conditional `SoftwareApplication` once ratings exist · CrUX field monitoring · 5–8 locales via translated format profiles · IndexNow for Bing · per-sitemap indexation monitoring.
Never: HowTo · SearchAction · Product · `isInputPending` · `changefreq`/`priority` · IP redirects · cross-locale canonicals · parameter URLs · deploy-stamped lastmod · fake ratings · off-topic page farms · relying on llms.txt.
