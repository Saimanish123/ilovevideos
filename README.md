# ilovevideos

> Every video utility a person could need, one page each, free, no account, and the file never has to leave their device.

`ilovevideos` is a working codename (see [DECISIONS.md](DECISIONS.md), ADR-0001). The brand string comes from `site.name`; never hardcode it.

This file is the whole handbook: product, architecture, system design, stack, design, content, SEO, privacy and workflow. Two companion files hold the parts that change every session:

| File | Holds | Who writes it |
|---|---|---|
| [README.md](README.md) | Normative reference. Changes rarely, by decision. | Humans and agents, via PR |
| [DECISIONS.md](DECISIONS.md) | Append-only log of architecture, licensing, privacy, SEO and process decisions (ADRs). | Whoever makes the decision, in the same change |
| [PROGRESS.md](PROGRESS.md) | Current state, next steps, roadmap, session log. | Every session, before it ends |
| [CLAUDE.md](CLAUDE.md) | Entry point for coding agents: routing, non-negotiables, session protocol. | Rarely |

**How to read this file.** It is long by design so that there is one place to look. Read the section you need, not the whole file. Section anchors are stable and referenced from `CLAUDE.md`, `.claude/`, and code comments; `pnpm lint:docs` fails if a referenced anchor disappears.

## Contents

1. [Getting started](#getting-started)
2. [Repository layout](#repository-layout)
3. [Vision](#vision)
4. [Feature catalog](#feature-catalog)
5. [Architecture](#architecture)
6. [System design and production principles](#system-design-and-production-principles)
7. [Tech stack](#tech-stack)
8. [Design principles](#design-principles)
9. [Design system](#design-system)
10. [Tool page specification](#tool-page-specification)
11. [Content guidelines](#content-guidelines)
12. [SEO strategy](#seo-strategy)
13. [Privacy and processing](#privacy-and-processing)
14. [Engineering workflow](#engineering-workflow)
15. [Appendix A: competitive research](#appendix-a-competitive-research)
16. [Appendix B: technical SEO research](#appendix-b-technical-seo-research)

---

## Getting started

Requirements: Node 22 (`.nvmrc`), pnpm 11 (`packageManager` in `package.json`, use `corepack enable`), a local `ffmpeg`/`ffprobe` for generating and verifying test fixtures (never used in production code paths).

```bash
cp .env.example .env.local   # site URL and codename; nothing secret
pnpm install
pnpm dev                     # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build and serve; what CI and Playwright run against |
| `pnpm check` | The gate: typecheck, Biome, copy lint, registry validation, privacy lint, docs lint, unit tests |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm test:e2e` | Playwright (Chromium and Mobile Safari), builds first |
| `pnpm lhci` | Lighthouse CI budgets on a production build (home, a hub, three tool pages) |
| `pnpm lint:fix` | Biome with `--write` |
| `pnpm lint:copy` | Banned words, exclamation marks, emoji in registry content and messages |
| `pnpm lint:registry` | Slug uniqueness, no paragraph reuse across tools, minimum word count |
| `pnpm lint:privacy` | No network calls touching user data in engines and workers |
| `pnpm lint:docs` | README anchors referenced from code and config resolve; PROGRESS.md has its required sections; no references to the retired `docs/` tree |

`pnpm check` must pass before any task is declared done and before any PR is opened. CI runs the same command.

Environment variables (all public, see `.env.example`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, sitemap, JSON-LD. Required for a production deploy: the build fails without it (see [Launch steps](#launch-steps-human-need-the-domain)) |
| `ENABLE_DEV_ROUTES` | `1` renders `/dev/*` (the UI kit) in a production build; Playwright sets it. Never set on a deploy |
| `NEXT_PUBLIC_SITE_NAME` | The one brand string (ADR-0001) |
| `PROCESSING_SERVER_URL` | Empty disables the server path entirely (Phase 2 feature) |

The machine-level pnpm `minimumReleaseAge` policy rejects day-old releases pulled transitively; `pnpm-workspace.yaml` carries the excludes needed for the `next-intl` family. Build-script approval was done once with `pnpm approve-builds --all`.

---

## Repository layout

```
.
├── CLAUDE.md                  agent entry point (routing, non-negotiables, session protocol)
├── README.md                  this handbook
├── DECISIONS.md               ADR log, append-only
├── PROGRESS.md                state, next steps, roadmap, session log
├── .claude/
│   ├── settings.json          permissions and hooks (versioned; local overrides in settings.local.json)
│   ├── hooks/                 shell scripts run by the hooks: session context, routing, formatting, stop gate
│   ├── rules/                 path-scoped rules auto-loaded when matching files are edited
│   ├── agents/                subagents: tool-builder, media-engineer, design-reviewer, seo-auditor
│   └── skills/                skills: animate, review-animations, apple-design, handoff, ...
├── .github/                   CI workflow, PR template, Dependabot
├── scripts/                   lint-copy, validate-registry, lint-privacy, lint-docs (run by pnpm check)
├── src/
│   ├── app/                   Next.js routes; thin; all content comes from the registry
│   │   ├── layout.tsx         root html (lang set per locale layout)
│   │   ├── robots.ts sitemap.ts
│   │   └── [locale]/
│   │       ├── layout.tsx     fonts, theme, header, footer
│   │       ├── page.tsx       home: hero and category grids
│   │       ├── [slug]/page.tsx        every tool page (static, dynamicParams=false); do not add per-tool routes
│   │       └── tools/[category]/page.tsx  category hubs
│   ├── components/
│   │   ├── ui/                primitives on Base UI with our tokens (Button, Input, Slider, Segmented, Select, Dialog, Sheet, Toast)
│   │   ├── tool/              ToolPage (static shell), ToolStage (client), FileCard, ResultCard, ProgressLine
│   │   ├── layout/            header, footer, theme toggle, command palette
│   │   ├── icons/tools/       custom monoline tool glyphs (24px)
│   │   └── illustrations/tools/  monochrome vector illustrations per engine, used by tool cards and OG images
│   ├── tools/
│   │   ├── registry/          schema.ts, categories.ts, index.ts, tools/*.ts  (one file per tool page)
│   │   ├── engines/           types.ts and one folder per engine; each exports an Engine
│   │   └── workers/           engine runner worker, ffmpeg loader, STT worker (Phase 0/1)
│   ├── lib/
│   │   ├── seo/               JSON-LD helpers (BreadcrumbList, Organization, WebSite only)
│   │   ├── i18n/              next-intl routing and request config
│   │   ├── site.ts            site name and URL from env
│   │   └── cn.ts
│   ├── styles/                tokens.css (Tailwind v4 @theme, source of truth for design tokens), globals.css
│   ├── messages/              en.json: UI strings only; tool prose lives in the registry
│   └── content/               format profiles and editorial guides (Phase 0/2)
├── tests/
│   ├── unit/                  Vitest
│   ├── e2e/                   Playwright specs
│   └── fixtures/              short media files for engine integration tests
├── biome.json  next.config.ts  playwright.config.ts  vitest.config.ts  tsconfig.json  postcss.config.mjs
└── pnpm-workspace.yaml  .nvmrc  .env.example  .editorconfig
```

Rules of the layout:

- **Adding a tool page is one file in `src/tools/registry/tools/` plus one line in its `index.ts`.** Everything else (route, metadata, JSON-LD, sitemap, hub entry, related links, command palette) is derived.
- **Adding an engine is one folder in `src/tools/engines/`** implementing `Engine<Options>` from `types.ts`, plus a fixture-based integration test.
- Routes are thin. Content never lives in route files or message files.
- Generated and local artifacts (`.next/`, `playwright-report/`, `.playwright-mcp/`, `.claude/state/`, `*.tsbuildinfo`) are ignored, never committed.

---

## Vision

### What we are building

A web product structured like iLovePDF, for video. Each operation (compress, convert MOV to MP4, trim, make a GIF, extract audio, add subtitles…) is its own page with its own URL, its own search intent, its own copy, and a single-purpose workspace. Hundreds of such pages, generated from one tool registry, backed by a small number of shared processing engines.

### Why it can win

Existing tools (Clideo, Kapwing, VEED, 123apps, FreeConvert, Online-Convert…) share the same weaknesses:

1. **Upload-first architecture.** Everything is uploaded to their servers, which means slow round-trips, file size caps, queueing, and a real privacy problem for personal video.
2. **Freemium friction.** Watermarks, sign-up walls, per-day limits, "upgrade to remove".
3. **Generic, ad-heavy UX.** Cluttered pages, cookie banners, low-quality prose written for crawlers.
4. **Programmatic-page sprawl without substance.** Thousands of "X to Y" pages with identical text.

We invert each:

1. **Device-first processing.** WebCodecs + WebAssembly in the browser. Hardware-accelerated where the browser allows. Files stay local. A server path exists only as an explicit, opt-in fallback for cases the browser truly cannot handle, with auto-deletion and no logging of content.
2. **Free, no account, no watermark, no daily cap.** Completely free: no Pro tier, no paid features, nothing gated (ADR-0012).
3. **Premium, monochrome, Apple-grade UI.** See [Design principles](#design-principles). The product should feel like a native utility, not a website.
4. **Real content on every page.** Each tool page teaches something true and specific. Pages that cannot justify unique content do not ship.

### Who it is for

- Someone with a phone video that is too big for WhatsApp, Discord, or email.
- A creator resizing one clip for TikTok, Reels, and YouTube Shorts.
- An office worker who needs an MP4 from a MOV, a GIF from a screen recording, an MP3 from a lecture video.
- A developer or editor who knows ffmpeg exists and does not want to open a terminal.
- Anyone who does not want to upload a personal video to a stranger's server.

### Non-goals

- Not a full video editor (timeline, multi-track). Single-purpose tools only. Composability comes from chaining tools, not from a timeline.
- Not a social/creator platform. No accounts, no cloud storage, no sharing features.
- Not an AI-video generator. AI is used narrowly where it is a utility (speech-to-text for captions, silence detection), and runs on-device where possible.

### Course corrections to the original brief

These are deliberate adjustments to the initial idea, recorded so we do not relitigate them.

1. **Naming and trademark risk.** iLovePDF (ilovepdf.com, iloveimg.com) is a registered brand owned by iLovePDF S.L. "ilovevideos" is a deliberate echo of that brand and a name in that pattern (iLoveVideo, ilovevideos, etc.) may be contested or already registered. We proceed with `ilovevideos` as a working codename, but the product must be name-agnostic in code (single `SITE_NAME` constant, no hardcoded brand strings), and a decision on the final name and domain is a launch blocker. See `README.md#appendix-a-competitive-research` for what exists today.
2. **"Hundreds of features" is a page-count goal, not an engine-count goal.** Roughly 40–50 distinct processing engines, parameterised (format pairs, platform presets, target sizes), generate 300–600 well-differentiated pages. Building 300 separate features would take years; building 45 engines and a registry takes months. The user-visible result is the same, and pages stay maintainable.
3. **"Complete privacy" needs a precise definition.** We promise: on-device processing for every tool where it is technically possible; no upload without explicit consent; no cookies requiring consent; cookieless analytics only; no content logging on the server path; auto-deletion within one hour on the server path. We do not promise "100% client-side for everything" because 4K HEVC on a mid-range phone is not realistic in a browser today. Honesty is the differentiator.
4. **SEO requires static HTML, real content and patience.** Client-rendered SPAs do not rank. Every tool page is pre-rendered at build time with full prose, structured data and internal links. Ranking for "compress video online" against incumbents with a decade of backlinks takes 6–18 months; we win long-tail first (platform/size-specific pages, format pairs, "for Discord", "under 8 MB"), then head terms.
5. **Internationalisation is designed in from day one, shipped later.** iLovePDF's traffic is majority non-English. The routing (`/[locale]/[tool]`), the content model and the registry are locale-aware from the first commit, even though only English ships at launch.
6. **Neutral with one accent.** Warm off-white ground, white surfaces, deep ink, and a single accent slot (currently the ink itself, ADR-0009). Destructive-action hover and the focus ring are the only other permitted colour. User content supplies all other colour. (Originally strict grayscale; changed 2026-09-02.)
7. **No ads at launch.** Ads conflict with the security headers needed for multi-threaded WebAssembly, with privacy claims, and with the premium feel. There is no paid tier either; everything is free (ADR-0006, superseded in part by ADR-0012).

### Success criteria (12 months)

- 400+ indexed tool pages, each with unique content and passing Core Web Vitals.
- Top-10 rankings for 100+ long-tail queries; top-3 for 20+.
- 95% of processing sessions complete fully on-device.
- Lighthouse 95+/100/100/100 on every page.
- Zero cookie banners, zero accounts, zero watermarks.

---

## Feature catalog

The complete map of what ilovevideos does. Two layers:

- **Engines** (~48): distinct processing capabilities. Each is code. Each has a stable ID, an options schema, and one or more execution backends (WebCodecs/mediabunny, ffmpeg.wasm, server).
- **Tool pages** (500+): SEO-facing, single-purpose pages generated from the tool registry (`src/tools/registry/*.ts`). A page = engine + preset options + unique content + search intent. Many pages share an engine.

Status legend: **T** table stakes (every competitor has it) · **D** differentiator (rare or absent in competitors) · **P1/P2/P3** launch phase (see [PROGRESS.md](PROGRESS.md#roadmap)).

Backend legend: **W** WebCodecs + mediabunny (fast, hardware-accelerated where available) · **F** ffmpeg.wasm (universal, slower, filters/codecs WebCodecs lacks) · **S** server fallback (dropped, ADR-0024: the product is on-device only) · **J** pure JS/Canvas/WebGPU (no codec work).

---

### A. Size & quality

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| A1 | **Compress video** (quality/CRF-like, target size, target bitrate, resolution cap) | W, F | T, P1 | Flagship. Presets: "Smaller", "Balanced", "Best quality"; target-size mode with two-pass estimation. |
| A2 | **Resize / change resolution** (presets 4K/1080p/720p/480p/360p, keep aspect) | W | T, P1 | Not a separate engine: the resize page is a preset of A1 (Best quality, resolution stepped down one notch). One engine, two intents. |
| A3 | **Change bitrate** (video/audio explicit) | W, F | P2 | For technical users. Built 2026-11-18 (round 3): `change-video-bitrate` (`bitrate` engine): video kb/s, variable or constant, in the source's codec where the browser encodes it; sound copied, at its own rate or none; the written rate read back (ADR-0085). |
| A4 | **Change frame rate** (60→30→24→15, drop or blend) | W, F | T, P2 | Shipped 2026-10-01: `change-video-frame-rate`. Lowers only, by dropping frames (constant rate out); no blending or interpolation (ADR-0037). Sound copied. |
| A5 | **Change codec** (H.264 ↔ HEVC ↔ VP9 ↔ AV1; audio AAC/Opus/MP3) | W, F, S | P2 | Shipped 2026-10-01: `change-video-codec`, `hevc-to-h264`, `h264-to-hevc`. Encoders probed per file on the page (ADR-0037); sound copied or encoded to AAC/Opus by container. Audio-only codec changes are E7. |
| A6 | **Remux** (change container without re-encoding: MOV→MP4, MKV→MP4, WebM→MKV) | W | D, P1 | Instant. Most "convert" queries where codecs are compatible should hit this path; competitors always re-encode. |
| A7 | **Optimise for web / faststart** (moov atom to front, streaming-friendly) | W | D, P2 | Shipped 2026-10-01: `optimize-video-for-web`. Index rewrite on the page, byte-identical packets (ADR-0038). |
| A8 | **Compress for platform** (Discord 10 MB/25 MB, WhatsApp 16 MB, email 25 MB, Telegram, Slack, iMessage, Twitter/X 512 MB & 2:20, Instagram, TikTok, LinkedIn) | W, F | D, P1 | Each platform is its own page with real, sourced limits. High long-tail value. |

### B. Format conversion

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| B1 | **Convert video** (generic: any → MP4/WebM/MOV/MKV/AVI/GIF/…) | W, F | T, P1 | One engine; `from × to` pairs generate pages. Remux when possible, else transcode. |
| B2 | **Video → audio** (MP4→MP3/AAC/WAV/FLAC/OGG/OPUS/M4A) | W, F | T, P1 | Shipped 2026-09-03: `extract-audio-from-video` + `mp4-to-mp3`. Native copy/encode where WebCodecs can, ffmpeg for MP3. |
| B3 | **Audio → audio** (MP3/WAV/FLAC/AAC/OGG/OPUS/M4A/AIFF/WMA pairs) | W, F | T, P1 | Cheap to add; huge page fan-out. |
| B4 | **Video → GIF** (fps, width, start/end, loop, dithering, palette quality) | J, F | T, P1 | Shipped 2026-09-03: `video-to-gif`. Fast = gifenc per-frame palette in the worker; Best = ffmpeg palettegen/paletteuse. |
| B5 | **GIF → video** (GIF→MP4/WebM, for Twitter/Discord size) | W, F | T, P1 | |
| B6 | **Video → animated WebP / AVIF / APNG** | F, J | D, P2 | Shipped 2026-11-18: `video-to-webp`, `video-to-apng`, `video-to-avif` (`animated-image` engine, own muxers, WebCodecs AV1/VP8, canvas WebP, ADR-0093). |
| B7 | **Video → image sequence** (JPG/PNG/WebP frames, every Nth frame or every N seconds, zip) | W, J | P2 | |
| B8 | **Images → video** (slideshow; per-image duration, crossfade, Ken Burns, music) | W, J | T, P2 | |
| B9 | **Audio → video** (waveform / static image + audio → MP4 for YouTube) | J, W | P2 | |
| B10 | **Screen-recording formats** (MKV/OBS → MP4, QuickTime MOV → MP4, .webm from browser recorders → MP4) | W | P1 | Same engine as B1 with source-specific pages. |
| B11 | **Camera/phone formats** (HEVC iPhone → H.264, MTS/M2TS/AVCHD → MP4, 3GP → MP4, MOD/TOD, DV, MXF, ProRes → H.264) | W, F, S | P2 | |
| B12 | **Legacy formats** (WMV, FLV, F4V, SWF video, RM/RMVB, VOB, MPG/MPEG-1/2, ASF, DivX/XviD AVI, OGV, TS) | F | P2 | ffmpeg.wasm only. |

### C. Cut, join, arrange

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| C1 | **Trim / cut** (in/out points, multiple segments keep or remove, lossless keyframe cut option) | W | T, P1 | Lossless mode when cut on keyframes is a **D**. |
| C2 | **Split** (by time, into N equal parts, by size cap, at custom points) | W | T, P1 | |
| C3 | **Merge / join** (concat, mismatched-resolution handling, optional crossfade, optional re-encode) | W, F | T, P1 | |
| C4 | **Loop / repeat** (N times or to duration, boomerang) | W | T, P2 | Shipped 2026-10-01: `loop-video` (lossless copy, whole plays), `boomerang-video` (one bounce encoded, then copied). |
| C5 | **Reverse** | F, W | T, P2 | Shipped 2026-10-01: `reverse-video`. Windowed decode from the end, bounded memory; sound reversed up to about 17 min (ADR-0039). |
| C6 | **Speed** (0.25×–8×, pitch-preserve audio, ramp) | W, F | T, P1 | |
| C7 | **Remove silence / jump cut** (threshold, min duration, padding) | J+W | D, P2 | Shipped 2026-10-01: `remove-silence-from-video`, `remove-silence-from-audio`. 10 ms level windows, threshold suggested from the noise floor, cuts shown on a timeline and made by the same code; video cuts snap to frames and re-encode to H.264/AAC MP4 (ADR-0041). Round 4: pauses found by speech (Silero VAD) by default, loudness as the fallback and the alternative; also used by the Shorts clip finder (ADR-0110). |
| C8 | **Cut into clips for Shorts/Reels/TikTok** (auto 15/30/60s chunks) | W | D, P2 | Shipped 2026-11-18: `cut-video-into-shorts` (`clips` engine). Boundaries proposed at pauses and key-frame scene changes, draggable; per-clip 9:16 crop or blurred bars; each clip re-encoded, ZIP (ADR-0078). |
| C9 | **Freeze frame / hold** | W | P3 | Shipped 2026-11-18: `freeze-frame-video`. Holds on the timeline; the video pauses in silence or the sound plays on (copied); picture re-encoded (ADR-0075). |
| C10 | **Picture-in-picture / side-by-side** (two videos) | J+W | P3 | Shipped 2026-11-18: `picture-in-picture-video`, `side-by-side-video` (one `layout` engine; stacked is a choice). Synced live preview, offset, sound from either or both (ADR-0077). |

### D. Geometry

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| D1 | **Crop** (free, ratio presets 16:9/9:16/1:1/4:5/4:3/21:9, exact px) | W | T, P1 | |
| D2 | **Change aspect ratio** (crop/pad/blur-pad to target ratio) | W | T, P1 | Per-platform pages: "Convert to 9:16 for TikTok", "Square for Instagram". |
| D3 | **Rotate** (90/180/270, arbitrary angle, metadata-only rotate = lossless) | W | T, P1 | Metadata-only rotation is a **D**. |
| D4 | **Flip / mirror** (horizontal, vertical) | W | T, P1 | |
| D5 | **Pad / add borders / letterbox** (colour, blurred background) | W | P2 | Shipped 2026-10-01: `add-border-to-video` (`pad` engine on the geometry runner); blurred bars on the aspect-ratio engine. |
| D6 | **Zoom / pan (Ken Burns on video)** | W | P3 | Shipped 2026-11-18: `zoom-video` (`zoom-pan` engine). Key frames on a timeline, view frame on the picture, live result preview, sound copied (ADR-0076). |
| D7 | **Stabilise** | F (vidstab) | P3 | Expensive; two-pass; likely S fallback for long clips. Built 2026-11-18 (round 3) on W + WebGL instead: `stabilize-video`. Global motion by direct alignment at 320 px, Gaussian-smoothed path held inside the picture, zoom to fill or borders; residual jitter far below FFmpeg `deshake` on the fixture; rolling shutter not corrected (ADR-0083). |
| D8 | **Remove black bars (auto-detect crop)** | J+W | D, P2 | Built 2026-11-18 (round 3): `remove-black-bars-from-video` (crop engine, `bars` preset). 24 frames read on the page, bars by agreement, content inside a bar named with a keep option, no bars settled (ADR-0084). |
| D9 | **Fix vertical video for landscape (blurred sides)** | W | P2 | Shipped 2026-10-01: `vertical-video-to-horizontal` (aspect-ratio preset, blurred background). |

### E. Audio in video

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| E1 | **Mute / remove audio** | W | T, P1 | Remux-only; instant. |
| E2 | **Extract audio** (see B2) | W | T, P1 | |
| E3 | **Add / replace audio track** (music, voiceover; trim to video, loop, fade) | W | T, P1 | |
| E4 | **Adjust volume / gain / normalise (EBU R128 loudness)** | W, J, F | T, P2 | Shipped 2026-10-01: `change-video-volume`, `change-audio-volume`, `normalize-audio`. BS.1770-4 meter and 4× true peak in JS, look-ahead limiter, before and after measured on device; picture copied (ADR-0040). |
| E5 | **Fade audio in/out** | W, J | P2 | Shipped 2026-10-01: `fade-audio`, `fade-audio-in-video`. Quarter-sine or linear (ffmpeg `afade` curves), handles on the waveform, picture copied. |
| E6 | **Audio delay / sync fix** (shift ms) | W | D, P2 | Shipped 2026-10-01: `fix-audio-sync`. Packet copy; exact to the sample in MP4/MOV via an edit list, nearest sound frame in MKV/WebM (ADR-0042). |
| E7 | **Change audio codec / bitrate / channels (stereo→mono)** | W, F | P2 | Shipped 2026-10-01 in `convert-audio`: `stereo-to-mono`, `change-audio-sample-rate` (resampling always through ffmpeg's resampler; mediabunny interpolates linearly). Codec and bitrate stay with the converter and pair pages. |
| E8 | **Remove background noise** (RNNoise-style on-device) | F/J | D, P3 | Built 2026-11-19 (round 4): `remove-background-noise` (`speech-denoise`): RNNoise 0.2 on device, strength as a wet/dry mix, loudness kept, 8 s audition, audio and video (picture copied) (ADR-0108). Speech only; music pumps, bursts drop about 14 dB, no echo removal. Mains hum (50/60 Hz) is DSP and still open. |
| E9 | **Isolate vocals / remove music** (on-device model) | J (WebGPU) | D, P3 | Not planned: needs a model (ADR-0105). |
| E10 | **Select/keep/remove audio tracks** (multi-track MKV) | W | P2 | Shipped 2026-10-01: `select-audio-tracks`. Packet copy of picture and chosen tracks, main track first and default; subtitles, chapters and attachments are not carried (mediabunny cannot read them). |
| E11 | **Audio tools standalone**: trim, merge, speed, reverse, volume, fade, normalise, cut silence, pitch, tempo, mono/stereo, sample rate, bitrate, ringtone maker (M4R), voice recorder | W, F, J | T, P2 | Each is its own page family. Shipped 2026-10-01: `trim-audio` (extract-audio range, copied when the format stays), `change-audio-speed` (speed engine, audio branch), volume, fade, normalise, cut silence, mono, sample rate. Built 2026-11-18 (round 3): `merge-audio` (`join-audio`: matching MP3s joined frame for frame, else decoded, band-limited resampling, gap or equal-power crossfade, optional loudness match), `ringtone-maker` (`ringtone`: iPhone M4R or Android MP3/OGG, loudest 30 s suggested), `change-audio-pitch` (`pitch`: resampler plus phase-locked vocoder that keeps attacks, length exact), `key-bpm-finder` (`audio-analyze`: tempo with half and double, key with relative, Camelot and confidence) (ADR-0087 to ADR-0091). |

### F. Text, captions, subtitles

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| F1 | **Add subtitles from file** (SRT/VTT/ASS → soft track or burned-in) | W (soft), F (burn) | T, P1 | Soft-sub muxing is instant. |
| F2 | **Auto-generate subtitles** (on-device Whisper via transformers.js/WebGPU; languages; word-level timing) | J | D, P2 | Not planned: needs a model (ADR-0105). Subtitles come from a file (F1). |
| F3 | **Burn-in / style captions** (font, size, position, background, TikTok-style word highlight) | J+W | T, P2 | Render with Canvas, composite via WebCodecs. Shipped 2026-11-18 on `add-subtitles-to-video` (no separate page): Classic, Boxed and Bold social looks, a position band on the picture, cue list, short phrases timed by length, text tracks inside the video, right-to-left lines. No word highlight: word times are not read (ADR-0069). |
| F4 | **Extract subtitles** (from MKV/MP4 soft tracks → SRT/VTT) | W | P2 | |
| F5 | **Subtitle utilities**: SRT↔VTT↔ASS↔SBV↔TXT convert, shift timing, fix overlaps, merge, split, change frame rate, translate (on-device model, P3) | J | D, P1 | Pure text tools; cheap; strong long-tail. Translation is not planned (ADR-0105). |
| F6 | **Add text overlay / title** (positioned, timed, animated in/out) | J+W | T, P2 | |
| F7 | **Transcribe video to text** (transcript export TXT/DOCX/MD) | J | D, P2 | Not planned: needs a model (ADR-0105). |
| F8 | **Translate subtitles** | J (on-device) / S (optional API) | P3 | Not planned: needs a model or a server (ADR-0105, ADR-0024). |

### G. Overlays & visual

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| G1 | **Add watermark / logo** (image or text, position, opacity, scale, timed) | J+W | T, P1 | |
| G2 | **Remove watermark** (crop, blur region, delogo) | F | T, P2 | Dropped (ADR-0062): no removal page. Blurring a mark is covered by `blur-video`; cutting it off by `crop-video`. |
| G3 | **Blur / pixelate region** (static or tracked, faces found on device) | J+W | P2 | Shipped 2026-11-18: `blur-video` (`blur-region` engine). Rectangles and ellipses drawn on the picture, key frames for moving subjects, per-region time range, blur, pixelate or black box, soft edge, inverted mode; one WebGL renderer for preview and output (ADR-0063). No separate pixelate page. Find faces (2026-11-19): YuNet on our WebGL 2 kit finds faces on 6 frames a second (full frame at 640 px plus full-resolution tiles above 960 px), tracks them across frames and shots, and places a following oval per face for the user to review; up to 48 regions (ADR-0113 to ADR-0117). |
| G4 | **Brightness / contrast / saturation / exposure / gamma** | J+W | T, P2 | Shipped 2026-10-01: `adjust-video-brightness` (`filter` engine, per-frame runner, ADR-0035). |
| G5 | **Filters / LUT** (monochrome, sepia, cinematic; upload .cube LUT) | J+W | P2 | Shipped 2026-10-01: `add-filter-to-video` (six matrix looks with strength). No LUT upload yet. |
| G6 | **Sharpen / denoise** | F | P3 | Built 2026-11-18 (round 3) on W + WebGL: `sharpen-video`, `denoise-video` (`clarity` engine). Denoise: non-local means over this and the previous cleaned frame, strength from measured grain, level with or above FFmpeg `nlmeans` and above `hqdn3d`; sharpen: brightness unsharp mask with grain threshold and halo limit; before/after split preview (ADR-0081, ADR-0082). |
| G7 | **Add image overlay / sticker** | J+W | P2 | Shipped 2026-11-18: `add-image-to-video` (`image-overlay` engine). Up to 8 layers, drag, resize, rotate, time range, stack order, opacity; animated GIF, WebP and APNG play through `ImageDecoder`, first frame where it is missing (ADR-0064). |
| G8 | **Add progress bar / timer / countdown** | J+W | P3 | Shipped 2026-11-18: `add-progress-bar-to-video`, `add-timer-to-video` (`time-overlay` engine). Full on the last frame, countdowns reach 0:00 there; fixed-cell Geist digits; range on the timeline (ADR-0070). |
| G9 | **Colour to black & white** | J+W | P2 | On-brand. Shipped 2026-10-01: `black-and-white-video` (four variants). |
| G10 | **Fade in/out (video)** | J+W | P2 | Shipped 2026-10-01: `fade-video` (`video-fade` engine, timeline control, sound fades optionally). |
| G11 | **Add intro/outro** (image or clip, concat) | W | P3 | Shipped 2026-11-18: `add-intro-to-video` (`intro-outro` engine). Title card, picture or clip at each end, fitted to the main video's frame and rate, crossfades over picture and sound, everything re-encoded once (ADR-0071). |
| G12 | **Green screen / chroma key** | J (WebGL) | P3 | Shipped 2026-11-18: `remove-green-screen-from-video` (`chroma-key` engine). Key colour found at the frame's edges or tapped, colour-difference keyer against a local screen plate, spill removal, colour, image or video background (loop or hold), live WebGL preview with the same shaders. No transparent output (ADR-0065). |
| G13 | **Change background colour (padding regions)** | W | P2 | Shipped 2026-10-01 as options, not a page: any colour on borders, black/white/blurred bars on aspect ratio. |
| G14 | **Blur or replace the background without a green screen** | J (WebGL) + model | P3 | Built 2026-11-19 (round 4): `blur-video-background`, `remove-background-from-video` (`portrait-matte` engine). MediaPipe Selfie Segmentation (landscape 144×256 or general 256×256 by shape) on TensorFlow.js in a worker, mask steadied over time with the previous and next frames, refined to the picture's edges with a guided filter; blur that leaves the person out, colour, image or video behind, or the mask itself as a video; live WebGL preview with the same renderer (ADR-0118 to ADR-0122). |

### H. Frames, stills, thumbnails

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| H1 | **Extract frame / screenshot at time** (PNG/JPG/WebP, full resolution) | W | T, P1 | |
| H2 | **Thumbnail generator** (multi-frame grid, contact sheet / storyboard) | W, J | P2 | |
| H3 | **Video → images (every N seconds)** (see B7) | W | P2 | |
| H4 | **Best-frame picker** (sharpness scoring) | J | D, P3 | Shipped 2026-11-18: `sharpest-frame-from-video` (`frame-pick`, ADR-0094). Thumbnail maker shipped 2026-11-18: `video-thumbnail-maker` (ADR-0098). |
| H5 | **Set poster/cover frame** (metadata) | W | P3 | Covers (uploaded image) already on `edit-video-metadata`; macOS Finder shows them (ADR-0095). Shipped 2026-11-18: `change-video-thumbnail` (frame as MP4/MOV cover, ADR-0098). |

### I. Metadata & inspection

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| I1 | **Video info / inspector** (codec, profile, bitrate, fps, resolution, duration, audio tracks, colour space, HDR) | W | D, P1 | mediainfo-like, instant, zero processing. Strong SEO: "check video codec online". |
| I2 | **Remove metadata / strip EXIF & GPS** | W | D, P1 | Privacy story. Instant remux. |
| I3 | **Edit metadata** (title, artist, date, comment, cover art for MP4/M4A/MP3) | W | P2 | |
| I4 | **Change creation date** | W | P3 | Shipped 2026-11-18: `change-video-creation-date` (edit-metadata engine, set with zone or shift, batch, ADR-0096). |
| I5 | **Check if video is corrupt / repair moov** | W, F | P3 | Shipped 2026-11-18: `repair-video` (diagnose; cut-off MP4/MOV, fragmented MP4, MKV/WebM; a missing moov is diagnosed, not rebuilt, ADR-0097). |
| I6 | **Compare two videos** (side-by-side, metadata diff) | J | D, P3 | |

### J. Capture

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| J1 | **Screen recorder** (tab/window/screen, mic, system audio, camera bubble) → MP4/WebM | W (MediaRecorder + remux) | T, P2 | Output MP4 directly (competitors give WebM). Shipped 2026-11-18: `screen-recorder`. H.264/AAC encoded live by mediabunny's MediaStream sources (not MediaRecorder), streamed to OPFS; mic and shared sound mixed, camera bubble, pause, Stop sharing finishes; phones blocked with the reason (ADR-0099, ADR-0100). |
| J2 | **Webcam recorder** | W | T, P2 | Shipped 2026-11-18: `webcam-recorder`. Camera and mic choice, 720p/1080p, mirrored preview (file not mirrored unless chosen), 3-2-1 count, pause (ADR-0100). |
| J3 | **Audio/voice recorder** | W | T, P2 | Shipped 2026-11-18: `voice-recorder`. M4A, WAV or Opus written live, level and waveform, browser processing under More options; MP3 by handoff to the converter (ADR-0101). |
| J4 | **Screenshot of a video frame (see H1)** | | | |

### K. Platform & purpose presets (pages, not engines)

Each resolves to an existing engine with locked/preselected options and dedicated content:

- **Compress for**: Discord (10 MB free / 50 MB Nitro Basic / 500 MB Nitro), WhatsApp, Telegram, Email/Gmail (25 MB), Outlook (20 MB), iMessage, Slack, Teams, Messenger, Snapchat, Signal, Line, WeChat, KakaoTalk.
- **Resize/crop for**: TikTok (9:16 1080×1920), Instagram Reels/Feed/Story, YouTube (16:9) / Shorts (9:16), Twitter/X, Facebook, LinkedIn, Pinterest, Snapchat, Twitch, Threads, Bluesky.
- **Convert for**: iPhone, Android, iMovie, Premiere Pro (ProRes/DNxHD), DaVinci Resolve, Final Cut, PowerPoint, Google Slides, Keynote, Canva, WordPress, Shopify, Squarespace, Notion, Discord (GIF ≤ 8 MB), Twitter GIF, Steam artwork, Kindle, PS5/Xbox/Switch capture, GoPro, DJI drone, Zoom recording, Teams recording, OBS, Loom, Screen Studio.
- **Make a GIF from**: YouTube clip (user-supplied file), screen recording, TikTok, iPhone Live Photo (MOV), Boomerang.

### L. Batch & workflow (D)

| # | Feature | Status | Notes |
|---|---|---|---|
| L1 | **Batch processing** on every tool (queue, per-file status, zip download) | P1 core | Free, unlimited; competitors gate this. |
| L2 | **Chain tools** ("send result to another tool" without re-download) | P2 | In-memory handoff; unique. |
| L3 | **Presets** (save option sets in localStorage) | P2 | Built 2026-11-19 (round 5): remembered settings per page and "Saved settings" (ADR-0129); last result kept a day (ADR-0131); interrupted recordings recovered (ADR-0130). |
| L4 | **Command palette** (⌘K) over all tools | P1 | Round 4 (2026-11-19): job-aware search with an intent table and best-coverage ranking, loaded on use; a full-screen search sheet on phones; recents in this browser only; "Not sure which tool?" reads a dropped file and suggests tools with a reason; related tools with a reason each; a "Then" row under results; hubs grouped by task; a footer of hubs (ADR-0123 to ADR-0127). Round 5: searches that list no tool or are left without opening one are counted per day through a first-party `/api/search-miss` (search text only), and `pnpm search-report` lists them for the intent table (ADR-0150 to ADR-0152). |
| L5 | **Paste a file / drag from another tab / share-target PWA** | P2 | Installable PWA with `share_target` so phones can "Share → ilovevideos". Shipped 2026-11-18: manifest, share target to a tool chooser at `/share`, several files handed on at once (ADR-0102, ADR-0103). iOS has no share target. |
| L6 | **Offline** (PWA caches engines; works with no network) | P2 | Strong privacy proof. Shipped 2026-11-18: hand-written service worker; visited pages and the engine and wasm files they loaded work offline, nothing cached ahead (ADR-0102). |
| L7 | **Equivalent ffmpeg command** for every operation | P1 | Commands kept in results for tests and records; not shown in the interface (owner, 2026-11-19). |
| L8 | **Keyboard shortcuts and gestures** | P1 | Shipped 2026-10-08 (ADR-0051). Site: ⌘K and / search, ? lists everything (also a footer link). Tool pages: ⌘/Ctrl+O choose a file, ⌘/Ctrl+Enter run, ⌘/Ctrl+S save, Esc cancel, ⌘/Ctrl+V paste. Previews: Space/K, J/L ±10 s, arrows ±5 s, , and . one frame, Home/End, 0–9, M, F; a page's own key wins. Gestures: tap plays or pauses, double-tap a side seeks 5 s, double-click full screen, drag reorders, swipe down closes a sheet. Delete removes a focused clip. |

---

### Page count estimate

| Family | How pages are generated | Approx. pages |
|---|---|---|
| Core tool pages (one per engine) | 1 each | ~70 |
| Video→video format pairs | 14 sources × 8 targets (only meaningful pairs) | ~90 |
| Video→audio pairs | 12 video × 8 audio | ~60 (pruned to meaningful) |
| Audio→audio pairs | 10 × 9 | ~60 (pruned) |
| GIF/animated pairs | (video, live photo, images) × (GIF, WebP, APNG, MP4) | ~20 |
| Compress for platform | 15 platforms | 15 |
| Resize/crop/aspect for platform × surface | ~12 platforms × ~2 surfaces | ~25 |
| Convert for device/app | ~35 | 35 |
| Subtitle utilities | ~20 | 20 |
| Audio standalone tools | ~15 | 15 |
| "Under N MB" size targets | 8 MB, 10 MB, 16 MB, 25 MB, 50 MB, 100 MB, 500 MB | 7 |
| Info/metadata/inspector variants | ~8 | 8 |
| Recorders | 3 | 3 |
| Guides/how-to (editorial, supports tool pages) | ongoing | 50+ |
| **Total at maturity** | | **~480–580** |

Pruning rule: a format-pair page ships only if (a) real search demand exists (verified in Search Console/keyword tools) **and** (b) we can write ≥ 150 words specific to that pair. Otherwise the pair is available in the generic converter but has no dedicated page. This is how we avoid the doorway-page penalty.

---

### What competitors gate that we do not

- Batch processing (Clideo/Kapwing/VEED paywall it).
- Files over ~500 MB–2 GB (most cap free tier at 500 MB or less; our device-side path is limited only by the user's RAM/disk, and we say so).
- No watermarks anywhere.
- No daily operation limits.
- No account.
- Output resolution not capped (Kapwing/VEED cap free exports at 720p).

### What we do not do (and say so)

- Full timeline editing.
- AI generation (text-to-video, avatars, voice cloning).
- Downloading videos from YouTube/TikTok/Instagram URLs (legal exposure; we process files the user already has).

### Browser support (generated)

What each browser provides for the engines, and what a page on each engine does there (ADR-0144 to ADR-0148). Generated by `scripts/capability-matrix.ts`; do not edit between the markers. Every page runs in Chromium, Chrome on Android (emulated) and Safari on iPhone (emulated) in `tests/e2e/every-page.spec.ts`; Firefox runs only with `E2E_FIREFOX=1`.

<!-- capability-matrix:start -->
Measured with `tests/e2e/capabilities.spec.ts` on 2026-11-19 in Playwright's browsers (Chromium (desktop): chromium 151.0.7922.34; Chrome, Pixel 7 emulation: chromium 151.0.7922.34; Safari, iPhone 14 emulation: webkit 26.5). Firefox is documented from the bundled caniuse-lite 1.0.30001810 and not run here (ADR-0144). Every page asks its engine the same question before the user starts and says when this browser cannot do the job (ADR-0147). Regenerate: `pnpm tsx scripts/capability-matrix.ts`.

| Capability | Chromium (desktop) | Chrome, Pixel 7 emulation | Safari, iPhone 14 emulation | Firefox desktop (documented, not run here) | Firefox for Android (documented, not run here) |
|---|---|---|---|---|---|
| Video decode (WebCodecs) | yes | yes | yes | yes from 130 (caniuse webcodecs) | no: no WebCodecs (caniuse webcodecs, Firefox for Android 153) |
| Audio decode (WebCodecs) | yes | yes | yes | yes from 130 (caniuse webcodecs) | no: no WebCodecs (caniuse webcodecs, Firefox for Android 153) |
| H.264 encode that returns frames | yes | yes | Baseline only (High stalls) | unknown: WebCodecs from 130 (caniuse webcodecs); which codecs encode is not in the data | no: no WebCodecs (caniuse webcodecs, Firefox for Android 153) |
| VP9 encode | yes | yes | yes | unknown: WebCodecs from 130 (caniuse webcodecs); which codecs encode is not in the data | no: no WebCodecs (caniuse webcodecs, Firefox for Android 153) |
| HEVC encode | no | no | yes | unknown: WebCodecs from 130 (caniuse webcodecs); which codecs encode is not in the data | no: no WebCodecs (caniuse webcodecs, Firefox for Android 153) |
| AAC encode | yes | yes | yes | unknown: WebCodecs from 130 (caniuse webcodecs); which codecs encode is not in the data | no: no WebCodecs (caniuse webcodecs, Firefox for Android 153) |
| Opus encode | yes | yes | yes | unknown: WebCodecs from 130 (caniuse webcodecs); which codecs encode is not in the data | no: no WebCodecs (caniuse webcodecs, Firefox for Android 153) |
| WebGL 2 in a worker (OffscreenCanvas) | yes | yes | yes | unknown in a worker: WebGL 2 from 51, OffscreenCanvas from 105 (caniuse) | unknown in a worker: WebGL 2 and OffscreenCanvas yes in 153 (caniuse) |
| OffscreenCanvas 2D in a worker | yes | yes | yes | yes from 105 (caniuse offscreencanvas) | yes in 153 (caniuse offscreencanvas) |
| GIF decode (ImageDecoder) | yes | yes | no | unknown: not in the data | unknown: not in the data |
| ffmpeg.wasm (SharedArrayBuffer, cross-origin isolated) | yes | yes | yes | yes: SharedArrayBuffer from 79 when isolated, WebAssembly threads from 79 (caniuse) | yes in 153 (caniuse sharedarraybuffer, wasm-threads) |
| Screen capture (getDisplayMedia) | yes | yes | yes | unknown: not in the data | unknown: not in the data |
| Camera and microphone (getUserMedia) | yes | yes | yes | yes (caniuse stream, current versions) | yes in 153 (caniuse stream) |
| HEVC decode | no | no | yes | unknown | unknown |
| AV1 encode | yes | yes | yes | unknown | unknown |
| OPFS (large outputs stream to disk) | yes | yes | no | unknown | unknown |
| MediaRecorder MP4 | yes | yes | yes | unknown | unknown |

What each engine needs with its page's defaults, and what a page on it does: **works**, takes its **slower path** (the same file through ffmpeg.wasm, ADR-0147), or **says so** before the user starts, naming what is missing.

| Engine | Needs | Chromium (desktop) | Chrome, Pixel 7 emulation | Safari, iPhone 14 emulation | Firefox for Android (documented) |
|---|---|---|---|---|---|
| compress ¹ | video-decode, h264-encode, aac-encode | works | works | works | slower path |
| bitrate | video-decode, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| framerate ¹ | video-decode, h264-encode, aac-encode | works | works | works | slower path |
| codec | video-decode, h264-encode; HEVC encode for H.264 to HEVC | works | works | works | says so (video-decode, h264-encode) |
| faststart | nothing beyond reading the file; rewrites the index only | works | works | works | works |
| convert-video ¹ | nothing beyond reading the file; copies when the codecs fit; H.264 or VP9 and AAC or Opus when they do not | works | works | works | works |
| video-to-audio ¹ | nothing beyond reading the file; copies AAC; MP3 and WAV via ffmpeg.wasm | works | works | works | works |
| convert-audio ¹ | audio-decode; AAC and Opus natively; MP3, FLAC and Vorbis via ffmpeg.wasm | works | works | works | slower path |
| video-to-gif ¹ | video-decode, offscreen-canvas | works | works | works | slower path |
| animated-image | video-decode, offscreen-canvas | works | works | works | says so (video-decode) |
| gif-to-video ¹ | gif-decode, h264-encode; ffmpeg.wasm reads the GIF where ImageDecoder is missing | works | works | slower path (gif-decode) | slower path |
| video-to-frames | video-decode, offscreen-canvas | works | works | works | says so (video-decode) |
| frame-extract | video-decode, offscreen-canvas | works | works | works | says so (video-decode) |
| frame-pick | video-decode, offscreen-canvas | works | works | works | says so (video-decode) |
| thumbnail-grid | video-decode, offscreen-canvas | works | works | works | says so (video-decode) |
| images-to-video | offscreen-canvas, h264-encode | works | works | works | says so (h264-encode) |
| audio-to-video | audio-decode, h264-encode, aac-encode | works | works | works | says so (audio-decode, h264-encode, aac-encode) |
| trim | nothing beyond reading the file; a frame-accurate cut needs H.264 encode | works | works | works | works |
| split | nothing beyond reading the file | works | works | works | works |
| merge | nothing beyond reading the file; clips that differ need H.264 and AAC encode | works | works | works | works |
| loop | video-decode, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| reverse | video-decode, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| speed | converter | works | works | works | works |
| remove-silence | audio-decode, aac-encode; video needs H.264 encode | works | works | works | says so (audio-decode, aac-encode) |
| freeze-frame | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| layout | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| clips | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| zoom-pan | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| intro-outro | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| crop ¹ | video-decode, h264-encode, aac-encode | works | works | works | slower path |
| aspect-ratio ¹ | video-decode, h264-encode, aac-encode | works | works | works | slower path |
| rotate | nothing beyond reading the file; a turn is written as metadata; a flip needs H.264 encode | works | works | works | works |
| pad ¹ | video-decode, h264-encode, aac-encode | works | works | works | slower path |
| stabilize | video-decode, webgl2, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| clarity | video-decode, webgl2, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| mute | nothing beyond reading the file | works | works | works | works |
| add-audio | audio-decode, aac-encode | works | works | works | says so (audio-decode, aac-encode) |
| volume | audio-decode, aac-encode; MP3 and other outputs via ffmpeg.wasm | works | works | works | says so (audio-decode, aac-encode) |
| audio-fade | audio-decode, aac-encode | works | works | works | says so (audio-decode, aac-encode) |
| audio-sync | nothing beyond reading the file | works | works | works | works |
| audio-tracks | nothing beyond reading the file | works | works | works | works |
| pitch | audio-decode, aac-encode | works | works | works | says so (audio-decode, aac-encode) |
| audio-analyze | audio-decode | works | works | works | says so (audio-decode) |
| join-audio | audio-decode, converter | works | works | works | says so (audio-decode) |
| ringtone | audio-decode, aac-encode | works | works | works | says so (audio-decode, aac-encode) |
| speech-denoise | audio-decode, aac-encode | works | works | works | says so (audio-decode, aac-encode) |
| inspect | nothing beyond reading the file | works | works | works | works |
| strip-metadata | nothing beyond reading the file | works | works | works | works |
| edit-metadata | nothing beyond reading the file | works | works | works | works |
| cover | nothing beyond reading the file | works | works | works | works |
| repair | nothing beyond reading the file | works | works | works | works |
| subtitles-convert | nothing beyond reading the file | works | works | works | works |
| subtitles-extract | nothing beyond reading the file | works | works | works | works |
| subtitles-add | nothing beyond reading the file; soft subtitles copy; burned-in text needs H.264 encode | works | works | works | works |
| text-overlay | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| watermark | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| time-overlay | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| image-overlay | video-decode, offscreen-canvas, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| blur-region | video-decode, webgl2, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| chroma-key | video-decode, webgl2, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| portrait-matte | video-decode, webgl2, h264-encode, aac-encode | works | works | works | says so (video-decode, h264-encode, aac-encode) |
| filter ¹ | video-decode, webgl2, h264-encode, aac-encode | works | works | works | slower path |
| video-fade ¹ | video-decode, h264-encode, aac-encode | works | works | works | slower path |
| screen-record | screen-capture, h264-encode; VP9 where H.264 is missing | works | works | works | says so (h264-encode) |
| webcam-record | camera-mic, h264-encode, aac-encode | works | works | works | says so (h264-encode, aac-encode) |
| audio-record | camera-mic, aac-encode; Opus where AAC is missing | works | works | works | says so (aac-encode) |

¹ Has an ffmpeg.wasm path that makes the same file where the browser's own encoder is missing (`src/tools/engines/fallbacks.ts`).
<!-- capability-matrix:end -->

---

## Architecture

### 1. Shape

```
                 ┌───────────────────────────────────────────┐
  build time     │  Tool registry (src/tools/registry)       │
                 │  slug · engine · presets · content · i18n │
                 └───────┬───────────────────┬───────────────┘
                         │                   │
        ┌────────────────▼──────┐   ┌────────▼───────────────┐
        │ Static pages (Next)   │   │ sitemap · robots ·     │
        │ /[locale]/[slug]      │   │ JSON-LD · hub pages ·  │
        │ H1 · prose · FAQ ·    │   │ command palette index  │
        │ related · <ToolStage> │   └────────────────────────┘
        └────────────────┬──────┘
                         │ hydrate only the stage
  runtime (browser)      ▼
        ┌────────────────────────────────────────────────────┐
        │ ToolStage (client)                                 │
        │  dropzone → inspector → options → job queue → UI   │
        └───────┬────────────────────────────────────────────┘
                │ postMessage (transferables / OPFS handles)
        ┌───────▼────────────────────────────────────────────┐
        │ Worker: engine runner                              │
        │  first backend whose engine.supports() says yes:   │
        │   1. WebCodecs + mediabunny  (fast, HW accel)      │
        │   2. ffmpeg.wasm core-mt     (universal, slower)   │
        │   3. Canvas/WebGPU           (GIF, overlays, STT)  │
        │   4. Server (opt-in only)    (Phase 2)             │
        └────────────────────────────────────────────────────┘
```

Everything above the "runtime" line is static HTML generated at build. Everything below runs on the user's device. There is no application server in Phase 1.

### 2. The registry is the product

`src/tools/registry/schema.ts` defines `ToolDefinition`. Adding a tool page = adding one file to `src/tools/registry/tools/` and one line to its index. From that single object we derive: route, metadata, canonical/hreflang, JSON-LD, H1/subtitle/prose/FAQ, home grid card, category hub entry, footer link, command-palette entry and aliases, related-tool links, sitemap entry, and the stage's accepted file kinds and preset options.

Validation runs in CI (`pnpm lint:registry`): schema, slug uniqueness, no paragraph reused across tools, minimum word count. This is the mechanical guard against thin pages.

Engines live in `src/tools/engines/<engineId>/` and implement the `Engine<Options>` interface (`types.ts`): `optionsSchema`, `supports(backend, input, options)`, `run(...)`. One engine, many tool pages.

### 3. Processing pipeline

1. **Drop** → file(s) accepted by the stage. Files > ~200 MB are written to OPFS immediately so they are not held in memory.
2. **Inspect** → mediabunny reads container/track metadata in a worker (ms). Produces `MediaInfo` shown in the file card and used to choose defaults (e.g. "this MOV can be remuxed losslessly").
3. **Options** → engine's zod schema, pre-filled from the tool's `presetOptions` and the file's `MediaInfo`. Defaults must produce a good result with zero interaction.
4. **Select backend** → `supports()` probes: WebCodecs `isConfigSupported` for the target codec, `crossOriginIsolated` for ffmpeg core-mt, WebGPU for STT. First supported backend in the tool's `backends` list wins. The UI states which path is running.
5. **Run** in a dedicated Worker. Progress is real (frames encoded / total frames; bytes muxed / estimated). `AbortSignal` cancels cleanly and frees memory.
6. **Result** → Blob (or OPFS handle for large outputs) → result card with real before/after numbers → Download (File System Access API `showSaveFilePicker` where available, else `<a download>`). Optional: "Send to another tool" hands the Blob to the next tool page in memory via a session store.
7. **Cleanup** → OPFS scratch is deleted on completion and on page unload.

### 4. Backends

| Backend | Use for | Notes |
|---|---|---|
| **WebCodecs + mediabunny** | remux, trim, merge (compatible streams), compress/resize/fps/codec change (H.264/VP9/AV1/HEVC where supported), extract audio, mute, add audio, crop/rotate/flip via `VideoFrame` → Canvas → encoder, frame extraction, inspect, strip/edit metadata | Hardware encode on most devices. Per-frame memory, so file size is not a memory problem. |
| **ffmpeg.wasm (core-mt)** | legacy containers/codecs, subtitle burn-in with libass, vidstab, delogo, loudnorm, complex filtergraphs, anything WebCodecs lacks | Requires SharedArrayBuffer (COOP/COEP). ~30 MB core, loaded lazily and cached. GPL build → we publish our build config and offer source per licence (ADR-0004). |
| **Canvas / WebGPU / JS** | GIF encoding (gifenc), text/watermark/blur overlays composited per frame, colour adjustments, silence detection | Composites feed back into the WebCodecs encoder. |
| **Server** (Phase 2, opt-in) | 4K HEVC encode on weak devices, > 4 GB files on 32-bit WASM, stabilisation on long clips | Explicit consent dialog before any upload; TLS; processed in RAM/tmpfs; deleted ≤ 1 h; no content logs. |

### 5. Frontend structure

See [Repository layout](#repository-layout).

### 6. Performance budget

| Metric | Budget |
|---|---|
| Tool page HTML | < 60 KB |
| JS on first load (before file drop) | Home and hubs < 300 KB gzipped; tool pages < 350 KB gzipped (ADR-0107; the React + Next + next-intl floor is about 152 KB). A ceiling, not a target: heavy parts still load on use, and LCP, CLS and the performance score keep their own limits |
| Engine bundle (lazy) | mediabunny ≈ 100 KB; ffmpeg core ≈ 30 MB (cached, immutable) |
| LCP | < 1.8 s on 4G mid-range Android |
| INP | < 200 ms (all encoding in workers; main thread only renders progress) |
| CLS | 0 |

### 7. Security & privacy mechanics

- COOP `same-origin`, COEP `require-corp`, CORP `same-origin` on WASM assets, strict Permissions-Policy (camera/mic/display-capture self only for recorders).
- No third-party scripts. Analytics proxied first-party and cookieless.
- First-party cookies and browser storage are allowed where they make the product more usable (ADR-0128): remembered settings, presets, recents, recovery. What is stored and how to clear it is on `/privacy`.
- The only server code is `POST /api/search-miss` (ADR-0150): it receives a failed search's text (normalised, at most 80 characters) and a result count, keeps a count per query per day, and reads no address, user agent or cookie and sets none. Files never reach it. Storage is behind an interface: a JSON file in development, Cloudflare D1 when hosted (ADR-0151).
- Server path (Phase 2): separate origin, separate consent, separate docs.

### 8. Testing strategy

- **Unit** (Vitest): registry invariants, option math (target-size → bitrate), duration/size formatting, capability probing with mocks.
- **Engine integration** (Vitest + Playwright Chromium): fixture media in `tests/fixtures/` (short MP4/MOV/WebM/MKV/GIF/MP3), run each engine end-to-end in a real browser, assert output container/codec/duration via mediabunny inspection.
- **E2E** (Playwright, Chromium + Mobile Safari): every tool page renders, H1 matches registry, JSON-LD valid, zero axe violations, keyboard-only path to Download.
- **Visual** (Playwright screenshots): kitchen-sink `/dev/ui` at 375/768/1280 in light and dark; diffs reviewed in PRs.
- **Lighthouse CI** on a sample of pages per PR with the thresholds in the design principles.

---

## System design and production principles

This section states how the product behaves at scale and under failure, and the engineering principles every change is held to. It complements [Architecture](#architecture), which describes the shape; this describes the operating model.

### Scale model

The site is a static asset bundle served from a CDN plus computation that happens on the visitor's device. There is no application server, no database and no per-request compute in Phase 1. Consequences:

| Concern | How it scales | What actually binds |
|---|---|---|
| Page views | CDN edge cache; every tool page is a pre-rendered HTML document | Build time for thousands of pages × locales (shard builds or move hubs to on-demand rendering when it exceeds ~15 min) |
| Processing | Runs on the user's CPU/GPU; capacity grows with users for free | Device memory (32-bit WASM tops out at 2–4 GB addressable) and browser codec support; mitigated by the WebCodecs per-frame path and OPFS streaming |
| Engine downloads | Immutable, content-hashed, cached for a year at the edge and in the browser (ffmpeg core ≈ 30 MB, mediabunny ≈ 100 KB) | First-load bandwidth cost per new visitor; code-split so nothing heavy loads before a file is dropped |
| Search traffic | Linear in unique, indexable pages | Editorial capacity to write true, specific content; the registry validator refuses thin pages |
| Server fallback | None: dropped (ADR-0024). Every job runs on the user's device | Large files and codecs the browser cannot encode get a specific message instead |

Millions of users therefore cost bandwidth and build minutes, not compute. The design protects the two things that do not scale automatically: first-load bytes and content quality.

### Request path

1. Edge serves the static HTML for `/<slug>` with COOP/COEP, security headers and a short `s-maxage` plus `stale-while-revalidate` so deploys propagate within a minute without cold misses.
2. The document contains the full prose, breadcrumb JSON-LD and the drop zone. It is usable before any JavaScript runs: the file input is a native `<label>`/`<input>`.
3. The stage hydrates (tool pages < 350 KB gzipped in total, ADR-0107; engine UI loads with the first file, ADR-0030). Capability probes run once per session and are cached in memory.
4. A file drop triggers the lazy load of the selected backend from `/wasm/` or the module graph. Loading progress is shown honestly in bytes.
5. Processing runs in a dedicated Worker with transferable buffers or OPFS handles. The main thread only renders progress.
6. The result is a Blob or OPFS handle; download uses the File System Access API where available.
7. Scratch storage is deleted on completion, cancel and `pagehide`.

No request in this path carries user content to any origin. `pnpm lint:privacy` and an E2E network assertion enforce it.

### Degradation ladder

Every tool declares an ordered list of backends. The runtime walks it and tells the user which rung is running. Failure at a rung never produces a broken page; it produces a specific sentence and the next option.

| Rung | Condition probed | Fallback when absent |
|---|---|---|
| WebCodecs + mediabunny | `VideoEncoder.isConfigSupported` for the target codec; `VideoDecoder` for the source | ffmpeg.wasm |
| ffmpeg.wasm multithread | `crossOriginIsolated === true` and `SharedArrayBuffer` | ffmpeg.wasm single thread (slower; say so) |
| ffmpeg.wasm single thread | `WebAssembly` present, enough memory | "This file is too large for this browser" plus a suggestion (desktop Chrome) |
| Canvas/WebGPU/JS | `navigator.gpu` for STT and heavy filters | WASM CPU path with a time estimate up front |
| Server (Phase 2) | User consented for this file | Nothing; the tool explains what it cannot do |

Browser tiers are in [Tech stack](#tech-stack). Unsupported browsers get a plain message, never a spinner.

### Failure handling

Engines fail in five classified ways, and the UI copy is written per class, not per exception:

| Class | Example | User sees | Recovery |
|---|---|---|---|
| `unsupported-input` | codec the browser cannot decode | what the file is and one alternative tool | Try another tool |
| `unsupported-output` | HEVC encode unavailable | the nearest supported codec, preselected | Continue with H.264 |
| `resource` | out of memory, OPFS quota | the limit hit and a concrete suggestion | Smaller file, another browser |
| `cancelled` | user pressed Cancel or Escape | nothing; the stage returns to Ready within 1 s | none needed |
| `internal` | a bug | two sentences: what happened, what to do | Try again, Start over |

Rules: never swallow an error into a generic "Something went wrong"; always free memory and OPFS on any exit path; a failed job never blocks the other items in a batch queue; the error class, engine id and backend (never file names or content) are the only fields an error report may carry.

### Caching and delivery

- HTML: `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`; deploys are immutable and atomic (Vercel), so rollback is re-pointing to the previous deployment.
- Hashed JS/CSS: `immutable, max-age=31536000`.
- `/wasm/*` and `/models/*`: `immutable, max-age=31536000`, `Cross-Origin-Resource-Policy: same-origin`. A new engine version is a new path, never an overwrite.
- Service worker (Phase 2 PWA): precache the shell and the engines a user has already used; never precache 30 MB unprompted.
- Fonts self-hosted with `size-adjust` fallbacks; no third-party origins anywhere.

### Observability without personal data

- Product analytics: Plausible or Umami, self-hosted or proxied first-party, cookieless, aggregate only, honours DNT.
- Per-tool quality metrics, all counts with no identifiers: `tool_started`, `tool_completed`, `tool_failed{class,engine,backend}`, `tool_cancelled`, processing duration bucket, input size bucket, backend used. Completion rate (drop → download) is the primary product KPI.
- Web Vitals: LCP, INP, CLS sampled from the field and sent to our own endpoint; alert when p75 crosses budget on any page family.
- Errors: no third-party error SDK in Phase 1. If one is added later it is opt-in, scrubs paths and file names, and is recorded in `DECISIONS.md`.
- Server path (Phase 2): structured logs with an allowlist of fields (`bytes_in`, `bytes_out`, `duration_ms`, `engine`, `status`); no request bodies, no file names.

### Security posture

- Cross-origin isolation (COOP `same-origin`, COEP `require-corp`) sitewide; strict `Permissions-Policy`; `X-Frame-Options: DENY`; `nosniff`. A Content Security Policy with nonces is a Phase 1 exit criterion (blocked today only by inline JSON-LD, which moves to a nonce).
- No accounts and no secrets in the client; first-party cookies and storage are allowed (ADR-0128). Environment variables are public by construction.
- Dependencies: pinned via lockfile, Dependabot weekly, `pnpm audit` in CI as a warning, blocking on high severity for runtime dependencies.
- WASM and model binaries are served from our origin with integrity checked by content hash in the path.
- The server path, when it exists, runs on a separate origin with its own consent gate, size and rate limits, tmpfs storage and a 60-minute reaper.

### Data model

The registry is the single source of truth. A `ToolDefinition` produces the route, metadata, JSON-LD, prose, hub entries, related links, sitemap entry and the stage's accepted inputs and presets. Engines are pure functions of (input, options) with a declared options schema. Nothing about a tool is stored anywhere else. This is what makes hundreds of pages maintainable by a small team and is why "add a route for X" is always the wrong answer.

### Build and release

- Trunk-based development on `main`; short-lived branches; squash merges.
- Every PR gets a preview deployment and must pass `pnpm check`, the Playwright smoke test and Lighthouse CI on a sample of pages (the full Playwright suite runs locally, see [Engineering workflow](#engineering-workflow)).
- `main` deploys to production automatically after CI. Rollback is instant (previous immutable deployment). No long-lived staging environment.
- Feature gating is done in the registry (`status` and `phase` fields), not with runtime flags; a tool that is not ready is not in the sitemap and not linked.
- Versioning: the site is continuously deployed; engines carry a version string, kept with the ffmpeg command in each result for support conversations (neither is shown in the interface).

### Performance budgets

See the table in [Architecture](#architecture). Budgets are enforced by Lighthouse CI thresholds and a bundle-size check on the first-load chunk; a regression fails the PR.

### Internationalisation at scale

Routing is locale-aware from the first commit (`/[locale]/[slug]`, English unprefixed). Locales ship only with properly translated format profiles, because O(N) profiles compose into O(N²) pair pages and machine-translating pages wholesale is the exact behaviour Google's scaled-content policy names. Sitemaps are sharded per locale so indexation is observable per locale.

### Engineering principles

1. **One source of truth per fact.** Tokens in `tokens.css`, tools in the registry, decisions in `DECISIONS.md`, state in `PROGRESS.md`.
2. **Mechanise every rule you can.** A rule that only lives in prose will be broken. Copy, registry, privacy and docs rules all have a lint.
3. **Real numbers or none.** Real progress, real sizes, real dates on platform limits.
4. **Fail specifically.** Every failure class has its own sentence and its own recovery.
5. **Nothing heavy before intent.** No engine bytes before a file is chosen.
6. **Prefer deletion.** Remove what does not carry information; this applies to UI, copy, dependencies and docs.
7. **Decide once, write it down.** Anything that changes architecture, licensing, privacy or SEO posture gets an ADR before or with the change.

---

## Tech stack

Decisions here are final for Phase 1. Alternatives considered are recorded in `DECISIONS.md`. Versions checked against the npm registry on 2026-09-02.

### Summary

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | **Next.js** (App Router) | 16.4 | Static pre-rendering of hundreds of pages, Metadata API, `sitemap.ts`/`robots.ts`, typed routes, `next/font`, first-class Vercel deploy, custom headers for COOP/COEP. Astro was the runner-up (ADR-0002). |
| UI | **React** | 19.2 | Ecosystem for the primitives we chose. |
| Language | **TypeScript** strict | 5.9 | `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. |
| Styling | **Tailwind CSS v4** with `@theme` tokens | 4.3 | Tokens in CSS, no config file, `initial` resets used to *delete* the chromatic palette so hue cannot leak in. |
| Primitives | **Base UI** (`@base-ui/react`) | 1.7 | Unstyled, accessible, exposes `--transform-origin` for anchored motion. Not shadcn defaults. |
| Motion | **motion** (`motion/react`) + CSS transitions | 13.x | Springs, layout, gestures where CSS cannot. Rules in `.claude/skills/animate`. |
| Icons | **lucide-react** at stroke 1.5 + custom tool glyphs | 1.39 | One weight, one style. |
| Fonts | **Geist Sans / Geist Mono** via `geist` package | 1.7 | Neutral grotesque with tabular figures and optical sizing; self-hosted; no layout shift. |
| Theme | **next-themes** (`data-theme`) | 0.4 | No flash; system default. |
| i18n | **next-intl** | 4.14 | Locale routing `as-needed` (English has no prefix), `hreflang` via `alternates`, static params per locale. |
| Validation | **zod** | 4.6 | Registry schema, engine options. |
| Structured data | **schema-dts** | 2.0 | Typed JSON-LD. |
| State | **zustand** | 5.x | Job queue / batch state on the client. |
| Media engine 1 | **mediabunny** | 1.55 | WebCodecs-based read/write/convert for MP4, WebM, MKV, MOV, MP3, WAV, OGG, etc. MPL-2.0. Fastest path; hardware encode via browser. |
| Media engine 2 | **@ffmpeg/ffmpeg** + **@ffmpeg/core-mt** (copied to `public/wasm/ffmpeg/<version>/` by `scripts/copy-wasm.mjs` on install and build; not committed) | 0.12.15 / 0.12.10 | Universal fallback: legacy formats (WMV, FLV, RMVB…), filters (vidstab, delogo, loudnorm), codecs the browser cannot encode. Needs SharedArrayBuffer → COOP/COEP. Default core is GPL (x264/x265); ship the GPL build and comply, or build an LGPL core without x264 for the default path (ADR-0004). |
| GIF | **gifenc** | 1.0 | Fast palette quantisation; ffmpeg `palettegen` path for "best quality". |
| Face finding | **YuNet** 2026may (OpenCV Zoo, MIT) on our own **WebGL 2 inference kit** (`src/tools/engines/vision/`) | model 2026may | Find faces on `blur-video` (ADR-0113 to ADR-0117). 53,104 weights converted offline (`scripts/vision/onnx_to_vision.py`) to one half-float file, `public/models/yunet/yunet-2026may.vnn`, 121,536 B (102,751 B gzip), self-hosted with its licence, fetched only when Find faces is pressed. Six fragment-shader kernels, about 9 kB of script in the face worker; no onnxruntime-web, no MediaPipe. Parity with the official ONNX model is tested per layer. Reusable for other small convolutional models. |
| Person segmentation | **MediaPipe Selfie Segmentation** TF.js graph models (Apache-2.0) on **TensorFlow.js** `@tensorflow/tfjs-core`, `tfjs-backend-webgl`, `tfjs-converter` (Apache-2.0) | 4.22.0 | Background tools (ADR-0118 to ADR-0122). Models self-hosted under `public/models/selfie-segmenter/` (general 332,432 B, landscape 336,175 B, one fetched per video by its shape), loaded only after a video is chosen on those pages; the runtime is a chunk of the engine and preview workers with only the WebGL kernels the graph uses registered (about 155 kB gzip, 128 kB brotli). No eval, no remote URL: model files are handed to TF.js from memory. Outside the pick-ui-library list (not UI). A later round may move the model onto the YuNet WebGL kit. |
| Speech noise removal | **RNNoise** 0.2 (Xiph, BSD-3-Clause) as WebAssembly from **@jitsi/rnnoise-wasm** (Apache-2.0) | 0.2 / 0.2.1 | `remove-background-noise` (ADR-0108). The module inlined in the package's `rnnoise-sync.js`, extracted unchanged by `scripts/models/extract-rnnoise.mjs` to `public/models/rnnoise/rnnoise-0.2.wasm` (1,440,118 B, 1,202,973 B gzip, SHA-256 checked on load), fetched only after a file is chosen. Our wrapper (`src/tools/engines/sound/dsp/rnnoise.ts`, a few kB) resamples, aligns and mixes; no Emscripten glue ships. Not an npm dependency. |
| Speech detection | **Silero VAD** 6.2.3 16 kHz (MIT) on our own forward pass (`src/tools/engines/sound/dsp/silero-vad.ts`) | 6.2.3 | Pauses found by speech in remove silence and the Shorts clip finder (ADR-0109, ADR-0110). Official TorchScript weights written as float16 by `scripts/models/export-silero-vad.py` to `public/models/silero-vad/silero-vad-16k-6.2.3-f16.safetensors` (620,466 B, 576,662 B gzip, SHA-256 checked on load), fetched only after a file is chosen. Matches the official ONNX model on ≥ 99.89% of frames; no onnxruntime-web. Not an npm dependency. |
| Large files | **OPFS** | native | Sync access handles in workers; avoids holding multi-GB files in memory. |
| Lint/format | **Biome** | 2.5 | Single tool, fast, a11y rules on. No ESLint/Prettier. |
| Unit tests | **Vitest** | 4.x | Registry, pure helpers, engine option math. |
| E2E | **Playwright** + axe | 1.62 | Every tool page: renders, JSON-LD present, zero axe violations, keyboard path. Real media processing E2E on Chromium with fixture files. |
| Performance budgets | **@lhci/cli** (Lighthouse CI) | 0.15 | `pnpm lhci` after a build: home, a hub and three tool pages, mobile emulation, budgets from [Design principles](#design-principles) §5 and [Architecture](#architecture) §6. Reports stay on disk (`.lighthouseci/`); nothing is uploaded. Dev only, Apache-2.0. Outside the pick-ui-library list, which covers runtime UI only. |
| Package manager | **pnpm** | 11 | |
| Hosting | **Vercel** (static + edge headers) | | Static output for all tool pages; ISR unnecessary. Cloudflare Pages is the fallback if Vercel bandwidth cost grows; both allow custom headers. |
| Analytics | **Plausible** or **Umami** (self-hosted), cookieless, proxied first-party | | No consent banner needed. Also compatible with COEP if served from our origin. |
| Server fallback | None (ADR-0024) | | On-device only. |

### Browser support policy

- **Tier 1** (full WebCodecs path): Chrome/Edge 110+, Safari 17.4+ (desktop and iOS), Firefox 130+ desktop.
- **Tier 2** (ffmpeg.wasm path only, slower): Firefox for Android, older Safari.
- **Unsupported**: anything without WebAssembly. We show a plain message, never a broken tool.
- Backend choice happens per run: the engine worker asks each engine's `supports(backend, input, options)` in backend order and uses the first that says yes; engines probe the exact configuration they will use (ADR-0054, ADR-0139). The interface does not name the path (ADR-0149).

### Key constraints the stack imposes

1. **COOP/COEP on every page** for `SharedArrayBuffer`. `Cross-Origin-Embedder-Policy: require-corp`: Safari does not support `credentialless`, and everything the site loads is same-origin, which `require-corp` allows without a CORP header. Anything from another origin must send CORP or it is blocked. This rules out most ad networks and third-party embeds, which we do not want anyway (ADR-0005/0006).
2. **WASM memory**: 32-bit ffmpeg.wasm tops out at ~2–4 GB addressable; very large inputs stream through OPFS and are processed in chunks, or fall back to WebCodecs where memory is per-frame.
3. **Static build size**: hundreds of pages × locales is fine; JSON-LD and prose come from the registry at build time. Heavy engine bundles are code-split and loaded only after a file is dropped.
4. **Fonts**: one family, subset, `display: swap` with size-adjusted fallback to avoid CLS.

---

## Design principles

> The site should feel like a tool Apple would ship if Apple made a website of video utilities. Quiet, exact, confident. Nothing decorative. Everything earns its place.

This document is normative. Every UI decision is checked against it. When a rule here conflicts with a convenience, the rule wins.

---

### 0. The one-line brief

**A file drops in. A file comes out. Everything between those two moments is invisible or essential.**

The user is not here to admire the site. They are here because a video is the wrong size, format, length or shape. Our job is to make the fix feel effortless and then get out of the way.

---

### 1. Principles

#### 1.1 Neutral by conviction, one accent by decision

The palette is warm neutral: an off-white ground, white surfaces, a deep green-black ink, and exactly one accent slot (ADR-0009). No blue links. No green success or red error as colour alone.

- Hierarchy is carried by **value** (lightness), **weight**, **size** and **space**, never by hue.
- State is carried by **shape, motion, icon and copy**. A success state is a check icon drawing itself in, not a green box. An error is a firm sentence, a small icon, and a subtle shake of the affected control, not a red banner.
- The **accent** appears in at most three places per screen: the primary action, real progress, and one navigational link. Today the accent is the ink itself, so the chrome carries no hue; if a hue is ever chosen it changes in one token and the three-places rule still holds.
- The **destructive** action may use a desaturated red on hover/confirm only, and the **focus ring** uses the accent at full contrast.
- Photography and the user's own video content provide all the other colour the page will ever need. The chrome must stay out of its way.

Why: colour is the fastest tell of a template. Keeping it to one deliberate slot forces every other decision (type, spacing, motion) to be right, because there is nothing to hide behind.

#### 1.2 Typography is the interface

- One typeface family for everything: a neutral grotesque with real optical sizing and tabular figures (see design system). No display font, no second family, no gradient text.
- Sizes come from a fixed scale. Never invent a size.
- Headlines are set tight (negative tracking), body is set default, small labels are set slightly loose. Never the reverse.
- Text is left-aligned. Center alignment is allowed only for a single short line (a page title, an empty state) and never for paragraphs.
- Numbers that change (file size, duration, progress) use tabular figures so they do not jitter.
- Line length for prose is capped at ~65–75 characters.

#### 1.3 Space is structure

- All spacing is on a 4px grid. Component internals use 4/8/12/16. Layout uses 24/32/48/64/96/128.
- Prefer whitespace over dividers. Prefer dividers over borders. Prefer borders over shadows. Prefer one shadow over a card-in-a-card.
- No nested cards. A surface may sit on the page; a surface may not sit on another surface.
- Density is medium-low on marketing pages and medium on the tool workspace. Both use the same grid.

#### 1.4 Motion is physics, not decoration

- Every animation communicates a state change or a spatial relationship. If removing it loses no information, remove it.
- Enter and exit are asymmetric in duration: enter 200–300ms, exit 120–180ms, both ease-out. Things leave the screen faster than they arrive.
- Durations are short. Nothing on the page takes longer than 400ms unless it is tied to real progress.
- Use the project's easing tokens only (see design system §6.2). Never `linear` for movement, never `ease-in` on UI.
- Respect `prefers-reduced-motion`: motion collapses to opacity-only or instant.
- Progress is honest. A progress bar reflects real work (frames processed / total). Indeterminate spinners are a last resort and never appear for more than ~2 seconds without an explanation.
- Hover states change one property (usually background value by one step). Not two, not three.
- No scroll-jacking and no parallax. Subtle entrance and reveal-once motion is allowed within ADR-0153's budgets: tokens only, transform/opacity, once per element, never scroll-linked, CLS 0 and LCP unchanged.

#### 1.5 The workspace is a single stage

Each tool page has one primary surface: the **stage**. Before a file is added, the stage is the drop zone. After, it becomes the preview and controls. The URL does not change. Nothing navigates away. The user never loses their place.

- One primary action per screen state. It is the only high-contrast button visible.
- Secondary actions are text or ghost buttons.
- Controls sit beside the preview on desktop and below it on mobile. They never cover the preview.
- Options have sensible defaults chosen so that pressing the primary action immediately, without touching anything, produces a good result.

#### 1.6 Say less, mean it

- Headlines are plain: "Compress video." not "Shrink your videos in seconds with our AI-powered compressor!"
- No exclamation marks in UI copy. No emoji in UI copy.
- No marketing adjectives on tool pages: "powerful", "seamless", "blazing", "AI-powered", "ultimate" are banned.
- Say what happens: "Re-encoded to H.264, sound copied" beats "100% secure and private!!!" Privacy is stated in the policy, the about page and once on home, never repeated in the interface (ADR-0149).
- Error copy states what went wrong and what to do next, in that order, in one or two sentences.
- Buttons are verbs: "Compress", "Download", "Start over". Never "Submit", "OK", "Go".
- Sentence case everywhere. Title Case only for the product name.

#### 1.7 Honest about the machine

- If processing happens on the device, say so, once, near the action.
- If a file would need the server (too large, unsupported codec), say so before uploading and let the user decide.
- Show real numbers: estimated output size, actual output size, time elapsed. Never round to make it look better.
- If a tool cannot do something well in the browser (e.g. HEVC encode), we do not pretend. We offer the nearest good option.

#### 1.8 Instant, then fast

- Tool pages are static HTML. The drop zone is interactive before any processing code downloads.
- Heavy code (codecs, WASM) loads only after a file is added, and shows a small honest indicator while doing so.
- Time to first useful interaction under 1 second on a mid-range phone on 4G.
- Core Web Vitals are a design constraint, not an afterthought: no layout shift, INP under 200ms, LCP under 2.5s on every page.

#### 1.9 Mobile is a first-class device, not a breakpoint

- Half of video files people need to fix are on their phone. Every tool works one-handed on a 375px-wide screen.
- Tap targets are at least 44×44px.
- The file picker opens the native picker; drag-and-drop is a desktop bonus.
- Sliders and range inputs are large, with numeric inputs beside them for precision.

#### 1.10 Accessible by construction

- Contrast: all text meets WCAG AA (4.5:1). Large headings meet 3:1. This is easy in grayscale; do not break it with light-gray-on-white "subtle" text below 4.5:1.
- Everything is keyboard operable. Focus is always visible (2px ring in foreground color, 2px offset).
- All icon-only buttons have labels. All progress has `aria-live` announcements at sensible intervals.
- Never disable a button without explaining why (tooltip or inline text).

---

### 2. Anti-patterns (the "vibe-coded" tells)

The following are banned. Their presence in a PR is a rejection.

| Tell | Why it reads as generic |
|---|---|
| Purple/indigo/violet gradients, gradient text, gradient borders | Default of every AI-generated landing page 2023–2026 (a ramp that draws the output itself, such as a fade to black on a timeline, is data, not decoration) |
| Glassmorphism / `backdrop-blur` cards on colored blobs | Same |
| Emoji as icons or in headings | Reads as unfinished |
| Three-column "feature cards" with an icon in a colored circle | Template pattern |
| Rounded-2xl everything; radius larger than 12px on containers | Toy-like |
| Drop shadows with visible color or large blur on every card | Muddy, non-committal |
| "Trusted by 10,000+ users" social proof strips with fake logos | Dishonest |
| Rotating testimonials carousel | Nobody reads them |
| Animated gradient background blobs | Decoration with no meaning |
| Hero with a mock browser window screenshot at an angle | Template |
| Typing/typewriter animations, count-up numbers on scroll | Decoration with no meaning |
| Marketing exclamation marks, "🚀", "✨" | Tone |
| Default shadcn/ui look left untouched (slate palette, default radius, default shadows) | Recognizable instantly |
| Inter at default tracking for headlines | The most default typographic choice on the web; fine for body, must be tuned for display |
| Toast notifications for every action | Noise. Toasts are for background events only |
| Cookie banners, newsletter modals, exit-intent popups | We do not use cookies that need consent. We do not interrupt |
| Skeleton loaders shimmering for content that is static | Static content is static; it does not load |
| "Powered by AI" badges | Nobody cares how; they care that it worked |

---

### 3. References we hold ourselves to

Study these, not to copy, but to calibrate what "finished" feels like:

- **apple.com** product pages: type scale, whitespace, restraint, how a single high-contrast button carries a whole section.
- **Linear** (linear.app): monochrome-first UI, motion discipline, keyboard-first.
- **Vercel** dashboard and geist design system: grayscale scales, borders over shadows, typography hierarchy.
- **Raycast** website: dark-monochrome polish, motion that communicates.
- **Emil Kowalski's work** (Sonner, Vaul, animations.dev): easing, duration, and the discipline of animating one property. His skills are imported into `.claude/skills/` and are mandatory reading before touching any interaction.
- **iA Writer**, **Things 3**: how few controls a tool can have and still feel complete.
- **Handbrake / ffmpeg documentation**: honesty about what the machine is doing.

---

### 4. Decision procedure

When unsure whether something belongs:

1. Does removing it lose information the user needs to complete the task? If no, remove it.
2. Can the same information be carried by type, space or one icon instead of color, a box or an animation? If yes, do that.
3. Would this look at home on an Apple product page? If no, redo it.
4. Would a senior designer at Linear or Vercel be able to tell this was generated? If yes, redo it.

---

### 5. Definition of done for any UI

- [ ] Uses only tokens from the design system (no raw hex, no arbitrary spacing, no arbitrary font sizes).
- [ ] No colour outside the semantic tokens; the accent appears in at most three places per screen; destructive hover and focus ring are the only other hue.
- [ ] Works at 375px, 768px, 1280px and 1920px with no horizontal scroll.
- [ ] Keyboard-operable end to end, visible focus, labelled controls.
- [ ] Every animation has a stated purpose and respects reduced motion.
- [ ] Copy passes the banned-words check (see `README.md#content-guidelines`).
- [ ] Lighthouse: Performance ≥ 95, Accessibility 100, SEO 100, Best Practices 100 on the production build.
- [ ] Reviewed against the anti-pattern table.

---

## Design system

Concrete tokens and component rules that implement [Design principles](#design-principles). Tokens live in code at `src/styles/tokens.css` (Tailwind v4 `@theme`). This document is the source of truth; code mirrors it.

---

### 1. Color

Warm neutral with one accent (ADR-0009). Two themes (light, dark). Components reference **semantic** tokens only. Do not use Tailwind's `slate`/`zinc`/`stone` or any chromatic palette; they are disabled in `tokens.css`.

#### 1.1 Semantic tokens

Values are OKLCH. Chroma is near zero everywhere except the accent slot and `destructive`.

| Semantic | Light | Dark | Use |
|---|---|---|---|
| `bg` | `oklch(97.5% 0.006 90)` | `oklch(17% 0.008 80)` | Page ground (warm off-white / warm near-black) |
| `bg-subtle` | `oklch(95% 0.009 85)` | `oklch(21% 0.009 80)` | Blurb cards, illustration wells, hover on ground |
| `bg-raised` | `oklch(100% 0 0)` | `oklch(25% 0.01 80)` | Cards, inputs, popovers (white on beige) |
| `bg-stage` | `oklch(20% 0.012 165)` | `oklch(10% 0.006 80)` | Video preview stage, always dark |
| `fg` | `oklch(22% 0.02 165)` | `oklch(95% 0.008 90)` | Headlines, body, ink |
| `fg-muted` | `oklch(50% 0.015 120)` | `oklch(68% 0.012 90)` | Secondary text (AA on `bg` and `bg-raised`) |
| `fg-subtle` | `oklch(68% 0.012 100)` | `oklch(52% 0.01 90)` | Decorative only; fails AA |
| `border` | `oklch(90% 0.01 85)` | `oklch(29% 0.01 80)` | Hairlines, card edges |
| `border-strong` | `oklch(84% 0.012 85)` | `oklch(36% 0.01 80)` | Hover borders, slider tracks |
| `accent` | `= fg` (ink) | `= fg` | Primary button fill, progress, one link. The single accent slot. |
| `accent-hover` | `oklch(30% 0.02 165)` | `oklch(88% 0.01 90)` | Primary button hover |
| `accent-fg` | `oklch(100% 0 0)` | `= bg` | Text on accent |
| `ring` | `= accent` | `= accent` | Focus ring |
| `destructive` | `oklch(55% 0.16 25)` | `oklch(70% 0.14 25)` | Only on hover/confirm of destructive actions |
| `overlay` | `oklch(20% 0.01 90 / 0.4)` | `oklch(10% 0.005 80 / 0.6)` | Scrim behind dialogs |

Rules:
- The accent is one token. Changing the brand accent later is a one-line change in `globals.css` plus a contrast check of `accent-fg`.
- The accent appears in at most three places per screen: primary action, real progress, one navigational link. Never for decoration, icons at rest, or section headings.
- `destructive` may not be used for anything except delete/remove/discard affordances, and only on hover or in the confirm step.
- Success and error are communicated with icons, copy and motion, never colour.
- Never use opacity on text to make it muted. Use `fg-muted`.
- The `gray-*` ramp in `tokens.css` remains available for the video stage's own controls (time, scrubber) where the surface is always dark; components never use it for chrome.

#### 1.2 Surfaces

Three surfaces, in order: ground (`bg`), well (`bg-subtle`, sits on the ground for blurbs and illustration areas), card (`bg-raised`, white, sits on the ground with elevation 1 or 2). A well may sit inside a card (illustration area); a card never sits inside a card.

#### 1.3 Theme switching

- **Light only for now (ADR-0010).** The layout forces `data-theme="light"`; there is no toggle in the header. The dark token set stays defined in `globals.css` so dark mode can be re-enabled in one place once it has been designed and reviewed properly.
- When dark ships, both themes must pass the same contrast tests. The video stage is dark in both.

---

### 2. Typography

#### 2.1 Families

| Role | Font | Fallback | Notes |
|---|---|---|---|
| UI + prose | **Geist** (variable) or **Inter** (variable, with `ss01`, `cv11`, tabular nums enabled) | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif` | Self-hosted via `next/font`. One family only. Decision recorded in ADR-0003. |
| Numeric/technical | same family, `font-variant-numeric: tabular-nums` | | Durations, sizes, timestamps, progress |
| Mono | **Geist Mono** or system mono | `ui-monospace, "SF Mono", Menlo, monospace` | Code snippets in docs/FAQ only |

Default OpenType features: `"cv11", "ss01", "ss03"` for Inter (single-storey a, open digits); tabular numbers on all numeric UI.

#### 2.2 Scale (rem, fluid where noted)

| Token | Size | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `text-display` | clamp(2.5rem, 2rem + 2.5vw, 4.5rem) | 1.0 | -0.03em | 600 | Home hero only |
| `text-h1` | clamp(2rem, 1.6rem + 1.5vw, 3rem) | 1.1 | -0.025em | 600 | Tool page title |
| `text-h2` | 1.5rem | 1.2 | -0.02em | 600 | Section heading |
| `text-h3` | 1.125rem | 1.35 | -0.01em | 600 | Card / group heading |
| `text-body-lg` | 1.125rem | 1.6 | 0 | 400 | Lead paragraphs |
| `text-body` | 1rem | 1.6 | 0 | 400 | Prose, descriptions |
| `text-sm` | 0.875rem | 1.5 | 0 | 400/500 | UI labels, controls, meta |
| `text-xs` | 0.75rem | 1.4 | 0.01em | 500 | Captions, badges, timestamps |

Weights available: 400, 500, 600. Never 700+ (too heavy for the grotesque at display sizes), never 300 (fails contrast at small sizes).

#### 2.3 Prose

- Max width `65ch` for body; `75ch` for FAQ answers.
- Paragraph spacing: `1em` margin, no first-line indent.
- Links in prose: underlined with `text-decoration-thickness: 1px`, `text-underline-offset: 3px`, same color as text; on hover, the underline color moves to `fg-muted`. Never blue.

---

### 3. Spacing & layout

- Base unit: 4px. Scale: `1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64, 20=80, 24=96, 32=128`.
- Page max width: `1200px` content, `1440px` for the tool stage on very wide screens.
- Gutters: 16px mobile, 24px tablet, 32px+ desktop.
- Section vertical rhythm: 64px mobile, 96px desktop, 128px between major home sections. Tool pages use 64px at every width between the stage, the folded prose and the related tools, in that order, so the page stays short.
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.

---

### 4. Shape

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4px | Checkboxes, small chips, code |
| `radius-md` | 8px | Buttons, inputs, menus |
| `radius-lg` | 12px | Cards, dialogs, drop zone |
| `radius-full` | 9999px | Pills, avatar-less status dots |

Nothing larger than 12px. The video stage itself uses `radius-lg` and clips the video.

Borders: `1px solid border`. No `2px` borders except the focus ring. No dashed borders except where a file can be dropped: the idle drop zone, and secondary drop wells inside the stage (a cover picture, an image for audio to video), 1px dashed `border-strong` with a real button as the keyboard path.

---

### 5. Elevation

Three levels only:

| Level | Treatment | Use |
|---|---|---|
| 0 | none | Almost everything |
| 1 | `1px solid border` | Cards, inputs, tool cards |
| 2 | `0 0 0 1px border, 0 8px 24px -8px rgb(0 0 0 / 0.12)` (light) / `0 0 0 1px border, 0 8px 24px -8px rgb(0 0 0 / 0.6)` (dark) | Popovers, dropdowns, dialogs |

No colored shadows. No `shadow-xl`. No inner shadows except the pressed state of a primary button (`inset 0 1px 0 rgb(255 255 255 / 0.08)` in dark).

---

### 6. Motion

#### 6.1 Durations

| Token | ms | Use |
|---|---|---|
| `dur-instant` | 80 | Hover background, pressed states |
| `dur-fast` | 150 | Exit of small elements, toggles |
| `dur-base` | 220 | Enter of small elements, most transitions |
| `dur-slow` | 320 | Dialog/sheet enter, stage transitions |
| `dur-slower` | 480 | Only for large layout transitions (drop zone → workspace) |

#### 6.2 Easings

These are the exact values used throughout the imported animation skills (`.claude/skills/animate`, `review-animations`, `apple-design`). Never hand-roll a different bezier.

| Token | Curve | Use |
|---|---|---|
| `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything entering **or leaving** (exits use the same curve, shorter duration) |
| `ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Anything moving that stays on screen |
| `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets and drawers (iOS curve) |
| `ease` (CSS default) | `ease` | Hover colour/background changes only |
| `linear` | `linear` | Progress fills and anything tied to real progress; never for movement |
| `spring` | Motion: `{ type: "spring", duration: 0.5, bounce: 0.2 }` (Apple form). Bounce 0 except when a gesture carried momentum. | Drag, sheet gestures, layout shifts |

`ease-in` is never used on UI.

#### 6.3 Rules

- Animate `transform` and `opacity`; `clip-path` is the sanctioned third. Animating `height` is tolerated only for accordions. Never `transition: all`.
- Every pressable has `:active { transform: scale(0.97) }` at 100–160ms. Nothing enters from `scale(0)`; start at 0.95–0.97 with opacity 0.
- Popovers/menus/tooltips set `transform-origin` to their anchor. Dialogs stay centred.
- Keyboard-initiated actions do not animate. Actions performed 100+ times a day (scrubbing, play/pause) do not animate: 1:1 pointer tracking only.
- Exit is always faster than enter. One exception: feedback that confirms an input (the "+5 s" seek label on the preview) appears at once and fades out at `dur-fast`, because an entrance there would delay the answer.
- Stagger children at 20–30ms, capped at 6 items. Beyond that, animate as a group.
- `prefers-reduced-motion: reduce`: movement collapses to opacity fades at `dur-fast`; nothing translates or scales. Hover effects are gated behind `@media (hover: hover) and (pointer: fine)`.
- Sections below the fold may reveal once as they enter the viewport (opacity plus up to 8px, `dur-base`, one shared observer; ADR-0153). Never scroll-linked, never repeated on scroll back.
- Initial page load: one staggered entrance of the header block and the stage (30–60ms steps, `dur-base` at most), measured so LCP does not move. Cross-page transitions use the View Transitions API where the browser has it.
- One arrival vocabulary (ADR-0157): fade in while rising `--motion-rise` (8px) at `dur-base`, `ease-out`. Utilities in `tokens.css`: `enter-N` (the page entrance, `--motion-step` apart; the H1 and its lead stay still, so LCP stays at first paint), `card-lift`, `arrive`/`arrive-N` (blocks that appear after a state change, from `@starting-style`), `fold` (disclosure height where supported), `data-reveal` (reveal once, `components/layout/reveal.tsx`). Page changes: ADR-0158. Search opens animated only from a pointer: ADR-0159.

#### 6.4 Signature moments (the only "delight" we allow, each tied to a real event)

1. **File accepted**: the dashed drop zone border becomes solid and the zone scales 1.0→0.98→1.0 (`spring`) as the file card slides in. Communicates "I have it".
2. **Processing**: a thin 2px progress line at the top of the stage, honest to real progress. Frame count ticks in tabular figures.
3. **Done**: the progress line completes, the output card fades in, the check icon draws its path (SVG stroke-dashoffset, 300ms). The primary button becomes "Download".
4. **Download started**: the button's label swaps to "Saved" with a small vertical text slide, then back after 1.5s.

That is the whole list. Add to it only via a design review.

---

### 7. Iconography and illustration

- **Lucide** icons, 20px in UI and 16px inline, `stroke-width: 1.5`. One weight, one style.
- Icons are always paired with a label or an `aria-label`.
- Tool glyphs (24px, used in breadcrumbs, the command palette and the file card) are custom: 1.5 stroke, monoline, drawn on the same grid, stored in `src/components/icons/tools/`. They depict the operation (a film strip being cut, two frames merging), never a generic "video" glyph repeated 200 times.
- No filled icons except the state check/x inside a `radius-full` badge.

#### 7.1 Tool illustrations

Every tool card carries a monochrome vector illustration of the operation (ADR-0008). They are the visual identity of the product and follow the same discipline as everything else.

| Rule | Value |
|---|---|
| Format | Inline SVG React components in `src/components/illustrations/tools/`, one per engine, plus a per-tool drawing for every page that shares an engine with a sibling. Generated families use `<family>:<arg>` ids (`video-pair:mov:mp4`, `compress-cap:8`, `resize-for:<platform>`) whose drawings print the args with the stroke alphabet in `glyphs.ts` (ADR-0156). |
| Uniqueness | No two tool pages share an illustration; `tests/unit/site-shell.test.ts` enforces it. |
| Canvas | `viewBox="0 0 240 160"` (3:2). Drawn on a 4px grid. |
| Stroke | 1.5 at 240px wide, monoline, round joins and caps, matching the glyphs and Lucide. |
| Colour | Two values only: `currentColor` for the subject (inherits `fg`) and `var(--color-fg-muted)` for context lines; optional flat fills with `var(--color-bg-raised)`. No gradients, no hue, no shadows. Dark mode is automatic because the values are tokens. |
| Subject | The operation, not the object. Show the change: frames shrinking, a scissors line across a film strip, an audio wave leaving a frame. One idea per illustration. |
| Motion | Static by default. The only sanctioned animation is the signature moments in §6.4; card illustrations do not animate on hover, scroll or load. |
| Reuse | The same SVG is rendered into the per-tool OG image at build time, so the card, the social preview and the page share one picture. |
| Accessibility | `aria-hidden="true"` on the card; the title is the accessible name. |
| Budget | Each illustration ≤ 3 KB of SVG. Home grid illustrations are inlined in the HTML (no image requests, no CLS). |

Reference for the look: Linear's and Vercel's line illustrations, Apple's product-page diagrams. Never clip art, never 3D renders, never coloured blobs.

**Drawing guide** (for a new engine's illustration):

1. **Name the change in one sentence** before drawing: "a GIF's frames become one video with a timeline", "cues move later along the time axis". The picture shows that sentence and nothing else.
2. **Before is muted, after is solid.** The source state uses `MUTED` strokes (dashed `4 6` when it is a container that goes away); the result uses `currentColor`, usually on a `RAISED` fill. A short arrow (`h16` plus an `8 8` head) sits between them when the change is a transformation.
3. **Reuse the vocabulary**: a frame is a `rx="6"` rectangle with a play triangle; a file is a page with a folded corner and text lines; sound is vertical bars; a timeline is a baseline with ticks; a cut is a dashed vertical line (`3 5`). New shapes only when the operation has no existing one.
4. **Grid and weight**: coordinates on the 4px grid inside `viewBox="0 0 240 160"`, 24px margin to the edges, stroke 1.5 from `Frame`, round caps and joins. Filled shapes only for the play triangle or a single highlighted element.
5. **Check** in `/dev/ui` (every illustration at card size), on a card at 390 and 1280, and in its OG image (`/<slug>/opengraph-image`). `tests/unit/site-shell.test.ts` fails if a page has no illustration, an SVG exceeds 3 KB or a colour other than the two tokens appears.
6. **Register** it in `illustrations` and, if it is the engine default, in `engineIllustrations`; a page that needs a different picture sets `illustration` in its registry entry.

---

### 8. Components

Built on **Base UI** (`@base-ui/react`, unstyled, accessible primitives from the Radix/MUI team) with our own styling. We do not use shadcn/ui defaults. Component source lives in `src/components/ui/`.

#### 8.1 Button

| Variant | Fill | Text | Border | Hover | Pressed |
|---|---|---|---|---|---|
| `primary` | `accent` | `accent-fg` | none | fill → gray-800 (light) / gray-200 (dark) | scale 0.97 |
| `secondary` | `bg` | `fg` | `border` | fill → `bg-subtle` | scale 0.97 |
| `ghost` | transparent | `fg` | none | fill → `bg-subtle` | scale 0.97 |
| `quiet` | transparent | `fg` | none | fill → `bg-raised` | scale 0.97 |
| `destructive` | as `secondary` | `fg` | `border` | text & border → `destructive` | scale 0.97 |

`quiet` is `ghost` for controls on a `bg-subtle` surface (list rows, wells), where a `bg-subtle` hover fill would not show.

Sizes: `sm` 32px, `md` 40px, `lg` 48px (the page-level action on tool pages and its Cancel or Start over counterpart). Height fixed; padding `0 12/16/24px`. Radius follows size: `lg` is a pill (`radius-full`), `sm` and `md` are `radius-md`. Never mix radii within one size. Label `text-sm` 500 for sm/md, `text-body` 500 for lg. Loading state: label stays, a 16px spinner replaces the leading icon, button width does not change (min-width lock).

Exactly one `primary` button visible per screen state.

#### 8.2 Drop zone (idle stage)

- Full-width, min-height 320px (desktop) / `--stage-min-h` (80svh, mobile). On phones the drop zone already has the height the working stage keeps, so choosing or dropping a file changes no height (a real picker or drop is not input to layout-shift scoring; ADR-0034). `radius-lg`, 1px dashed `border-strong`, `bg-subtle`.
- Content: 24px upload icon, one line naming the job ("Drop a video to trim it") with **choose a file** inline on fine pointers (the real `<label>` for a hidden input), a full-width "Choose a file" button on touch, then the page's idle choices if it has any. No privacy line (ADR-0149). Accepted formats are in the page copy and the input's `accept`, not in the zone. Centred from md up; on phones the content is anchored to the top (64px down), so the way in and any idle choices stay above the fold on a 667px screen.
- Drag-over: border becomes solid `fg`, background `bg-raised`, `dur-instant`.
- Also accepts paste (Cmd/Ctrl+V of a file) and a "From URL" secondary action where legally sensible.

#### 8.3 Stage (active)

- Left/top: video preview in a `bg-stage` container, `radius-lg`, aspect ratio of the source, letterboxed. Custom minimal controls (play/pause, scrubber, time in tabular nums, mute). Native controls hidden.
- Right/bottom: control panel, max width 360px on desktop. Groups separated by 24px, labelled with `text-xs` uppercase-free labels (we do not uppercase; we use weight 500 + `fg-muted`).
- Sticky footer on mobile with the primary button.
- Done, compare (ADR-0134 to ADR-0137): a picture result gets a Compare toggle in the bar (its word shown from 640 px; pressed toggles keep a fill). The source appears left of a draggable divider (wipe, "Before" and "After" labels) or, when the frame changed shape, beside the result; it is read only when Compare is pressed and kept on the result's frame while playing and scrubbing. "Actual pixels" zooms to one video pixel per CSS pixel on a mouse. A sound result gets a Before/After switch at the same position, matched in loudness unless loudness is the job. Stream copies and results on another timeline show nothing (`compare: false`).

#### 8.4 Inputs

- Height 40px, `radius-md`, `bg-raised`, 1px `border`, `text-sm`. Focus: 2px `ring` offset 2px, border stays.
- Sliders: 4px track `border-strong`, 16px thumb `fg` with 1px `bg` ring; value in a tabular numeric input to the right.
- Segmented control (for presets like 720p / 1080p / Original): pill container `bg-raised`, selected segment `bg` with elevation 1 and a Motion `layoutId` sliding highlight.
- Select: Base UI Select, menu elevation 2, items 36px.

#### 8.5 File card

Appears after a file is accepted. Row: 40px thumbnail (first frame), filename (truncate middle, not end, so extensions stay visible), `fg-muted` meta line "12.4 MB · 1920×1080 · 0:42 · H.264", ghost "Remove" button.

#### 8.6 Result card

Same shape as the file card. Adds an inline "before → after" line: "12.4 MB → 3.1 MB (−75%)" with tabular figures. Primary button "Download". Secondary "Start over". Then a "Then" list of up to three next tools (the page's own next step first), each a quiet link that hands the result on (ADR-0126). Missed results show only the page's own way forward.

#### 8.7 Tool card (home rows, category pages)

Visual first (ADR-0008). The card is an illustration with a caption, not a text block with an icon.

- Container: `radius-lg`, elevation 1, no padding on the illustration area, 16px padding on the caption. The whole card is the link. No arrow icon, no "Learn more".
- Illustration area: fixed 3:2 aspect ratio, `bg-subtle` fill, clipped by the card radius. Holds the tool's monochrome vector illustration (see §7.1), centred, drawn to fill about 60% of the area. Fixed height per breakpoint so the grid never shifts.
- Caption: `text-h3` title (`<Verb> <object>`), which may wrap to two lines, and the `text-sm fg-muted` subtitle shown in full. Nothing is truncated or clamped with an ellipsis: a card that hides half its sentence reads as broken. Cards stretch to the row (`h-full`), so every card in a row has identical dimensions. The subtitle is the page's own (about 60 characters, ≤ 80 schema-enforced) and wraps to at most two lines at the narrowest column.
- Hover (`hover: hover` only): border → `border-strong`, `dur-instant`. The illustration does not move on hover. Any illustrated motion is a design-review decision, not a default.
- Grid (category hubs): 1 column at 375, 2 at 768, 3 from 1024. 24px gap. No fourth column: the content column stops at 1200px, where four cards leave a caption about 240px wide.
- Home rows (ADR-0154; owner, 2026-11-19): each category is one Netflix-style horizontal row of these cards, every standalone tool of the category, the hand-picked lead tools first (`homeLead` in content).
  - Size and bleed: cards are 256px from 640px up and three quarters of the row on phones, so about 1.2 cards show on a phone and never an exact number on desktop. The row runs to both viewport edges; its inline padding and scroll padding (`px-gutter`, `scroll-px-gutter`, tokens.css) keep the first card on the content column, so no container edge cuts a card. 24px gap. Every card in a row is the same height.
  - Edge fades: the row's mask (`row-fade`) dissolves 56px at a side where more cards wait, only while the row can scroll that way, moving at `--duration-fast`, instantly under reduced motion. A mask, not an overlay, so it works on any background.
  - Scrolling: native, with snap (`x mandatory`, each card `start`), contained overscroll, hidden scrollbar. No loop, no auto-play, no cloned cards: the row ends at its last card.
  - Heading: the category on the content column, a quiet "See all" link to the hub on its baseline at the right; no description.
  - Mouse: round previous and next buttons (`chip`, `icon`, 44px, raised surface, hairline border) sit in the fades, centred on the card pictures; each scrolls one view (instantly under reduced motion) and fades out at its end and when the row fits. Touch swipes. Keyboard: each row is one tab stop (roving tabindex, on the card focused last, the first at the start), so Tab moves from row to row; Left and Right move between cards, Home and End go to the first and last, without animation. The personal rows work the same way.
  - Hover lift (amends the one-property hover rule for these cards, with the owner's approval): from a fine pointer, after a 150ms intent delay, the card rises 4px and scales to 1.02 (transform only) and a `shadow-lift` pseudo-element fades in (opacity only); it drops back at once. Keyboard focus gets the same raised state with the ring. The scroller's vertical padding leaves room, so nothing is clipped and neighbours never move. Reduced motion: only the border change.
  - Personal rows: a returning visitor sees "Continue" (recent tools in this browser) and "Because you used <last tool>" (its related standalone tools) first. The category rows always keep the editorial order (visual order equals focus order). Filled before paint from localStorage by an inline script, with no layout shift. Every card is server-rendered, so home links every standalone tool.
- The same card is used on the home rows and category hubs, so one component and one illustration per tool serve both. On a tool page, related tools are name-only pill buttons instead (`buttonVariants` `chip` + `pill`, at least 44px, wrapping, the title may wrap inside a pill but is never truncated), with "All tools" as a quiet link beside the "Related tools" heading (owner, 2026-11-19).

#### 8.8 Dialog / Sheet

- Desktop: Dialog, max-width 480px, elevation 2, `radius-lg`, scale 0.96→1 + opacity, `dur-slow` `ease-out`; exit `dur-fast`.
- Mobile: bottom Sheet (Vaul-style, drag to dismiss), handle 32×4px `border-strong`.
- Used only for: confirming discard, server-fallback consent, keyboard shortcuts help. Never for marketing.

#### 8.9 Toast

- Sonner-style, bottom-center, monochrome, max 1 visible, 4s. Used only for background events (a batch item finished while the user is elsewhere). Never for confirming a click the user just made.

#### 8.10 Navigation

- Header: 56px, `bg` with 1px `border` bottom, wordmark left (text only, `text-h3` 600, tight tracking), "All tools" menu, search (⌘K), theme toggle. No CTA button in the header; the tool is the CTA.
- Command palette (⌘K): every tool searchable by name and by aliases ("shrink", "reduce size" → Compress). This is a primary navigation method on desktop.
- Search: a pill-shaped (`rounded-full`), field-like button in the header from 640px with a pill ⌘K chip (icon only below), ⌘K and /. Desktop gets a palette near the top; phones a full-screen sheet with Cancel. Empty: recent tools (this browser, up to 3, not the current page) then one task per hub; results capped at 8 (6 on phones); no match lists the tasks (ADR-0123). Results lead with the standalone tool; a format pair or preset is a result only when the query names it ("mov to mp4", "under 8 mb", "discord"), and then it may come first (ADR-0154).
- Home: the H1 and lead, then the site search as the hero's primary action: a 56px field-like pill (up to 560px) that opens the palette, or the sheet on phones, with what was typed carried over, beside an "Or choose a file" pill (a file dropped anywhere on the hero works too), which opens the same search with that file's suggestions. No single tool is the hero's action. While the hero's field is on screen the header's search pill is hidden (visibility only, nothing moves) and fades back once the hero scrolls away; other pages keep it. Then the promises and the rows (§8.7): Continue and Because you used for a returning visitor, then one row per category with "See all" to its hub. Hubs are listed in the footer on every page, so home has no separate category list. Hubs: the H1 and one plain line, task chips, then the standalone tools under task headings; the hub's longer text folded in "About these tools" below the tools; format pairs and presets in one closed "All N format pages" disclosure at the bottom (ADR-0154).
- Footer: the category hubs as one plain list, `text-sm`, plus "All tools". Legal links. No newsletter form. No social icons unless we actually post. Tools are reached from home, their hub and related tools, not from a footer on every page (ADR-0127).

---

### 9. Voice in UI (see also [Content guidelines](#content-guidelines))

- Sentence case. No exclamation marks. No emoji.
- Tool title pattern: `<Verb> <object>` — "Compress video", "Convert MOV to MP4", "Extract audio".
- Empty state copy is one sentence. Error copy is two at most.
- Numbers use non-breaking spaces before units: `12.4 MB`, `1920×1080` (real multiplication sign), `0:42`.

---

### 10. Implementation notes

- Tokens are defined once in `src/styles/tokens.css` under Tailwind v4 `@theme`. Components use Tailwind utilities that reference tokens (`bg-bg`, `text-fg-muted`, `rounded-lg`). Arbitrary values (`bg-[#…]`, `p-[13px]`) are lint errors.
- Motion via the `motion` package (formerly Framer Motion) for layout/spring; CSS transitions for hover/pressed.
- All components have a Storybook-free "kitchen sink" route at `/dev/ui` (dev-only, excluded from build) for visual review.
- Every component ships with keyboard tests (Playwright) and an axe check.

---

## Tool page specification

Every tool page is produced from one `ToolDefinition`. This spec fixes the order, behaviour and content rules so that 500 pages feel like one product.

### 0. Before you build: the flow brief

No tool page is built from the engine outward. Write the brief first (in the PR or the session log), and the `tool-builder` agent and `pnpm lint:registry` hold you to it. Pages that fail the brief were built and then deleted on 2026-09-02 (a duplicate "resize" page; a trim page with two number inputs instead of a timeline); do not repeat them.

1. **Distinct job.** What does the user have and what do they want to end up with? If an existing page with the same engine and options already does it, this is not a page. The validator rejects two pages with the same engine and preset options.
2. **Right name.** Use the vocabulary table below. A name that means something else to users (see "resize") is a bug, however good the SEO looks.
3. **Right primary control.** The control matches the data: a time range gets a timeline with a filmstrip and draggable handles, not two number inputs; a size goal gets presets and a target size; geometry gets a visual crop frame on the preview; a format gets the detected source and a target. Number inputs accompany these for precision, they never replace them.
4. **States written out.** Idle, ready, processing, done and error, each with its copy, before code. What is lossless and what re-encodes is stated in the ready state.
5. **Mobile flow.** One-handed at 390px, primary action reachable, 44px targets, drag gestures that do not fight scrolling (`touch-none` on the control).
6. **Scale.** If the page belongs to a family (format pairs, platform presets), it is generated from a library plus a page-specific story, never hand-copied. See the converter model in [SEO strategy](#seo-strategy) §1 and `src/tools/registry/pairs.ts`.

**Vocabulary** (what users mean when they say it):

| Word | Means to users | Our tool |
|---|---|---|
| Compress, shrink, reduce size | make the file smaller; resolution cap is one of the knobs | `compress-video` (presets, target size, resolution) |
| Crop | keep a rectangle of the picture | `crop-video` (frame on the picture) |
| Aspect ratio, 9:16, square, fit | change the frame's shape (bars or fill) | `change-video-aspect-ratio` |
| Resize for TikTok / Reels / Shorts | the shape and size a platform shows full frame | `resize-video-for-<platform>` (aspect-ratio presets, ADR-0019). Never a resolution-only page; no `/resize-video` hub. |
| Convert, change format | make it play somewhere else | `video-converter`, `audio-converter`, `subtitle-converter` and pair pages |
| Trim, cut | keep one time range | `trim-video` with the timeline |
| Split, cut into parts | one video in, several files out | `split-video` |
| Merge, join, combine | several clips in, one file out | `merge-videos` |
| Merge, join, combine audio, MP3 joiner | several audio files in, one audio file out | `merge-audio` (clips with pictures are `merge-videos`) |
| Ringtone, M4R | a short part of a song in the format a phone takes as a ringtone | `ringtone-maker` (a plain cut in the same format is `trim-audio`) |
| Pitch, transpose, change key | a higher or lower key at the same length and tempo | `change-audio-pitch` (speed and pitch together is `change-audio-speed`) |
| Key, BPM, tempo, Camelot | read a song's tempo and key without changing it | `key-bpm-finder` |
| Mute, remove sound | drop audio | `remove-audio-from-video` |
| Add music, add audio, replace audio | put a new sound on a video (mix or swap) | `add-audio-to-video`, `replace-audio-in-video` |
| Shift subtitles, out of sync | move every cue by a fixed time | `shift-subtitle-timing` |
| Fix subtitles | repair overlaps and bad ordering | `fix-subtitle-overlaps` |
| Watermark, logo | put a mark on the picture | `add-watermark-to-video` |
| Freeze frame, hold a frame | stop the picture on one frame for a while | `freeze-frame-video` |
| Zoom, pan, Ken Burns on video | a view that moves over time | `zoom-video` (a fixed rectangle is `crop-video`) |
| Picture in picture, facecam, reaction | a second video in a corner of the first | `picture-in-picture-video` |
| Side by side, split screen, stack two videos | two videos in one frame | `side-by-side-video` (one after another is `merge-videos`) |
| Shorts or Reels clips from a long video | many short vertical clips from one recording | `cut-video-into-shorts` (proposed at pauses and scene changes, reframed; fixed lengths are `split-video`) |
| Blur, pixelate, censor, hide a face or plate | hide part of the picture | `blur-video` (Find faces places and follows a region on each face; a blurred background behind a person is `blur-video-background`) |
| Add image, sticker, overlay a picture | put pictures or stickers on the video, placed and timed | `add-image-to-video` |
| Green screen, chroma key | swap a green or blue screen for another background | `remove-green-screen-from-video` (needs a screen; footage without one is `remove-background-from-video`) |
| Blur background, background blur, portrait mode on video | keep the person sharp and soften the room | `blur-video-background` (person found by a model; hiding one face or plate is `blur-video`) |
| Remove, change or replace the background, virtual background, no green screen | a colour, picture or video behind the person, or the person mask | `remove-background-from-video` (with a green or blue screen, `remove-green-screen-from-video` is sharper) |
| Thumbnail | an image to upload as a video's cover on a site, or the icon a file shows | `video-thumbnail-maker` (image to upload); `change-video-thumbnail` (file icon, verified in macOS Quick Look) |
| Progress bar, time bar, loading bar | a bar on the picture that fills as the video plays | `add-progress-bar-to-video` (a count in numbers is `add-timer-to-video`) |
| Timer, countdown, stopwatch, running clock | numbers on the picture counting up or down with the video | `add-timer-to-video` |
| Intro, outro, title card, end card | something before or after the video, fitted to its frame and rate | `add-intro-to-video` (joining finished clips as they are is `merge-videos`; a fade from black is `fade-video`) |
| Burn in subtitles, hardcode, styled captions | a subtitle file drawn into the picture | `add-subtitles-to-video`, burn mode (no separate burn page, ADR-0069; no word highlight) |
| Stabilise, steady, fix shaky video, deshake | take hand-held shake out of the picture | `stabilize-video` (rolling shutter not corrected; a deliberate moving view is `zoom-video`) |
| Sharpen, make clearer, fix blurry | crisper edges on a slightly soft picture | `sharpen-video` (cannot refocus a badly blurred shot) |
| Denoise, grain, grainy, low light | less grain in the picture | `denoise-video` (picture only; hiss or hum in the sound is not this page) |
| Background noise, noise reduction, clean up audio, hiss, fan noise | a voice without the steady noise behind it | `remove-background-noise` (speech only; music under the voice is not removed; grain in the picture is `denoise-video`) |
| Black bars, letterbox, pillarbox | crop off bars already in the picture | `remove-black-bars-from-video` (adding bars is `change-video-aspect-ratio` or `add-border-to-video`) |
| Bitrate, kb/s, CBR | an exact data rate a spec asks for | `change-video-bitrate` (a smaller file without a number is `compress-video`) |

Spelling: "key frame" (two words) in all user-facing copy; `keyframe` stays in code identifiers. Body copy is British English (colour, normalise). A tool's name (H1 `title` and `metaTitle`) uses the spelling of its slug and primary keyword, so `/normalize-audio` is "Normalize audio": the name matches what people search for and the address they see.

### 1. Anatomy (top to bottom)

1. **Breadcrumb** (visible, small): Home › Category › Tool. `BreadcrumbList` JSON-LD mirrors it.
2. **H1**: `content.title`. `<Verb> <object>`.
3. **Subtitle**: one sentence on what the tool does (no privacy line; privacy is stated in the policy, the about page and once on home, ADR-0149).
4. **Stage** (the tool). Idle = drop zone. Active = preview + controls + progress + result. Fixed min-height so nothing shifts.
5. **What this does**: 2–3 sentences, open by default.
6. **How to use it**: `<ol>` of 3–6 one-sentence steps, folded.
7. **Good to know**: 3–6 paragraphs of specific knowledge, folded. For format pairs, the *remux vs transcode* story, what survives, what is dropped, quality cost. Evidence (measurements, check dates) stays in DECISIONS.md and data files, not on the page.
8. **Questions**: 4–8 Q/A as HTML (`<dl>`), folded. No FAQPage markup dependency.
9. **Related tools**: name-only pill buttons (no captions), 6 standalone tools varied per page (explicit list + same category), with "All tools" as a quiet link beside the heading. Last, after the folded sections, as the closing "where next" (owner, 2026-11-19).
10. **Footer** (global). Converter pages no longer list their pair pages: those are reached from search, their hub's closed "All format pages" disclosure and their siblings (ADR-0154).

Sections 5–8 are native `<details>` rows with the h2 in the summary (`ProseSection`), so the text stays in the HTML for search engines and find-in-page while the page stays short (owner, 2026-11-19).

The LCP element is the H1/subtitle/stage block: server-rendered text, no hero image.

### 2. Stage behaviour

| State | What the user sees | Primary button |
|---|---|---|
| Idle | Drop zone and the page's idle choices | none (the drop zone is the action) |
| Loading engine | File card appears immediately; thin progress line "Loading encoder (12 MB)…" honest to bytes | disabled `<Verb>` with reason |
| Ready | Preview (first frame, scrubber) + options with good defaults + estimate line ("≈ 3.1 MB, about 40 s") | `<Verb>` |
| Processing | Real progress (frames or bytes), phase label, elapsed, Cancel | Cancel (secondary); primary hidden |
| Done | Result card: before → after, Download, Start over, "Send to another tool". The preview plays the result; a changed picture or sound can be compared with the source (ADR-0134) | Download |
| Error | Two-sentence message: what happened, what to do | Try again / Start over |

Rules: URL never changes; no navigation; files never leave memory/OPFS; Cancel frees everything within 1 s; Escape = Cancel while processing.

Ready with a block: a reason an option on the page can clear disables `<Verb>` and says what to change. A block no option can clear (the file's format, a missing track, what this browser can decode; `Blocked.fixable: false`) hides the options, puts the reason (with what to do next) in the status line, and puts one way out in place of the button: the page that can do the job, or "Choose another file". No dead control. A file that already does the job (`settled`) shows that answer as a success with no button (ADR-0141).

### 3. Options panel

- Defaults produce a good result with zero interaction.
- Max ~6 controls visible; the rest under "More options" (disclosure, not a modal).
- Each control has a one-line hint in `fg-muted` explaining the trade-off.
- Presets first (segmented control), fine-grained second.
- Numeric inputs beside sliders, tabular figures.

### 4. Content rules

- Unique per page; enforced by `validate-registry` (no shared paragraph, ≥ 350 words).
- No banned words (`lint-copy`).
- Format pairs use the format-profile library for the two formats and add a pair-specific "what actually happens" paragraph.
- Platform pages state limits with tier and link their sources: "Discord: 10 MB (free), 50 MB (Nitro Basic), 500 MB (Nitro)." The check date stays in `src/content/platforms` (`CHECKED`, the sources' `checked` fields) so we know when to re-verify; it is not shown (ADR-0149).
- Every page links contextually to ≥ 1 sibling tool inside "Good to know".

### 5. Metadata

- `<title>`: `metaTitle · site` (≤ 60). `<meta description>` ≤ 155.
- Canonical self. hreflang in sitemap. OG image generated per tool (monochrome).
- JSON-LD: BreadcrumbList only (plus Organization/WebSite sitewide).

### 6. Definition of done for a new tool page

- [ ] Registry entry validates; `updatedAt` set.
- [ ] Engine has `supports()` probing real capability; `run()` reports real progress; cancellable.
- [ ] Engine integration test with a fixture file passes in Chromium.
- [ ] E2E: renders, H1 correct, zero axe violations, keyboard path to Download.
- [ ] Content reviewed against [Content guidelines](#content-guidelines); specific and true; limits sourced, evidence and check dates kept off the page.
- [ ] Lighthouse budgets met.
- [ ] Design review against anti-pattern table; `review-animations` skill run if motion was added.

---

## Content guidelines

Applies to UI strings, tool page prose, FAQs, blog/guides, metadata. Copy is part of the design. Generic copy is the loudest "vibe-coded" signal after purple gradients.

---

### 1. Voice

Calm, exact, plain. We sound like a competent engineer explaining what will happen, not like a marketer. Think Apple's technical specs page or the Stripe docs, not a product launch email.

- **Direct**: "Compress video." not "Compress your videos easily online for free!"
- **Concrete**: "Reduces a 100 MB phone clip to about 20 MB at 1080p." not "Dramatically reduce file size."
- **Honest**: say only what is true of the code. There is no server path (ADR-0024), and that is stated in the privacy policy, the about page and once in the home page's promises block, never in the interface (ADR-0149): no "on this device", "no upload" or "in your browser" in drop zones, status lines, results, errors, notices or tool subtitles. `metaTitle` and `metaDescription` may say it (search results only), and a FAQ answer may answer "Is my file uploaded?".
- **Evidence stays off the page**: evidence (measurements, test fixtures, check dates) lives in DECISIONS.md, tests and data files, never on the page; pages state what the tool does and its limits. Never overclaim when leaving proof out: state the limit instead ("it can miss faces turned away").
- **No machinery**: name what the user experiences, not how we built it. No WebCodecs, WebGL, worker, canvas, OPFS, ffmpeg.wasm, "fallback engine", TensorFlow or model names in the interface or in page prose: "a small speech model", "a one-time download of about 33 MB", "the browser's own video encoder". FFmpeg may be named as a tool readers would run themselves ("in FFmpeg it is `-c:v copy`"). Library credit is on `/licences`.
- **Unhurried**: no urgency, no "now", no "instantly", no "in seconds" unless we measured it.

### 2. Banned words and patterns

These are lint-checked in `scripts/lint-copy.ts` against `src/content/**` and `src/tools/**`.

**Adjectives**: powerful, seamless, seamlessly, blazing, lightning-fast, ultimate, best-in-class, cutting-edge, state-of-the-art, revolutionary, effortless (in marketing sense), stunning, beautiful (about our own UI), amazing, awesome, incredible, supercharge, unleash, unlock, elevate, empower, next-level, game-changing, robust, hassle-free, one-stop.

**Phrases**: "AI-powered", "in seconds" (unless measured), "100% free" (say "Free."), "no strings attached", "trusted by", "join thousands", "the #1", "the best online", "sign up today", "get started for free", "take your videos to the next level".

**Punctuation**: exclamation marks (anywhere in UI/marketing), emoji, ALL CAPS for emphasis, ellipses for suspense.

**Structure**: rhetorical questions as headings ("Tired of large video files?"), listicle-style "Why choose us?", triplets of synonyms ("fast, easy and secure").

### 3. Patterns to use

| Element | Pattern | Example |
|---|---|---|
| Tool H1 | `<Verb> <object>` | Compress video · Convert MOV to MP4 · Remove audio from video |
| Tool subtitle | One plain sentence about what the user gets: about 60 characters, 80 at most (schema), no jargon (no codec names unless the page is about that codec, no "streams", "re-encoding" or "lossless copy"), no privacy line | Make a video smaller without losing quality. |
| Meta title | `<Tool name> online, free, no upload · ilovevideos` (≤ 60 chars; drop "no upload" if server-only) | Compress video online, free, no upload · ilovevideos |
| Meta description | ≤ 155 chars, what + how + privacy | Reduce video file size in your browser. Choose a target size or quality. Files never leave your device. Free, no account. |
| Primary button | Verb, matches H1 | Compress · Convert · Trim · Download |
| Progress copy | Real state | Processing frame 1,204 of 3,600 · Encoding audio · Finishing |
| Success | Result, then action | 12.4 MB → 3.1 MB. Download below. |
| Error | What happened, then what to do | This file uses a codec your browser can't decode. Convert it to MP4 first, or try on desktop Chrome. |
| Status line | Facts joined by " · ", nothing about where it runs | H.264 640×360 · sound copied |

### 4. Tool page prose (SEO body)

Every tool page has unique prose, minimum ~350 words, written for a human who searched the query. Structure (after the stage; sections 2–4 fold as `<details>` rows; related-tool pills follow, §1 Anatomy):

1. **What this does** (2–3 sentences, plain).
2. **How to use it** (3–5 numbered steps, each one sentence).
3. **Good to know** (3–6 short paragraphs of real, tool-specific knowledge: what settings mean, tradeoffs, format facts, platform limits like Discord 10 MB / WhatsApp 16 MB / email 25 MB). This is where we beat competitors: real information, not filler.
4. **FAQ** (4–8 questions people actually search; answers 1–3 sentences).

Do not reuse paragraphs across pages. Format pairs (MOV→MP4 vs AVI→MP4) must each explain something specific about the source format. If there is nothing specific to say, the page should not exist.

### 5. Numbers and units

- Space before unit, non-breaking: `12.4 MB`, `1080p`, `30 fps`, `0:42`.
- Dimensions use `×`: `1920×1080`.
- Percentages have no space: `−75%`. Use a real minus sign for negatives.
- Durations: `m:ss` under an hour, `h:mm:ss` above.
- Round file sizes to 1 decimal under 100, whole above.

### 6. Capitalisation

- Sentence case for everything, including headings, buttons, nav.
- Format names as the world writes them: MP4, MOV, WebM, GIF, MP3, AAC, H.264, HEVC, AV1, VP9, ProRes.
- Product name: `ilovevideos` in lowercase in body text and the wordmark. Title Case never.

### 7. Internationalisation readiness

- No concatenated strings. Use ICU message format with placeholders.
- No text in images.
- Leave room: German runs ~30% longer than English; buttons must not truncate.

---

## SEO strategy

Goal: rank for the *task*, not the brand. "compress video online" → our compress page.

### 1. Information architecture

- **Depth ≤ 3**: home → category hub (`/tools/compress`) → format hub for converters (`/mp4-converter`, linking every `*-to-mp4` and `mp4-to-*`) → tool. Every standalone tool is linked from the home rows and its category hub (both one click from every page: home via the header, the hub via the footer's hub list and the breadcrumb) and from ≥ 3 related rows. Generated pages (format pairs, sizes, platform presets) are specific tools for a specific source or target, reached from search, their hub and their siblings, not from browsing surfaces: from search, their hub's closed "All format pages" disclosure at the bottom of the hub (in the HTML) and their siblings' related rows; browsing surfaces (home, standalone related rows, Then rows, file suggestions) never list them. The validator counts a generated page's links from siblings' related rows, other tools' prose and its hub's disclosure, minimum 3 (ADR-0154). Hubs need at least two tools. Format hubs such as `/mp4-converter` are not built; the convert hub's grouped lists stand in for them. No orphan pages. Visible breadcrumbs + `BreadcrumbList` on every page: this is what satisfies Google's "clearly defined, browseable hierarchy" doorway test.
- **The tool runs on the landing URL.** `/mov-to-mp4` *is* the converter. Never a marketing page that sends users to `/app`. This is the single most important doorway-policy defence.
- **Container capability table** (`src/content/formats/containers.ts`): every container we read or write, with which engine and which codecs it holds. The converter's target list, the copy-vs-transcode planner (`engines/convert-video/plan.ts`) and the ffmpeg arguments all derive from it. Native engine writes MP4, MOV, WebM, MKV; the ffmpeg.wasm engine writes AVI, WMV, FLV, MPEG, MPEG-TS, 3GP, OGV and VOB and additionally reads MXF, RealMedia, DV and SWF. ffmpeg runs are pinned to at most 4 threads: the automatic thread count deadlocks the WASM pthread pool. Adding a container is one row.
- **Format-profile library** (implemented, ADR-0011): each format is described once in `src/content/formats/` (summary + playback paragraphs, codec lists). `src/tools/registry/pairs.ts` composes a pair page from two profiles plus a hand-written pair story (≥ 2 paragraphs, ≥ 4 FAQs); `what` is generated from the codec matrix so it states truthfully whether the pair copies or re-encodes. Profile paragraphs are exempt from the duplicate check; each page must still carry ≥ 150 words of its own. One generic `/video-converter` page handles every combination without a URL. This is how CloudConvert (hub + 43 pairs) and FreeConvert (~7% of N² pairs shipped) structure it; iLovePDF has no pair matrix because PDF has no format pairs.
- **Bounded pair matrix**: never N×N. ~30 sources × ~12 demand-weighted targets. FreeConvert ships only ~7% of its possible pairs.
- **URL**: `/<verb-object>` or `/<from>-to-<to>`. Lowercase, hyphens, no dates, no IDs, no trailing slash, no `/tools/` prefix on tool pages (shorter is better; hubs live at `/tools/<category>`).
- **Locale**: English at root; other locales at `/<locale>/…` with `hreflang` + `x-default`. Locale content is translated *and localised* (platform limits differ by region), never machine-translated boilerplate.
- **Canonical** on every page; format pairs that are aliases (e.g. `m4v-to-mp4` ≈ `mp4-to-mp4`) are either distinct pages with distinct content or 301s, never duplicates.

### 2. On-page template (every tool page)

| Element | Rule |
|---|---|
| `<title>` | `{metaTitle} · {site}`; ≤ 60 chars; task first: "Compress video online, free, no upload" |
| `<meta description>` | ≤ 155 chars; what + how + privacy + free |
| `<h1>` | Exactly one; `<Verb> <object>`; matches primary query intent |
| Above the fold | H1, one-sentence subtitle, the tool. No hero image, no marketing block. |
| Body | ≥ 350 words unique: What (open) / How (ordered list) / Good to know / FAQ (`<dl>`), the last three folded in `<details>` with the `<h2>` in the summary, then Related (name-only pill buttons) last, after the folded prose |
| Headings | `<h2>` per section; question-form `<h2>` only inside FAQ if used as headings |
| JSON-LD | `BreadcrumbList` per page; `Organization` + `WebSite` sitewide. **Not** `FAQPage` (rich result retired 2026-05-07), **not** `HowTo` (retired 2023), **not** `SoftwareApplication` until we have real user ratings (it requires `aggregateRating`/`review`; fabricating one is a manual-action risk), **not** `SearchAction`. FAQ and steps are visible HTML (`<dl>`, `<ol>`), which is what Google and AI systems actually consume. |
| Images | Only real UI screenshots/OG image; `alt` describes the operation; AVIF/WebP |
| OG image | Generated per tool at build (monochrome, title, one glyph) |
| Internal links | Related tools (6), category hub, home, ≥ 1 contextual link inside "Good to know" to a sibling tool |

### 3. Avoiding the doorway-page trap

Google's guidance penalises pages "created to rank for specific queries that funnel users to the same destination" and near-duplicate templated pages. Our mitigations, all enforced mechanically:

1. Each page is a *different destination*: different preset options, different accepted inputs, different result.
2. `validate-registry` fails the build on any paragraph reused across pages and on < 350 body words.
3. Format-pair pages exist only where the pair has a real story (codec compatibility, platform behaviour, typical source device). Otherwise the generic converter handles it without a dedicated URL.
4. Platform pages carry sourced limits (e.g. Discord upload caps by tier); the dates they were checked live in `src/content/platforms`, not on the page, and are revisited quarterly.
5. Editorial guides (`/guides/…`) add depth and earn links; they link into tools, not the reverse only.

### 4. Technical

- Static HTML for every page (no client-only content). Prose is in the HTML at build; the stage hydrates after.
- Core Web Vitals: see architecture budget. INP is protected by keeping all encoding in workers.
- `sitemap.xml` from the registry with `hreflang` alternates + `x-default` in the sitemap (not `<head>`); honest `lastmod` from `updatedAt`; **no `priority`/`changefreq`** (Google ignores them); shard by locale at ≤ 15k URLs (the 50 MB limit binds before 50k URLs once hreflang is included); gzip; CI asserts every index child returns 200 and every alternate is reciprocal.
- `robots.txt`: allow all, block `/api/`, `/dev/`, parameter URLs (`/*?*`); explicitly allow retrieval bots (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`); block training-only bots (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`), which has no effect on Google Search or AI Overviews.
- Search Console + Bing Webmaster from day one; IndexNow for Bing only (Google does not support it).
- Locale pages canonicalise to themselves. Cross-canonical only for true aliases (`mpg`/`mpeg`). Never IP-redirect between locales.
- Launch English only. Add locales only with properly translated format profiles (machine-translating 500 pages × 20 locales is the "translating" bullet of Google's scaled-content-abuse policy).
- 404s are real 404s (`dynamicParams = false`); no soft-404 tool pages.
- No interstitials, no cookie banner (we have no consent-requiring cookies), no layout shift from late-loading UI.

### 5. Query → page mapping (seed list)

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
| crop video / change aspect ratio / 9:16 / square video | `/crop-video`, `/change-video-aspect-ratio` |
| rotate video / flip video / mirror video | `/rotate-video`, `/flip-video` |
| speed up video / slow motion / 2x | `/change-video-speed` |
| remove audio / mute video | `/remove-audio-from-video` |
| add music to video / add audio | `/add-audio-to-video` |
| add subtitles / srt to video / burn subtitles / auto subtitles | `/add-subtitles-to-video` (soft track or burned in); no auto subtitles (needs a model, ADR-0105) |
| srt to vtt / vtt to srt / shift subtitles | `/srt-to-vtt`, `/vtt-to-srt`, `/shift-subtitle-timing` |
| add watermark / hide a logo | `/add-watermark-to-video`; blurring a mark: `/blur-video` (no removal page, ADR-0062) |
| blur video / blur face in video / pixelate video / censor video | /blur-video (Find faces for faces; no separate face or pixelate page, ADR-0113) |
| blur video background / background blur / portrait mode video | /blur-video-background |
| remove / change / replace video background / no green screen | /remove-background-from-video |
| add progress bar / video progress bar | `/add-progress-bar-to-video` |
| add timer / countdown on video | `/add-timer-to-video` |
| add intro / outro / title card | `/add-intro-to-video` |
| video info / check codec / video metadata / remove metadata | `/video-info`, `/remove-metadata-from-video` |
| screen recorder online / webcam recorder | `/screen-recorder`, `/webcam-recorder` |
| resize video for tiktok / instagram / youtube shorts | `/resize-video-for-tiktok`… |
| merge audio / join mp3 / audio joiner | `/merge-audio` |
| ringtone maker / mp3 to m4r | `/ringtone-maker` |
| change pitch / transpose / change key | `/change-audio-pitch` |
| bpm finder / song key finder / camelot | `/key-bpm-finder` |

### 6. Off-page

- Launch posts (HN, Product Hunt, r/DataHoarder, r/VideoEditing, r/privacy) emphasising "works offline, nothing uploaded".
- Open-source the engine layer (MPL/GPL compatible) to earn developer links.
- Guides that answer real questions (Discord limits by tier, iPhone HEVC compatibility) earn organic links from forums.
- No link buying, no PBNs, no guest-post spam.

### 7. Measurement

- Search Console: impressions/clicks per page weekly; pages with impressions but CTR < 2% get title/description rewrites.
- Track "tool completion rate" (drop → download) per page as the quality signal, in cookieless analytics.
- Quarterly content refresh of platform limits and codec support tables.

---

## Privacy and processing

The privacy promise is the product. This document defines exactly what we promise, how it is enforced technically, and what we say when we cannot keep it.

### 1. The promise, precisely

1. **On-device by default.** Every tool processes files inside the user's browser unless the tool page says otherwise before a file is chosen.
2. **No upload without consent.** The server path (Phase 2) requires a per-file, explicit confirmation dialog that states what is sent, where, for how long.
3. **No accounts.** Nothing identifies a user across sessions except a `localStorage` theme/preset preference they can clear.
4. **No consent-requiring cookies.** We set no cookies. Analytics are cookieless and aggregate.
5. **No content logging.** The server path never logs filenames, content, or metadata beyond byte counts and durations for capacity planning.
6. **Deletion.** Server-processed files live in RAM/tmpfs and are deleted on download completion or after 60 minutes, whichever is first.
7. **Provable.** Tool pages work offline once loaded (PWA, Phase 2). Network activity during processing is zero and users can verify in DevTools; we say so in the FAQ.

### 2. Enforcement

| Promise | Mechanism |
|---|---|
| On-device | Engines run in Web Workers; no `fetch` of user data anywhere in engine code. Lint rule: `fetch`/`XMLHttpRequest`/`navigator.sendBeacon` are banned in `src/tools/engines/**` and `src/tools/workers/**` except the ffmpeg core loader fetching *our* static assets. |
| No upload without consent | Server backend is a separate module behind a `ConsentGate` component; it cannot be invoked without a resolved consent promise. E2E test asserts no network request carries a body > 1 KB on any tool page in default flow. |
| Storage | First-party cookies and browser storage allowed for usability (ADR-0128); listed on `/privacy`; every access survives blocked storage. |
| Search counts | `/api/search-miss` accepts only `{ q, results, opened: false, zero }` (zod, strict, 512-byte cap); queries that look like an address, a path or a long number are dropped in the browser and refused by the server; stored as query → count per day (ADR-0150, ADR-0151). Unit and e2e tests check the body. |
| Deletion | Server: tmpfs mount, cron reaper at 60 min, download endpoint deletes on completion. Logged and monitored. |
| Content logging | Server logs are structured; allowlisted fields only (`bytes_in`, `bytes_out`, `duration_ms`, `engine`, `status`). |

### 3. Copy rules for privacy claims

- Every job runs on the user's device (ADR-0024). That is stated on `/privacy`, `/about` and once in the home page's promises block, never in the interface: no drop zone, status line, result, error or subtitle repeats it (owner, 2026-11-19, ADR-0149). `pnpm lint:copy` enforces it.
- Never say "100% secure", "military-grade", "bank-level". Say what we do.
- The privacy page is written in plain language, one screen long, and links to the technical description above.

### 4. Third parties

- Fonts: self-hosted. No Google Fonts requests.
- Analytics: Plausible or Umami, self-hosted or proxied from our origin, cookieless, no cross-site identifiers, respects DNT.
- Error reporting: none in Phase 1. If added later, scrub file names and paths; opt-in.
- No ads, no tag managers, no social embeds, no chat widgets.

### 5. Where the browser falls short (and we say so)

| Case | Behaviour |
|---|---|
| Codec the browser cannot encode (e.g. HEVC on some Chrome builds) | Offer H.264/AV1 instead; explain. Server path is opt-in. |
| File larger than device memory allows via ffmpeg.wasm (32-bit) | Prefer WebCodecs path (per-frame memory). If unavailable, say the file is too large for this browser and suggest desktop Chrome. |
| Firefox for Android (no WebCodecs) | ffmpeg.wasm single-thread; warn about speed. |

### 6. Legal pages required before launch

- Privacy policy (plain language + technical annex).
- Terms of use (no uploading of content you do not have rights to; no warranty).
- Open-source licences page (mediabunny MPL-2.0, ffmpeg.wasm GPL build with source link, fonts, icons).
- Imprint/contact where legally required.

---

## Engineering workflow

### Branching and commits

- `main` is always deployable. Work on short-lived branches; squash-merge.
- Commit messages: imperative subject ≤ 72 chars, body explains why when it is not obvious. Reference an ADR id when a commit implements a decision.
- Never force-push `main`. Never commit generated artifacts.

### Definition of done for any change

- `pnpm check` passes.
- The relevant Playwright spec passes locally when UI or a tool page changed.
- UI: works at 375/768/1280, keyboard operable, zero axe violations, reduced motion respected, reviewed against the anti-pattern table in [Design principles](#design-principles). Motion reviewed with the `review-animations` skill.
- Tool page: the definition of done in [Tool page specification](#tool-page-specification).
- Engine: `supports()` probes real capability, `run()` reports real progress and honours `AbortSignal`, fixture integration test present.
- New dependency: a line in the [Tech stack](#tech-stack) table and a check with the `pick-ui-library` skill.
- A decision was made that changes architecture, licensing, privacy or SEO posture: an entry in `DECISIONS.md`.
- `PROGRESS.md` updated: current state, next up, session log.

### Pull requests

The PR template in `.github/` carries the checklist above. CI runs `pnpm check`, the production dependency audit, `pnpm build` and Lighthouse on every push and pull request, plus a Playwright smoke test (every tool page, desktop Chromium) on pull requests. The full Playwright suite runs locally (`pnpm test:e2e`) before a release and before merging a large dependency upgrade, since it needs macOS (AAC, Safari's WebKit, a GPU). Merge only when green.

### Working with agents

Coding agents are first-class contributors. Their entry point is `CLAUDE.md`; their memory across sessions is `PROGRESS.md` and `DECISIONS.md`; their guard rails are the hooks in `.claude/settings.json`:

| Hook | When | What it does |
|---|---|---|
| `session-start.sh` | Session start, resume, after compaction | Injects current state, next steps, the last session log entry, the decisions index and git status |
| `route-prompt.sh` | Every user prompt | Adds a one-line routing hint when the prompt matches a domain (tool, engine, UI, motion, SEO, dependency) |
| `route-context.sh` | After any file edit | Reminds once per session per area which rules, agent or skill apply to the edited path |
| `format.sh` | After any file edit | Runs Biome on the edited file |
| `stop-gate.sh` | When the agent tries to finish | Blocks once if source files changed this session but `PROGRESS.md` was not updated |

Path-scoped rules in `.claude/rules/` load automatically when files under their `paths` are edited. Subagents in `.claude/agents/` and skills in `.claude/skills/` are described so that the model delegates to them without being asked; `CLAUDE.md` holds the routing table that makes this mandatory.

### Launch steps (human, need the domain)

These wait on the product name and domain (ADR-0001). Nothing in the code needs to change for them beyond the environment.

1. **Set the origin.** In the Vercel project, set `NEXT_PUBLIC_SITE_URL=https://<domain>` (no trailing slash) and `NEXT_PUBLIC_SITE_NAME` for Production. A production deploy (`VERCEL_ENV=production`, or `REQUIRE_SITE_URL=1` on another host) fails the build if the URL is missing or points at localhost, so canonicals, the sitemap, robots and JSON-LD can never ship with `http://localhost:3000`. Previews may leave it unset; Vercel serves previews with `X-Robots-Tag: noindex`.
2. **Deploy and check headers** on the live domain: `curl -sI https://<domain>/compress-video` shows `Content-Security-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` and no `Set-Cookie`; view source shows the `<meta http-equiv="Content-Security-Policy">` with `sha256-` hashes.
3. **Google Search Console**: add a **Domain** property for `<domain>`, verify with the DNS TXT record at the registrar (no HTML file or meta tag needed, so nothing is added to the site), then under Sitemaps submit `https://<domain>/sitemap.xml`. Use URL Inspection on `/`, one hub and one tool page to confirm Google renders the H1 and the tool.
4. **Bing Webmaster Tools**: import the Search Console property (or verify by DNS), submit the same sitemap. IndexNow for Bing is optional and later ([SEO strategy](#seo-strategy) §4).
5. **Record it**: add the verification date to `PROGRESS.md` and tick "Search Console verified; sitemap submitted" in the Phase 1 exit criteria.

### Session protocol (agents and humans)

1. **Start**: read the injected context (or `PROGRESS.md` "Current state" and "Next up"). Do not re-derive decisions already in `DECISIONS.md`.
2. **Work**: follow the routing table; run `pnpm check` before claiming done.
3. **End**: run the `handoff` skill (or follow `.claude/skills/handoff/SKILL.md` by hand): add a session log entry, refresh "Current state" and "Next up", append any decision to `DECISIONS.md`. The stop gate enforces this once per session.

---

## Appendix A: competitive research

Compiled 2026-09-02. Items marked *(verify)* come from general knowledge of these products and should be re-checked before being quoted publicly; items marked *(observed)* were confirmed by fetching the live site or its sitemap during research.

### 1. The name is taken, several times over

| Domain | What it is *(observed)* |
|---|---|
| **ilovevideo.dev** | "Free online video tools that convert, compress, trim, crop, merge and extract audio with no file upload and no account needed." This is *our exact concept*, already live. |
| **ilovevideo.fun** | 185+ mixed tools (video compress, background removal, PDF, transcription, resume/invoice generators). Has `/learn/…` guide pages such as `compress-video-for-whatsapp`, `resize-video-for-tiktok-instagram-youtube`. |
| **ilovevideoeditor.com** | Template-based editor, 259 templates, free, no signup, no watermark. |
| **ilovevideo.ai** | AI video generator. |
| **iloveimg.com / ilovepdf.com** | The brand we are echoing. Owned by iLovePDF S.L. (Barcelona). Trademark exposure is real. |

**Implication.** "ilovevideos" as a brand is crowded, confusable, and legally exposed. It also has no SEO advantage: nobody searches the brand of a tool they haven't heard of; they search the task. Recommendation: keep `ilovevideos` as the codename, keep the brand string in one constant, and pick a distinctive, ownable name before launch (ADR-0001). A short, pronounceable, .com-available name is worth more than the iLove echo.

**Second implication.** ilovevideo.dev proves the "no upload" positioning is already being attempted. We must out-execute on (a) breadth of tools, (b) depth of content, (c) UI quality, (d) speed via WebCodecs rather than ffmpeg.wasm alone. Study it closely before Phase 1 ends.

### 2. Incumbents

| Site | Model | Free-tier friction *(verify)* | Processing | Notable |
|---|---|---|---|---|
| **iLovePDF / iLoveIMG** | Freemium, ~25 tools each | Daily task limits, file size caps on free | Server | Gold standard for *structure*: "All tools" dropdown with category filters (Organize, Optimize, Convert, Edit, Security), one page per tool, 25+ languages, workflows. Header: logo, "All PDF tools", Login/Sign up. *(observed)* |
| **Clideo** | Freemium | Watermark on free exports, 500 MB cap | Server | Very large sitemap (~3 MB raw) *(observed)*: aggressive programmatic pages per format/platform. |
| **Kapwing** | Freemium editor | Watermark, 720p export, ~4-min export length, 250 MB upload on free | Server | Strong content marketing; many "how to" pages. |
| **VEED.io** | Freemium editor | Watermark, 720p, ~10 min/export on free | Server | Heavy AI positioning (ads, avatars, UGC). Diverging from utility use-cases. *(observed nav)* |
| **123apps** (online-video-cutter.com, video-converter.com, mp3cut.net, online-voice-recorder.com…) | Free, ad-supported | Generous free limits (multi-GB), ads | Server | **Multi-domain strategy**: one domain per tool category, each domain ranks for its head term. *(observed)* Closest to our UX philosophy: one tool, one screen, no clutter. |
| **FreeConvert** | Freemium | 1 GB free; paid 1.5 / 2 / 5 GB at $12.99 / $24.99 / $29.99 *(observed pricing table)* | Server | Enormous format-pair page matrix (multiple 30 MB sitemap shards observed). |
| **CloudConvert** | Metered | 25 conversion minutes/day free, 1 GB | Server | API-first; developers. |
| **Convertio** | Freemium | 100 MB free; same paid tiers as FreeConvert *(observed)* | Server | Format-pair matrix. |
| **Ezgif** | Free, ads | ~200 MB | Server | Utilitarian, ugly, beloved. Ranks #1 for most GIF queries by sheer age and content. |
| **Clipchamp** (Microsoft) | Free tier | 1080p free, no watermark since 2022 | Hybrid | Full editor; not a utility site. |
| **Flixier, Media.io, Online-Convert, Aconvert, VideoCandy, Fastreel** | Freemium | Watermarks / caps | Server | Second tier; heavy programmatic SEO. |

### 3. Patterns worth copying

1. **One tool, one URL, one H1** (iLovePDF, 123apps). Title pattern that ranks: `Compress Video Online — Free Video Compressor` style: task first, "online"/"free" modifiers, tool noun.
2. **Category hub pages** (iLovePDF "Optimize PDF" etc.) that link every tool in the category, giving crawlers a shallow graph (home → hub → tool, depth 2).
3. **Format-pair matrices** (FreeConvert, Convertio, Clideo) capture long-tail. But most are thin; identical text with the format names swapped. Google tolerates it from old domains with authority; a new domain will not get the same benefit. Our rule: only ship pairs with unique, specific content (see catalog pruning rule).
4. **Platform/purpose guides** (ilovevideo.fun `/learn/compress-video-for-whatsapp`): use-case pages convert well and rank for "for X" queries.
5. **Multi-domain by category** (123apps): powerful but expensive to maintain; not for Phase 1. Revisit if one category (e.g. GIF) deserves its own brand.

### 4. Patterns to avoid

- Upload-first flows with a progress bar for the *upload*, then a queue, then a *download* from their CDN. Three waits.
- Watermarks and 720p caps: the number-one complaint in reviews of Kapwing/VEED/Clideo.
- Cookie banners, newsletter modals, "Rate us" popups, ad-slots between the H1 and the tool.
- Thin format-pair pages with boilerplate.
- AI feature sprawl that buries the utility (VEED).

### 5. User complaints we solve *(general knowledge, verify with fresh sampling)*

| Complaint | Our answer |
|---|---|
| "Uploading a 2 GB file took 20 minutes then it failed." | No upload. Device-side. |
| "Watermark on my school project." | None, ever. |
| "Free tier only gives 720p." | Output resolution is whatever you choose. |
| "I don't want my kid's video on some server." | Files never leave the device; provable (works offline). |
| "Too many ads / popups." | No ads. |
| "Had to sign up to download." | No accounts. |
| "Quality was terrible after compressing." | Honest presets, real before/after size, preview before download. |
| "Doesn't work on my phone." | Mobile-first workspace, PWA share-target. |

### 6. Search landscape (qualitative)

Head terms (very high volume, very high competition): `compress video`, `video compressor`, `video converter`, `mp4 to mp3`, `video to gif`, `mov to mp4`, `trim video`, `cut video online`, `merge videos`, `video to audio`.

Long-tail where a new site can win in months: `compress video for discord`, `compress video under 8mb`/`10mb`, `compress video for whatsapp`, `compress video for email`, `mov to mp4 iphone`, `hevc to h264`, `mkv to mp4 no quality loss`, `remove audio from video`, `video to gif high quality`, `screen recording to gif`, `resize video for tiktok`, `9:16 to 16:9`, `remove metadata from video`, `check video codec`, `srt to vtt`, `shift subtitles`, `extract audio from mp4`, `webm to mp4`, `gif to mp4 discord`, `rotate video 90 degrees`, `speed up video 2x`.

Ranking pages share: task-first `<title>`, `<h1>` matching query, tool above the fold, "How to" steps, FAQ, related tools, heavy internal linking, many languages.

### 7. Conclusions feeding the plan

- Rename before launch (ADR-0001).
- Device-first processing is *the* differentiator, and one competitor already claims it. We must be faster (WebCodecs) and broader.
- Content quality per page is the moat against programmatic incumbents on a young domain.
- Copy iLovePDF's information architecture; copy 123apps' one-screen calm; copy nobody's visual design.

---

## Appendix B: technical SEO research

Condensed from a live-fetch research pass against developers.google.com, web.dev, Chrome developer docs, OpenAI/Anthropic crawler docs, and direct crawls of iLovePDF, CloudConvert, FreeConvert, Convertio, ezgif and 123apps (robots.txt, sitemaps, rendered HTML, response headers). Items marked *(unverified)* are third-party claims.

### 1. Google policy: scale is not the violation

- **Scaled content abuse** (spam-policies, updated 2026-08-28): "many pages generated for the primary purpose of manipulating search rankings and not helping users." Named examples include automated *translating* "where little value is provided." A working tool on the page is, by construction, helping the user.
- **Doorway abuse**: "generating pages to funnel visitors into the actual usable or relevant portion of a site" and "substantially similar pages that are closer to search results than a clearly defined, browseable hierarchy."
  - **Funnel test**: the tool must run *on* the landing URL. `/mov-to-mp4` is the converter, not a page with a button to `/app`.
  - **Hierarchy test**: pages must sit in a browseable taxonomy (home → category hub → format hub → tool), with breadcrumbs.
- Helpful-content is folded into core ranking (no separate penalty/recovery cycle). Google ran spam updates in Mar, Jun and Aug 2026; assume one within 90 days of launch.
- Google's helpful-content guidance flags "extensive automation across many subjects." A video-tool site is *one* subject. Do not add off-topic converters (FreeConvert has 3,812 unit/time pages; do not copy that).

### 2. Measured competitor scale

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

### 3. Structured data in 2026

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

### 4. i18n

- Three hreflang methods are "equivalent from Google's perspective." Reciprocity is mandatory: "if two pages don't both point to each other, the tags will be ignored." Use `GB` not `UK`. Never auto-redirect by IP.
- Subdirectories (`/es/`) recommended for language targeting.
- **Launch English only.** 500 tools × 20 MT locales = 9,500 machine-translated pages vs 500 authored: the spam-policy "translating" bullet verbatim. Add 5–8 locales in Phase 2 by translating the O(N) format profiles properly.
- Put hreflang in the **sitemap**, not `<head>` (saves ~2 KB above the LCP on every page); shard ≤ 15k URLs; gzip; CI-test reciprocity and that every index child returns 200.

### 5. Core Web Vitals

- Thresholds unchanged: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75. No new CWV.
- **Soft navigations** shipped unflagged in Chrome 151 (2026-07-28); SPA route changes are becoming measurable in CrUX. Our tool pages are separate static documents, so this does not bite us.
- Page experience: "Core Web Vitals are used by our ranking systems" but "there is no single signal." Weak, real, non-decisive.
- **Not one market leader ships client-side WASM on SEO landing pages** (FreeConvert, CloudConvert, ezgif, iLovePDF all convert server-side; none set full cross-origin isolation). Reasons: ffmpeg.wasm core is ~31 MB, and COOP/COEP `require-corp` breaks ad networks, third-party embeds and non-CORP analytics.
- Our position (ADR-0005/0006): we have no ads and no third-party scripts, so isolation costs us nothing; WebCodecs needs no SharedArrayBuffer at all; ffmpeg core loads only after a user gesture, in a worker. Escape hatch if isolation ever hurts: drop COOP/COEP and use the single-threaded ffmpeg core.
- Do not use `isInputPending()` (Google: "we no longer recommend using this API"). Use `scheduler.yield()` with fallback. All encoding in workers with transferable buffers.
- LCP element should be the server-rendered H1 + drop zone (block-level text, no image). Fixed drop-zone dimensions for CLS.

### 6. Sitemaps, robots, crawl

- 50 MB uncompressed or 50k URLs per file; with hreflang the byte limit binds first (~1.6 KB/URL). Shard **by locale** so Search Console shows per-locale indexation.
- `lastmod` is used only "if consistently and verifiably accurate." Emit real content-change dates; never deploy-stamp. **Google ignores `changefreq` and `priority`.**
- Crawl budget is not a concern below ~10k slow-changing URLs. Block parameter URLs in robots.txt (`Disallow: /*?*`), not with `noindex`.
- IndexNow: Bing/Yandex only; Google does not support it. Google Indexing API is JobPosting/BroadcastEvent only.
- Crawlers: training vs retrieval. `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` are retrieval (blocking removes us from AI answers; for a *task* site, AI answers hand users a link to a working tool, pure upside). `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended` are training-only; blocking is free. All six competitors block nothing.
- Self-referential canonical everywhere; cross-canonical only true aliases (`mpg`/`mpeg`); locale pages canonicalise to themselves.

### 7. Prioritised checklist (adopted into [SEO strategy](#seo-strategy))

P0: tool runs on landing URL · format-profile library before pair pages · bounded matrix · pair-specific remux-vs-transcode angle · English only · no fabricated ratings.
P1: BreadcrumbList + visible breadcrumbs · hub-and-spoke (category → format hub → tool, both directions) · varied related modules · self canonical · robots as above · locale-sharded gzipped sitemaps with CI 200-check · honest `lastmod` · LCP = H1 + drop zone · Organization JSON-LD + real about/privacy pages.
P2: FAQ as visible HTML · per-pair comparison table · conditional `SoftwareApplication` once ratings exist · CrUX field monitoring · 5–8 locales via translated format profiles · IndexNow for Bing · per-sitemap indexation monitoring.
Never: HowTo · SearchAction · Product · `isInputPending` · `changefreq`/`priority` · IP redirects · cross-locale canonicals · parameter URLs · deploy-stamped lastmod · fake ratings · off-topic page farms · relying on llms.txt.

