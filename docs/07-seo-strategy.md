# SEO Strategy

Goal: rank for the *task*, not the brand. "compress video online" → our compress page.

## 1. Information architecture

- **Depth ≤ 3**: home → category hub (`/tools/compress`) → format hub for converters (`/mp4-converter`, linking every `*-to-mp4` and `mp4-to-*`) → tool. Every tool also linked from footer and from ≥ 3 related tools. No orphan pages. Visible breadcrumbs + `BreadcrumbList` on every page: this is what satisfies Google's "clearly defined, browseable hierarchy" doorway test.
- **The tool runs on the landing URL.** `/mov-to-mp4` *is* the converter. Never a marketing page that sends users to `/app`. This is the single most important doorway-policy defence.
- **Format-profile library**: content about each format is authored once (`src/content/formats/`, ~30 profiles) and composed into pair pages together with a pair-specific paragraph. O(N) authoring, O(N²) non-duplicate pages. FreeConvert's pair pages are 91% identical and still rank; our unique share will be far higher.
- **Bounded pair matrix**: never N×N. ~30 sources × ~12 demand-weighted targets. FreeConvert ships only ~7% of its possible pairs.
- **URL**: `/<verb-object>` or `/<from>-to-<to>`. Lowercase, hyphens, no dates, no IDs, no trailing slash, no `/tools/` prefix on tool pages (shorter is better; hubs live at `/tools/<category>`).
- **Locale**: English at root; other locales at `/<locale>/…` with `hreflang` + `x-default`. Locale content is translated *and localised* (platform limits differ by region), never machine-translated boilerplate.
- **Canonical** on every page; format pairs that are aliases (e.g. `m4v-to-mp4` ≈ `mp4-to-mp4`) are either distinct pages with distinct content or 301s, never duplicates.

## 2. On-page template (every tool page)

| Element | Rule |
|---|---|
| `<title>` | `{metaTitle} · {site}`; ≤ 60 chars; task first: "Compress video online, free, no upload" |
| `<meta description>` | ≤ 155 chars; what + how + privacy + free |
| `<h1>` | Exactly one; `<Verb> <object>`; matches primary query intent |
| Above the fold | H1, one-sentence subtitle, the tool. No hero image, no marketing block. |
| Body | ≥ 350 words unique: What / How (ordered list) / Good to know / FAQ (`<dl>`) / Related |
| Headings | `<h2>` per section; question-form `<h2>` only inside FAQ if used as headings |
| JSON-LD | `BreadcrumbList` per page; `Organization` + `WebSite` sitewide. **Not** `FAQPage` (rich result retired 2026-05-07), **not** `HowTo` (retired 2023), **not** `SoftwareApplication` until we have real user ratings (it requires `aggregateRating`/`review`; fabricating one is a manual-action risk), **not** `SearchAction`. FAQ and steps are visible HTML (`<dl>`, `<ol>`), which is what Google and AI systems actually consume. |
| Images | Only real UI screenshots/OG image; `alt` describes the operation; AVIF/WebP |
| OG image | Generated per tool at build (monochrome, title, one glyph) |
| Internal links | Related tools (6), category hub, home, ≥ 1 contextual link inside "Good to know" to a sibling tool |

## 3. Avoiding the doorway-page trap

Google's guidance penalises pages "created to rank for specific queries that funnel users to the same destination" and near-duplicate templated pages. Our mitigations, all enforced mechanically:

1. Each page is a *different destination*: different preset options, different accepted inputs, different result.
2. `validate-registry` fails the build on any paragraph reused across pages and on < 350 body words.
3. Format-pair pages exist only where the pair has a real story (codec compatibility, platform behaviour, typical source device). Otherwise the generic converter handles it without a dedicated URL.
4. Platform pages carry dated, sourced limits (e.g. Discord upload caps by tier) and are revisited quarterly.
5. Editorial guides (`/guides/…`) add depth and earn links; they link into tools, not the reverse only.

## 4. Technical

- Static HTML for every page (no client-only content). Prose is in the HTML at build; the stage hydrates after.
- Core Web Vitals: see architecture budget. INP is protected by keeping all encoding in workers.
- `sitemap.xml` from the registry with `hreflang` alternates + `x-default` in the sitemap (not `<head>`); honest `lastmod` from `updatedAt`; **no `priority`/`changefreq`** (Google ignores them); shard by locale at ≤ 15k URLs (the 50 MB limit binds before 50k URLs once hreflang is included); gzip; CI asserts every index child returns 200 and every alternate is reciprocal.
- `robots.txt`: allow all, block `/api/`, `/dev/`, parameter URLs (`/*?*`); explicitly allow retrieval bots (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`); block training-only bots (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`), which has no effect on Google Search or AI Overviews.
- Search Console + Bing Webmaster from day one; IndexNow for Bing only (Google does not support it).
- Locale pages canonicalise to themselves. Cross-canonical only for true aliases (`mpg`/`mpeg`). Never IP-redirect between locales.
- Launch English only. Add locales only with properly translated format profiles (machine-translating 500 pages × 20 locales is the "translating" bullet of Google's scaled-content-abuse policy).
- 404s are real 404s (`dynamicParams = false`); no soft-404 tool pages.
- No interstitials, no cookie banner (we have no consent-requiring cookies), no layout shift from late-loading UI.

## 5. Query → page mapping (seed list)

| Query cluster | Page |
|---|---|
| compress video / reduce video size / video compressor | `/compress-video` |
| compress video for discord / under 8mb / 10mb / 25mb | `/compress-video-for-discord`, `/compress-video-under-10mb`… |
| compress video for whatsapp / email / telegram | `/compress-video-for-whatsapp`… |
| mov to mp4 / quicktime to mp4 / iphone video to mp4 | `/mov-to-mp4` |
| mkv to mp4, avi to mp4, webm to mp4, wmv to mp4, flv to mp4, m4v to mp4, 3gp to mp4, mts to mp4, ts to mp4, mpg to mp4, vob to mp4, hevc to h264 | one page each |
| mp4 to mp3 / video to mp3 / extract audio | `/mp4-to-mp3`, `/video-to-mp3`, `/extract-audio-from-video` |
| video to gif / mp4 to gif / mov to gif / gif maker | `/video-to-gif`, `/mp4-to-gif`, `/mov-to-gif` |
| gif to mp4 / gif to video | `/gif-to-mp4` |
| trim video / cut video / video cutter / crop video length | `/trim-video` |
| merge videos / combine videos / video joiner | `/merge-videos` |
| crop video / resize video / change aspect ratio / 9:16 / square video | `/crop-video`, `/resize-video`, `/change-aspect-ratio`, `/video-to-9-16` |
| rotate video / flip video / mirror video | `/rotate-video`, `/flip-video` |
| speed up video / slow motion / 2x | `/change-video-speed` |
| remove audio / mute video | `/remove-audio-from-video` |
| add music to video / add audio | `/add-audio-to-video` |
| add subtitles / srt to video / burn subtitles / auto subtitles | `/add-subtitles-to-video`, `/burn-subtitles`, `/auto-subtitles` |
| srt to vtt / vtt to srt / shift subtitles | `/srt-to-vtt`, `/vtt-to-srt`, `/shift-subtitles` |
| add watermark / remove watermark | `/add-watermark-to-video`, `/remove-watermark-from-video` |
| video info / check codec / video metadata / remove metadata | `/video-info`, `/remove-metadata-from-video` |
| screen recorder online / webcam recorder | `/screen-recorder`, `/webcam-recorder` |
| resize video for tiktok / instagram / youtube shorts | `/resize-video-for-tiktok`… |

## 6. Off-page

- Launch posts (HN, Product Hunt, r/DataHoarder, r/VideoEditing, r/privacy) emphasising "works offline, nothing uploaded".
- Open-source the engine layer (MPL/GPL compatible) to earn developer links.
- Guides that answer real questions (Discord limits by tier, iPhone HEVC compatibility) earn organic links from forums.
- No link buying, no PBNs, no guest-post spam.

## 7. Measurement

- Search Console: impressions/clicks per page weekly; pages with impressions but CTR < 2% get title/description rewrites.
- Track "tool completion rate" (drop → download) per page as the quality signal, in cookieless analytics.
- Quarterly content refresh of platform limits and codec support tables.
