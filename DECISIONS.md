# Decisions

Append-only log of decisions that change architecture, licensing, privacy, SEO posture or the way we work. One entry per decision. Never edit a past entry except to change its status (for example to `Superseded by ADR-00NN`); add a new entry instead.

**When to add one:** you chose between real alternatives and a future session would otherwise re-open the question. **How:** copy the template at the bottom, take the next id, fill Context / Decision / Consequences in a few sentences each, add a row to the index. Do it in the same change that implements the decision. `pnpm lint:docs` checks the structure.

## Index

| ID | Title | Status | Date |
|---|---|---|---|
| ADR-0001 | Product name is undecided; "ilovevideos" is a codename | Open (launch blocker) | 2026-09-02 |
| ADR-0002 | Next.js App Router over Astro | Accepted | 2026-09-02 |
| ADR-0003 | Geist Sans + Geist Mono, single family | Accepted | 2026-09-02 |
| ADR-0004 | ffmpeg.wasm as fallback engine; GPL build accepted with compliance | Accepted (implemented 2026-09-03) | 2026-09-02 |
| ADR-0005 | Cross-origin isolation on all pages (COOP same-origin, COEP credentialless) | Accepted | 2026-09-02 |
| ADR-0006 | No advertising; revenue via optional Pro tier later | Superseded by ADR-0012 | 2026-09-02 |
| ADR-0007 | One handbook plus PROGRESS/DECISIONS as the memory system; hooks enforce it | Accepted | 2026-09-02 |
| ADR-0008 | Visual-first tool cards with monochrome vector illustrations | Accepted | 2026-09-02 |
| ADR-0009 | Warm neutral palette with a single accent slot, superseding strict grayscale | Accepted | 2026-09-02 |
| ADR-0010 | Light theme only at launch; dark theme defined but not shipped | Accepted | 2026-09-02 |
| ADR-0011 | Flow-first tool pages: no duplicate pages, task-shaped controls, generated format pairs | Accepted | 2026-09-02 |
| ADR-0012 | Completely free: no Pro tier, no paid features, no ads | Accepted | 2026-09-30 |
| ADR-0013 | Compress families from dated primary-source limits; decimal MB targets verified by measurement | Accepted | 2026-09-30 |
| ADR-0014 | Multi-input and multi-output runs; lossless cuts and joins are packet copies | Accepted | 2026-09-30 |
| ADR-0015 | Crop and aspect ratio are separate engines on one geometry runner; geometry always re-encodes | Accepted | 2026-09-30 |
| ADR-0016 | Per-page tuning through optional OptionsSpec hooks, never forked stages | Accepted | 2026-09-30 |
| ADR-0017 | Platform pages may share processing options with a plain page when their tiers are the primary control | Accepted | 2026-09-30 |
| ADR-0018 | Signal WebCodecs AAC encoder delay with an MP4 edit list; lossless trim and split share one packet copy | Accepted | 2026-09-30 |
| ADR-0019 | Platform frame specs, a capped aspect-ratio engine and codec-aware conversion routing | Accepted | 2026-09-30 |
| ADR-0020 | Audio conversion: OGG means Vorbis, copies are packet copies, lossless PCM goes through ffmpeg, audio pages get a Hero | Accepted | 2026-09-30 |
| ADR-0021 | Stream copies never go through mediabunny Conversion | Accepted | 2026-09-30 |
| ADR-0022 | Subtitle muxing and burn-in through ffmpeg.wasm and libass with a bundled OFL font | Accepted | 2026-09-30 |
| ADR-0023 | containers.ts is the only authority on what a container holds without re-encoding | Accepted | 2026-09-30 |
| ADR-0024 | On-device only (no server fallback); sizes shown in decimal megabytes | Accepted | 2026-09-30 |
| ADR-0025 | Batch queue as a stage mode decided by per-file hooks; command palette on Base UI with a static index; SI size units | Accepted | 2026-09-30 |
| ADR-0026 | Per-tool keyboard shortcuts are scoped to the workspace | Accepted | 2026-09-30 |
| ADR-0027 | Static CSP with build-time script hashes, not per-request nonces; middleware renamed to proxy.ts | Accepted | 2026-09-30 |
| ADR-0028 | A production deploy fails without NEXT_PUBLIC_SITE_URL | Accepted | 2026-09-30 |
| ADR-0029 | Lighthouse CI with the README budgets | Accepted | 2026-09-30 |
| ADR-0030 | A tool page's first load is its drop zone; engine UI loads with the first file | Accepted | 2026-09-30 |
| ADR-0031 | First-load script budget restated above the framework floor | Accepted | 2026-09-30 |
| ADR-0032 | mediabunny decode and mux gaps are corrected in our engine layer, never by patching the dependency | Accepted | 2026-09-30 |
| ADR-0033 | Lighthouse measures with applied throttling; Geist Sans ships as a Latin subset and Geist Mono is not preloaded | Accepted | 2026-09-30 |
| ADR-0034 | The stage loads its parts in one step and reserves the working height on phones | Accepted | 2026-09-30 |
| ADR-0035 | One per-frame filter runner: colour as a power curve plus an affine matrix, previewed with the same numbers | Accepted | 2026-10-01 |
| ADR-0036 | A re-encoded picture keeps the source's sound by packet copy, not by Conversion | Accepted | 2026-10-01 |
| ADR-0037 | Frame rate only goes down, by dropping frames; codec changes promise only what the encoder confirms | Accepted | 2026-10-01 |
| ADR-0038 | Fast start rewrites the MP4 index in place of a remux | Accepted | 2026-10-01 |
| ADR-0039 | Reverse decodes windows from the end under a memory budget; loops are packet copies; borders and blur reuse the geometry runner | Accepted | 2026-10-01 |
| ADR-0040 | Sound tools measure and shape audio in our own DSP; ffmpeg.wasm only decodes and encodes; results state measured output | Accepted | 2026-10-01 |
| ADR-0041 | Silence removal: one cut plan for the timeline and the engine; video cuts snap to frames and re-encode | Accepted | 2026-10-01 |
| ADR-0042 | Audio sync and track selection are packet copies; sync is sample-exact only where an edit list can be written | Accepted | 2026-10-01 |
| ADR-0043 | Sound pages are one page per input kind when the job and output differ; heroes may be the primary control | Accepted | 2026-10-01 |
| ADR-0050 | Sound re-encoded beside a picture runs in its own composable Conversion; Opus encoder delay is measured and written into every container | Accepted | 2026-10-08 |
| ADR-0051 | Keyboard shortcuts and gestures site-wide: three layers, page keys first | Accepted | 2026-10-08 |
| ADR-0052 | Codec pairs are locked pair pages; the duplicate check compares options after engine defaults | Accepted | 2026-10-08 |
| ADR-0053 | One address per page: a real 404 for every unknown URL and one-hop canonical redirects | Accepted | 2026-10-08 |
| ADR-0054 | Engines test what the browser can do instead of asking; every track the plan promises must be in the output | Accepted | 2026-10-08 |
| ADR-0055 | Copies carry the source's real start and end: Matroska CodecDelay read and written, cut-short Matroska read to its cut, page times from the file's start | Accepted | 2026-10-08 |
| ADR-0056 | The ffmpeg.wasm path keeps every sound track, says why it failed, and is corrected for FFmpeg 5.1; the inspector names what mediabunny cannot | Accepted | 2026-10-08 |
| ADR-0057 | Channel downmixes are ours (BS.775, scaled), the audio plan states what the encoder writes, lossy level loss is measured and corrected, and video cuts fall back to Baseline H.264 | Accepted | 2026-10-08 |
| ADR-0058 | Large outputs stream to OPFS through one output helper; results cross to the page as Blobs | Accepted | 2026-10-08 |
| ADR-0059 | ffmpeg.wasm reads inputs in place, refuses outputs it cannot hold, and applies Matroska CodecDelay itself | Accepted | 2026-10-08 |
| ADR-0060 | Picture re-encodes cut odd edges, carry or infer colour tags, and stay near the source's bitrate | Accepted | 2026-10-08 |
| ADR-0061 | WebKit's AAC encoder is measured and corrected like any other; MP3 copies out of Matroska carry a LAME gapless header | Accepted | 2026-10-08 |
| ADR-0062 | A tool ships only when it is genuinely good at its job in the browser; on-device models are a later, separate wave | Accepted (quality bar, model-free) · model wave rejected by ADR-0105 | 2026-11-18 |
| ADR-0063 | Blur part of a video: key-framed regions sized relative to themselves, one WebGL renderer for preview and output, no pixelate page | Accepted | 2026-11-18 |
| ADR-0064 | Image layers: free placement, stack order and animated stickers decoded once in the worker; a separate page from the watermark | Accepted | 2026-11-18 |
| ADR-0065 | Green screen: a colour-difference keyer against a local screen plate, shared shaders, and no transparent output | Accepted | 2026-11-18 |
| ADR-0066 | The composite gains a whole-frame WebGL stage, page time and a sound switch; region and layer tools refuse ffmpeg-only inputs with a way to convert | Accepted | 2026-11-18 |
| ADR-0069 | Styled burn-in stays on add subtitles: three looks, a position band, short phrases timed by length, tracks inside the video; no separate burn page | Accepted | 2026-11-18 |
| ADR-0070 | Progress bar and timer: one time-overlay engine, frame-time spans that end on the last frame, fixed-cell digits; the layer composite checks Cancel per frame | Accepted | 2026-11-18 |
| ADR-0071 | Intro and outro: cards fitted to the main video on its frame grid, crossfades over picture and sound, written by the compose writer | Accepted | 2026-11-18 |
| ADR-0075 | Time and layout tools write through one compose writer; freeze frame re-encodes the picture and copies the sound when it is unchanged | Accepted | 2026-11-18 |
| ADR-0076 | Zoom and pan: key frames with a log-scale zoom, fractional views drawn with high-quality filtering, previewed with the same function | Accepted | 2026-11-18 |
| ADR-0077 | One layout engine for picture in picture, side by side and stacked: a 3840 px frame cap, sound mixed under a limiter, a preview with its own clock | Accepted | 2026-11-18 |
| ADR-0078 | Clips for short-video platforms: proposals at pauses and key-frame scene changes, every clip re-encoded, platform lengths only from dated sources | Accepted | 2026-11-18 |
| ADR-0081 | Denoise is a spatio-temporal non-local means on the GPU, its strength set by grain measured in the video | Accepted | 2026-11-18 |
| ADR-0082 | Sharpen is a brightness-only unsharp mask with a grain threshold and a halo limit, on the denoise renderer | Accepted | 2026-11-18 |
| ADR-0083 | Stabilize measures global motion by direct alignment, smooths the path with a Gaussian and holds it inside the picture | Accepted | 2026-11-18 |
| ADR-0084 | Black bars are found on the page from 24 sampled frames by agreement, on the crop engine with a `bars` preset | Accepted | 2026-11-18 |
| ADR-0085 | Change bitrate is its own engine: explicit video kb/s in the source's codec where possible, sound copied or at its own rate, the written rate read back | Accepted | 2026-11-18 |
| ADR-0087 | Pitch shifting is a band-limited resample plus a phase-locked vocoder that keeps attacks; one page for audio and video | Accepted | 2026-11-18 |
| ADR-0088 | Key and tempo come from our own signal analysis; the finder is a multi-file page whose list is the results table | Accepted | 2026-11-18 |
| ADR-0089 | Merge audio copies MP3 frames when the files match and otherwise decodes once; multi-file jobs may run on the page | Accepted | 2026-11-18 |
| ADR-0090 | The ringtone maker writes iPhone M4R and Android MP3 or OGG, suggests the loudest 30 s, and enforces no length limit until one is verified | Accepted | 2026-11-18 |
| ADR-0091 | New sound tools resample with a Kaiser-windowed sinc, not linear interpolation | Accepted | 2026-11-18 |
| ADR-0092 | Cached worker scripts keep the worker's own URL; every worker says when it is ready (the sound worker stall) | Accepted | 2026-11-18 |
| ADR-0093 | Animated WebP, APNG and AVIF from video: our own muxers, an AV1 bitrate per pixel, BT.601 planes we convert ourselves | Accepted | 2026-11-18 |
| ADR-0094 | The sharpest frame is the highest Laplacian variance on 2×2-averaged brightness; one page, the thumbnail maker deferred | Accepted | 2026-11-18 |
| ADR-0095 | Embedded MP4 covers are shown by macOS Finder and Quick Look; no separate cover page this round | Accepted | 2026-11-18 |
| ADR-0096 | Creation dates are rewritten in every header and date key in place, set with a zone or shifted, on the edit-metadata engine | Accepted | 2026-11-18 |
| ADR-0097 | Repair keeps every complete packet of a cut-off MP4, MOV, fragmented MP4, MKV or WebM; a missing index is diagnosed, not rebuilt | Accepted | 2026-11-18 |
| ADR-0098 | Thumbnail maker and frame-as-cover pages: suggestions scored on the page, one engine under two ids, MOV covers on the cover page | Accepted | 2026-11-18 |
| ADR-0099 | Recorders replace the drop zone through an optional capture hook; the finished file opens as the result | Accepted | 2026-11-18 |
| ADR-0100 | Recordings are MP4 with H.264 and AAC at fixed densities, sized from the first frame, with the AAC priming signalled; sound is never resampled by mediabunny | Accepted | 2026-11-18 |
| ADR-0101 | The voice recorder writes M4A, WAV or Opus as it records; browser voice processing stays on by default | Accepted | 2026-11-18 |
| ADR-0102 | The site installs as an app; a hand-written service worker caches visited pages and what they loaded, and updates without asking | Accepted | 2026-11-18 |
| ADR-0103 | Files shared to the app open a chooser of tools and are handed on, several at once where the tool takes several | Accepted | 2026-11-18 |
| ADR-0104 | Recorder code loads only on recorder pages; the idle chunk is shared by every tool page | Accepted | 2026-11-18 |
| ADR-0105 | No on-device ML models: the toolkit stays model-free | Amended by ADR-0106 | 2026-11-19 |
| ADR-0106 | Small on-device models (under 2 MB each) are allowed for four named jobs | Accepted | 2026-11-19 |
| ADR-0107 | First-load script budget raised to 300 KB (home and hubs) and 350 KB (tool pages) | Accepted | 2026-11-19 |

---

## ADR-0001: Product name is undecided; "ilovevideos" is a codename

**Status:** Open (launch blocker) · **Date:** 2026-09-02

### Context
"ilovevideos" echoes iLovePDF/iLoveIMG (iLovePDF S.L.). ilovevideo.dev, .fun, .ai and ilovevideoeditor.com already exist; ilovevideo.dev is the same concept. Brand searches are not our acquisition channel; task searches are.

### Decision
Use `ilovevideos` as the repo/codename only. All brand strings come from `site.name` (`NEXT_PUBLIC_SITE_NAME`). Choose a distinctive, ownable name with an available .com before launch. Candidate criteria: two syllables, pronounceable, no "video" trademark collisions, works as a wordmark in a neutral grotesque.

### Consequences
No hardcoded brand text in components or content. Registry content must not mention the brand by name.

---

## ADR-0002: Next.js App Router over Astro

**Status:** Accepted · **Date:** 2026-09-02

### Context
Hundreds of static SEO pages, each with a heavy client-side island (the stage). Candidates: Next.js 16, Astro 5 with React islands, React Router 7 framework mode, TanStack Start.

### Decision
Next.js. Reasons: `generateStaticParams` + Metadata API + `sitemap.ts`/`robots.ts` cover the SEO surface natively; `next-intl` gives locale routing with static params; typed routes; `next/font`; custom headers for COOP/COEP; Vercel deploy with zero config. Astro would produce slightly smaller pages but its React-island story for a large stateful workspace (workers, OPFS, zustand) is less mature and the team's velocity is higher in Next.

### Consequences
Keep App Router pages thin and static; hydrate only the stage. Watch bundle size on first load (< 90 KB budget). Revisit if Next.js static export of ~10k pages × locales becomes slow (shard builds or move hubs to on-demand ISR).

---

## ADR-0003: Geist Sans + Geist Mono, single family

**Status:** Accepted · **Date:** 2026-09-02

### Context
Monochrome UI puts all hierarchy on type. Needs tabular figures, optical sizing, tight display tracking, self-hosting, permissive licence.

### Decision
Geist (SIL OFL) via the `geist` package. Inter with `cv11/ss01` was the alternative; Geist has better default forms at display sizes and avoids the "default Inter" look. One family; mono only for ffmpeg command display.

### Consequences
`--font-geist-sans`/`--font-geist-mono` CSS variables set on `<html>`; tokens reference them. If Geist ever underperforms in a locale's script, add a per-locale fallback stack, not a second display family.

---

## ADR-0004: ffmpeg.wasm as fallback engine; GPL build accepted with compliance

**Status:** Accepted · **Date:** 2026-09-02

### Context
mediabunny/WebCodecs covers the fast path but not legacy codecs, libass burn-in, vidstab, loudnorm, delogo. ffmpeg.wasm's default core is built with `--enable-gpl` (x264/x265). We ship it to browsers (distribution).

### Decision
Use `@ffmpeg/core-mt` GPL build for the fallback engine. Comply: publish our exact build configuration and a link to the corresponding source on the licences page; the engine layer that links to it is itself open-source-compatible (GPL-compatible licence for `src/tools/engines/ffmpeg/**`). Prefer WebCodecs for all H.264/HEVC encoding so x264/x265 are rarely exercised. Evaluate a custom LGPL core (no x264/x265, with libvpx/aom/opus) in Phase 2 if the GPL obligation becomes a problem for a Pro tier.

### Consequences
Licences page is a launch requirement. Engine code layout must keep the ffmpeg-linked module separable.

---

## ADR-0005: Cross-origin isolation on all pages (COOP same-origin, COEP credentialless)

**Status:** Accepted · **Date:** 2026-09-02

### Context
Multithreaded ffmpeg.wasm needs SharedArrayBuffer, which needs cross-origin isolation. Isolation blocks third-party resources without CORP/CORS (ads, embeds, many analytics). No market leader isolates their SEO pages because they monetise with ads and convert server-side (see research §5).

### Decision
Set COOP `same-origin` and COEP `credentialless` sitewide. We have no ads and no third-party scripts (ADR-0006), analytics is first-party proxied, fonts are self-hosted, so isolation costs nothing. `credentialless` (rather than `require-corp`) lets cross-origin images/media load without credentials, reducing breakage.

### Consequences
Any future third-party script must send CORP or be proxied. If isolation ever needs to be dropped, the escape hatch is the single-threaded ffmpeg core (slower) — WebCodecs paths are unaffected either way. Safari support for `credentialless` must be verified at implementation time; fall back to `require-corp` with CORP on our own assets if needed.

Amended 2026-10-08: Safari does not support `credentialless`, so it was never cross-origin isolated and ffmpeg.wasm could not run there (site QA). COEP is now `require-corp` sitewide; everything the site loads is same-origin, which needs no CORP header. Verified: WebKit reports `crossOriginIsolated` true.

---

## ADR-0006: No advertising; revenue via optional Pro tier later

**Status:** Superseded by ADR-0012 · **Date:** 2026-09-02

### Context
Ads conflict with: cross-origin isolation (ADR-0005), the premium monochrome design, CLS budgets, the privacy promise (ad networks track), and page speed. Competitors that run ads convert server-side and look like it.

### Decision
No ads at launch or in Phase 2. Revenue options, in order of preference when needed: Pro tier (server processing for heavy jobs, larger batch, API, priority support); donations/sponsorship of the open-source engine layer; affiliate links only where editorially honest (e.g. a recommended external tool), disclosed.

### Consequences
Runway must come from elsewhere until Pro exists. Do not design ad slots into any layout.

---

## ADR-0007: One handbook plus PROGRESS/DECISIONS as the memory system; hooks enforce it

**Status:** Accepted · **Date:** 2026-09-02

### Context
The initial setup produced 21 Markdown files under `docs/` (index, eleven numbered documents, six ADRs, two research notes). Coding agents start every session with no memory of the previous one, so they either re-read everything or re-derive decisions. Rules about which skill or agent to use lived only in prose and were not followed reliably.

### Decision
Three files carry all project knowledge: `README.md` (the normative handbook, one file with stable section anchors), `DECISIONS.md` (this append-only ADR log) and `PROGRESS.md` (current state, next steps, roadmap, session log). `CLAUDE.md` is the agent entry point and holds a mandatory routing table. Enforcement is mechanical: a `SessionStart` hook injects the current state and decisions index; a `UserPromptSubmit` hook adds routing hints; a `PostToolUse` hook reminds, once per area per session, which rules, agent or skill apply to the edited path; a `Stop` hook blocks once if source changed but `PROGRESS.md` was not updated; `pnpm lint:docs` fails when a referenced README anchor disappears or the required sections are missing.

### Consequences
`docs/` is retired; references point to `README.md#<anchor>`. README is long, so readers and agents read sections by anchor, never the whole file. Every session ends with a handoff entry. Decisions are written when made, not reconstructed later. The cost is one extra minute per session and a longer README; the benefit is continuity across sessions and contributors.

---

## ADR-0008: Visual-first tool cards with monochrome vector illustrations

**Status:** Accepted · **Date:** 2026-09-02

### Context
The original design system gave tool cards a 24px glyph and two lines of text. With 70+ core tools and 500 pages, a grid of near-identical text cards reads as a directory, not a product, and gives no visual cue about what each tool does. The owner asked for a clean monochrome SaaS look that is also visual first, with a picture on every home-page card.

### Decision
Every tool gets a monochrome vector illustration of its operation, one per engine with optional per-tool variants, drawn as inline SVG on a 240×160 canvas with 1.5 monoline strokes, using only `fg`, `fg-muted` and `bg-raised` tokens. The tool card becomes an illustration with a caption (Design system §7.1 and §8.7). The same SVG feeds the per-tool OG image. Illustrations are static; no hover, scroll or load animation. Alternatives rejected: photography or screenshots (colour leaks, weight, CLS), 3D renders and coloured illustrations (breaks the monochrome rule and the anti-pattern table), icons only (status quo).

### Consequences
An illustration system becomes part of the Phase 0 UI kit and a per-engine deliverable: adding an engine means drawing its illustration. Each SVG is capped at 3 KB and inlined, so the home page HTML budget must account for roughly 48 × 3 KB at most on the full grid (paginate or lazy-render below the fold if it threatens the 60 KB page budget). The `design-reviewer` gate checks illustrations against §7.1.

---

## ADR-0009: Warm neutral palette with a single accent slot, superseding strict grayscale

**Status:** Accepted · **Date:** 2026-09-02

### Context
The design principles mandated a strict zero-chroma grayscale chrome. The owner reviewed a reference (a SaaS landing page with an off-white ground, white cards, deep green-black ink, generous whitespace and one accent colour) and a working prototype of our home page in that language at `/dev/home`, and preferred it clearly. Alternatives: keep pure grayscale (rejected as colder and more generic-looking than the warm version); adopt a hued accent now (cobalt, terracotta and plum were prototyped).

### Decision
Adopt a warm neutral palette: off-white ground, white surfaces, deep green-black ink, near-zero chroma throughout, with exactly one `accent` token used in at most three places per screen (primary action, real progress, one link). The accent is set to the ink for now ("black accent"); it can be changed in one token later. `destructive` and the focus ring remain the only other colour. A matching warm dark theme is defined. Values live in `globals.css`; Tailwind's chromatic palettes stay disabled.

### Consequences
Design principles §1.1 and design system §1 are rewritten; the anti-pattern table is unchanged. Path-scoped UI rules now say "semantic tokens only, one accent" rather than "grayscale only". Illustrations (ADR-0008) keep using `fg`/`fg-muted`/`bg-raised`, so they adapt automatically. If a hued accent is chosen later, `accent-fg` contrast must be re-checked and the three-places rule enforced in design review.

---

## ADR-0010: Light theme only at launch; dark theme defined but not shipped

**Status:** Accepted · **Date:** 2026-09-02

### Context
The system-default theme made the site appear dark for a viewer whose OS or saved preference was dark, which confused a review of the newly approved warm palette (ADR-0009). The reference design is light only. Designing, reviewing and testing a second theme across hundreds of pages is real work that competes with shipping tools.

### Decision
Ship light only. The layout forces `data-theme="light"` through the theme provider; the header has no theme toggle. The warm dark token set remains defined in `globals.css`, unused, so dark mode can be re-enabled with a one-line provider change once it has had its own design pass. The video stage stays dark in every theme.

### Consequences
Contrast and visual regression checks run against light only. The design definition of done drops "both themes" until this is revisited. Any component that hardcodes a `gray-*` value for the always-dark stage must still read correctly on the dark stage, which is unchanged.

---

## ADR-0011: Flow-first tool pages: no duplicate pages, task-shaped controls, generated format pairs

**Status:** Accepted · **Date:** 2026-09-02

### Context
The first five tool pages were built engine-first. Three problems followed and the owner caught all three: a `resize-video` page that duplicated the compress engine's resolution cap and used a word users read as crop/aspect-ratio; a trim page whose only control was two number inputs; and a hand-written `mov-to-mp4` page with no answer to how hundreds of format pairs would be authored. The competitive research already recorded how incumbents structure converters (CloudConvert: hub page + pair pages both directions; FreeConvert: ~7% of the N² matrix shipped, 91% shared text per pair) and our SEO strategy already prescribed a format-profile library; neither had been implemented.

### Decision
1. A tool page starts from the user's job, not from an engine. The flow brief (README, Tool page specification §0) is mandatory and the `tool-builder` agent reports it. The vocabulary table fixes what "compress", "resize", "convert", "trim" mean; "resize" is reserved for geometry tools.
2. No two pages may share an engine and identical preset options; `pnpm lint:registry` rejects it. `resize-video` is deleted; resolution lives in compress.
3. The primary control matches the data: time ranges get a filmstrip timeline with frame-accurate drag handles (`TrimTimeline`), sizes get presets and a target, formats get detected source plus target, geometry will get a visual frame. Number inputs are companions for precision, never the primary control.
4. Format pairs are generated: `src/content/formats/` holds one profile per format; `src/tools/registry/pairs.ts` composes a page from two profiles plus a hand-written pair story and FAQs, with `what` derived from the codec matrix so it is truthful per pair. Profile paragraphs are shared by design and exempt from the duplicate check; each page must carry ≥ 150 words of its own. One generic `/video-converter` handles every other combination.

### Consequences
Four pair pages ship (mov, mkv, webm → mp4; mp4 → webm) with the converter hub; adding a pair is one `PairSpec` with a real story. Legacy containers (AVI, WMV, FLV) wait for the ffmpeg engine. The validator's shared-paragraph exemption means profile text repeats across pair pages, which the SEO research shows is acceptable when the page-specific share is substantial. Any page that fails the brief is deleted, not patched.

---

## ADR-0012: Completely free: no Pro tier, no paid features, no ads

**Status:** Accepted · **Date:** 2026-09-30

### Context
ADR-0006 ruled out ads but left a Pro tier (server processing, larger batch, API, priority support) as the revenue path. The owner decided on 2026-09-30 that the app is completely free to use, with no Pro tier.

### Decision
Every tool, feature and limit is free for everyone, with no account. There is no Pro tier, no paid plan, no feature gating, no usage caps beyond what the user's device can handle, and still no ads (ADR-0006's reasoning on ads stands). Batch processing, chaining, presets and large files are free features, not upsell hooks.

### Consequences
No layout carries upgrade prompts, locked controls or plan comparisons. Copy never says "free tier" or implies a paid version. The on-device path is the product. The opt-in server fallback in the feature catalog (backend S), if it is ever built, is free as well; with no revenue its running cost is the main argument against it, so it needs its own ADR before any work starts. ADR-0004's note about evaluating an LGPL core "for a Pro tier" no longer applies; the GPL compliance duty itself is unchanged. Funding the hosting is the owner's concern outside the product.

---

## ADR-0013: Compress families from dated primary-source limits; decimal MB targets verified by measurement

**Status:** Accepted · **Date:** 2026-09-30

### Context
Size pages ("under 10 MB", "for Discord") promise a hard limit. Platforms rarely say which megabyte they mean, their own help pages disagree (Discord, checked 2026-09-30: 10, 20, 50 and 500 MB across three articles), and encoders do not hit a bitrate exactly. The catalog listed about 15 platforms, most of whose limits are only known from third-party posts.

### Decision
Platform limits live in `src/content/platforms/`, one profile per platform with source URL, date read and a near-verbatim quote; a platform whose limit cannot be read from its own help pages gets no page. Pages are generated by `src/tools/registry/compress-families.ts` from a profile or size plus a hand-written story; "what N MB buys" numbers come from the engine planner; one mechanics paragraph is shared by design and exempt from the duplicate check. Targets are decimal MB (the stricter reading). The planner keeps a margin, lowers audio then resolution as the budget shrinks, refuses below a quality floor with the number and the longest clip that fits, measures the output and re-encodes once if over. Pages default to the tier every account can send; a source already under the target is not re-encoded.

### Consequences
Three platform pages (Discord, WhatsApp, email) and seven size pages ship; more platforms need primary sources first. Limits are re-checked quarterly. Displayed sizes still use binary megabytes (`formatBytes`), so the display and the targets disagree near the limit until a site-wide unit decision is made.

---

## ADR-0014: Multi-input and multi-output runs; lossless cuts and joins are packet copies

**Status:** Accepted · **Date:** 2026-09-30

### Context
Split and merge were the first tools with several outputs and several inputs; the stage, worker protocol and engine types were single-file. Separately, mediabunny's Conversion forces a transcode whenever a trim starts after the first timestamp, so a "lossless" cut built on it silently re-encodes.

### Decision
The single-file API stays and delegates to a general one: `EngineResult.files` (first entry equals `blob`), worker `run.inputs` and `done.files`, `EngineClient.runMany`, `Progress.item`, `MediaInfo.video.keyframes` (read on request via `inspect(file, {keyframes})`), and `OptionsSpec.multiple` / `inputNotes` / `inspectKeyframes`. `FileList` is built to be reused by the batch queue. Lossless cuts and joins copy encoded packets between keyframes (`engines/split/copy.ts`, merge `concat.ts`) instead of using Conversion trims; merge copies only when codec, profile, level, size, rotation, audio layout and decoder config bytes match, and otherwise re-encodes to the first clip's frame. Multi-part downloads use a store-only zip writer in `src/lib/zip.ts` (no dependency).

### Consequences
Every existing single-file tool is unchanged. Trim must move to the same packet copy (in progress on 2026-09-30). Outputs are held in memory until an OPFS path exists. The zip writer is limited to 4 GiB and 65,535 entries.

---

## ADR-0015: Crop and aspect ratio are separate engines on one geometry runner; geometry always re-encodes

**Status:** Accepted · **Date:** 2026-09-30

### Context
Cropping a rectangle and fitting a video to a target shape could be one engine with modes. The jobs differ (a user-drawn rectangle versus a target ratio with fill or fit), and padding has no crop equivalent.

### Decision
Two engines, `crop` and `aspect-ratio`, sharing one runner; aspect-ratio's fill mode reuses the crop path. The primary control is a frame drawn over the preview (ADR-0011). Geometry always re-encodes the picture to H.264 with even dimensions; padding keeps the source's long side so nothing is upscaled. Audio is copied when the container allows. ffmpeg.wasm handles containers mediabunny cannot read.

### Consequences
Per-platform "resize for" pages can be generated on aspect-ratio presets. Blurred-background padding and black-bar detection are separate later work.

---

## ADR-0016: Per-page tuning through optional OptionsSpec hooks, never forked stages

**Status:** Accepted · **Date:** 2026-09-30

### Context
The owner asked on 2026-09-30 that every page be tuned to its own job as a product designer would, not the same page with a different options panel. Forking the stage per tool would multiply the state machine, accessibility and mobile work by the number of tools.

### Decision
`ToolStage` stays the single state machine. Per-tool behaviour comes from optional `OptionsSpec` hooks and registry data: `dropPrompt` and `Idle` (idle), `Overlay` and `Below` (primary control), `blocked`, `summary`, `inputNotes` (ready), `Progress.item` and `detail` (processing), `result`, `previewResult`, `nextStep` (done). Each page answers the five-state questions (what idle says, what dominates in ready, which real numbers show while processing, how done confirms success and what comes next, which errors are specific) in its flow brief.

### Consequences
Adding a hook is an additive change to `options/types.ts` and the stage, reviewed for overlap with existing hooks. The 13 pages that predate the hooks are redesigned against their per-page briefs.

---

## ADR-0017: Platform pages may share processing options with a plain page when their tiers are the primary control

**Status:** Accepted · **Date:** 2026-09-30

### Context
ADR-0011 rejects two pages with the same engine and preset options. `compress-video-for-discord` (10 MB default) and `compress-video-under-10mb` encode the same bytes by default; they passed only because the Discord page carried a UI-only `platform` key, which defeated the check by accident (SEO audit 2026-09-30).

### Decision
The duplicate signature ignores UI-only preset keys (`UI_ONLY_KEYS` in `scripts/validate-registry.ts`, currently `platform`), so it compares what the engine does. A twin is allowed only when one side is a platform page whose platform offers at least two tiers: its job and primary control differ (a choice between an account's dated, sourced limits, not a fixed number). Two plain pages with equal processing options still fail. Generated family pages carry at least 250 hand-written words; generator-written steps and computed paragraphs are marked (`familyGeneratedText`) and do not count.

### Consequences
A single-tier platform page cannot duplicate a size page; it must be a size page instead. New UI-only keys are added to `UI_ONLY_KEYS` deliberately.

---

## ADR-0018: Signal WebCodecs AAC encoder delay with an MP4 edit list; lossless trim and split share one packet copy

**Status:** Accepted · **Date:** 2026-09-30

### Context
Every tool that re-encoded audio started the sound about 59 ms late and ran long (3.088 s for a 3.0 s source). WebCodecs AAC encoders emit priming samples (2112 on Chromium macOS, measured) without reporting them, and mediabunny 1.55.5 can only write an empty edit, not a media time. Separately, "lossless" trim ran through mediabunny's Conversion, which silently re-encodes every track whenever the start is after the first timestamp (observed: AAC 96 → 171 kbps).

### Decision
Measure the encoder delay once per sample rate and channel count in the worker (`mediabunny/priming.ts`: encode a pulse, find it in the decoded output; cached), then rewrite `edts`/`elst` of each encoded AAC track in MP4/MOV/M4A outputs (`mediabunny/edit-list.ts`: `media_time` = priming, segment ends where the encoded sound ended). Applied once in the shared `convert()` runner and in merge re-encode, never per engine; copied audio is untouched; if the delay cannot be measured the file is left as muxed. Rejected: dropping priming packets (lossy, breaks MDCT overlap), shifting video, a hard-coded 2112 (platform-dependent). Lossless trim and split use one keyframe-aligned packet copy (`mediabunny/packet-copy.ts`); the start snaps back to the previous keyframe and the page says where it actually starts.

### Consequences
Measured onset 0.0587 → 0.0108 s and durations exact on compress, merge, aspect ratio and trim precise. About 11 ms of first-frame attenuation remains because mediabunny starts audio decoding without pre-roll; fixing it needs an upstream change or a local patch (not taken). Safari's decoder behaviour is unverified; calibration returns 0 there if it trims priming itself. Lossless trim is byte-identical and about three times faster.

Amended 2026-10-08 (see ADR-0050): the first-frame attenuation is fixed in our layer (onset 0.16 ms).

---

## ADR-0019: Platform frame specs, a capped aspect-ratio engine and codec-aware conversion routing

**Status:** Accepted · **Date:** 2026-09-30

### Context
Resize-for-platform pages need a target shape and pixel size; platforms publish these mostly in ads specs, some only as minimums. Legacy pairs showed the copy/re-encode decision was keyed to the container while codec names differed between inspectors ("h264" vs "avc"), and streams the browser cannot decode were routed to WebCodecs anyway.

### Decision
Frame specs live in `src/content/platforms/frames.ts`, one profile per platform surface with source URL, date read and near-verbatim quote; a platform whose spec cannot be read from its own pages gets no page, and where the platform names no maximum the ceiling is ours and the page says so. Platform pages are the aspect-ratio engine with `maxWidth`/`maxHeight` (scale down, never up) and optional `maxSec`; two platforms with identical processing cannot both have a page. The converter compares codecs under mediabunny's names and sends any stream the browser cannot decode that must be re-encoded to ffmpeg.wasm, even from a container the native reader opens. There is no `/resize-video` hub: it would duplicate change-video-aspect-ratio (ADR-0011).

### Consequences
Five platform pages (TikTok, Instagram Reels, YouTube Shorts, YouTube, Facebook) and 16 more pairs ship; ProRes MOV, AC-3 in TS/MKV and H.263 3GP now convert through ffmpeg instead of failing. X, LinkedIn, Instagram feed and others wait for a readable primary source or a distinct job. Frame specs are re-checked quarterly with the upload limits.

---

## ADR-0020: Audio conversion: OGG means Vorbis, copies are packet copies, lossless PCM goes through ffmpeg, audio pages get a Hero

**Status:** Accepted · **Date:** 2026-09-30

### Context
Audio pair pages need honest copy-versus-encode claims. Packet hashing showed mediabunny's Conversion re-encodes AAC whose first packet is priming (negative timestamp), so the earlier "AAC → M4A lossless" claim was false, and its 16-bit PCM writer is not the inverse of its reader (×32767 vs /32768). ".ogg" means Vorbis to users and most software. The stage assumed a video preview.

### Decision
Targets are MP3, M4A, WAV, FLAC, OGG (Vorbis, via ffmpeg), Opus (.opus, native) and AIFF (ffmpeg); WMA and AIFF are read by ffmpeg. One planner (`video-to-audio/plan.ts`) serves video → audio and audio → audio. Audio copies are packet copies that keep AAC priming and write an edit list (`video-to-audio/copy.ts`), never Conversion. Lossless sources to WAV route through ffmpeg for bit-exact samples, and 24-bit sources stay 24-bit. Audio pairs are generated from `content/formats/audio-profiles.ts` plus a story. Add/replace audio copies the picture's packets and encodes the sound once to AAC 192 kbps (Opus for WebM), copying it when unchanged. `OptionsSpec.Hero` replaces the preview for inputs without a picture (waveform).

### Consequences
The first FLAC → WAV or AIFF conversion loads the ffmpeg core. Extract-audio's OGG choice is now Vorbis. Every remux claim built on Conversion needs the same audit (started 2026-09-30). Native MP3 and AAC decoding still starts 25 ms and 10.5 ms late until decoder delay is trimmed.

---

## ADR-0021: Stream copies never go through mediabunny Conversion

**Status:** Accepted · **Date:** 2026-09-30

### Context
Conversion re-encodes any track whose first packet is before its start. AAC from ffmpeg, phones and cameras opens with a priming packet at −0.023 s, so every "streams copied" path on such a file re-encoded its sound: mov-to-mp4, mp4-to-mov, mp4-to-mkv, m4v-to-mp4, remove-metadata and metadata rotate (measured 96.6 → 176 kbps, 131 → 133 packets). MKV, TS and WebM sources were unaffected.

### Decision
One packet copy (`copyCore` in `mediabunny/packet-copy.ts`) serves remux, trim, split and extract audio; `convert()` in `mediabunny/shared.ts` routes every copy-only job there first and falls back to Conversion only when a codec does not fit the container. In MP4/MOV/M4A it keeps the priming packet (or one pre-roll packet before a cut) and writes an edit list (`mediabunny/edit-list.ts`). In Matroska/WebM it shifts the whole file together (ffmpeg's `make_non_negative`), because mediabunny cannot write negative timestamps or `CodecDelay`. Supersedes the packet-copy part of ADR-0018 and point 3 of ADR-0020 (one implementation instead of two).

### Consequences
Copies are byte-identical per packet (unit-tested in Node against ffprobe MD5s, `tests/unit/packet-copy.test.ts`) and about five times faster; sound onset matches the source exactly. Trim and split outputs now carry the source's tags. Merge copy still drops each clip's priming packet (about 11 ms per join). The 16-bit PCM round-trip, MP3 decoder delay and AAC re-encode pre-roll are known and fixable without patching mediabunny; not done yet.

---

## ADR-0022: Subtitle muxing and burn-in through ffmpeg.wasm and libass with a bundled OFL font

**Status:** Accepted · **Date:** 2026-09-30

### Context
mediabunny 1.55 writes only WebVTT subtitles (`wvtt` in MP4; `S_TEXT/WEBVTT` in WebM, which ffmpeg cannot read). The ffmpeg.wasm core has libass but no fontconfig, so libass draws no text unless given a font file.

### Decision
Soft subtitle tracks are written by ffmpeg.wasm as stream copies: `mov_text` in MP4/MOV, SRT or the untouched ASS script in MKV, WebVTT in WebM; ffmpeg-only containers go into MKV. Burn-in defaults to a canvas composite with WebCodecs H.264; ASS scripts the bundled font fully covers, and ffmpeg-only containers, are drawn by libass with Geist Sans (OFL 1.1, already a dependency) served from `/wasm/fonts` with its licence, coverage generated from the font's character map (`scripts/geist-coverage.mjs`). Cues are clamped to the video length and text handed to a muxer is written clean. Watermarks are rasterised on the page to a PNG at output size and composited in the worker (ffmpeg `overlay` for ffmpeg-only containers). Subtitle pairs are generated from `src/content/subtitles/` plus a story, with `/subtitle-converter` as the hub; all subtitle utilities are one engine with a `job` preset. The font loader in `workers/assets.ts` is the only worker `fetch` (same-origin static asset, no user data; `privacy-allow`).

### Consequences
Soft tracks download the ffmpeg core once and hold the file in memory (about 2 GB). Styled ASS burn-in covers Latin, Vietnamese and Cyrillic; other scripts use the plain renderer. New stage hook `previewTrack` shows cues on the preview with native controls. The Geist files and the coverage table move together when `geist` is upgraded.

---

## ADR-0023: containers.ts is the only authority on what a container holds without re-encoding

**Status:** Accepted · **Date:** 2026-09-30

### Context
The planner and page copy said sound would be re-encoded to AAC, but the native path copied it: the convert-video engine never passed an `audio` option, and `remux()` asked mediabunny which codecs a container accepts. mediabunny's muxers accept more than players do (Opus in MOV, FLAC and Opus in MP4), so webm-to-mov wrote Opus in MOV (which Keynote and iMovie cannot import) and webm-to-mp4 kept Opus despite promising AAC (SEO audit 2026-09-30, P0; reproduced with ffprobe).

### Decision
`src/content/formats/containers.ts` decides what is copied. The planner and the native remux both read it; mediabunny's `getSupportedCodecs()` is only a second check. When the plan does not copy the sound, the engine forces an encode to the planned codec. Choosing H.264 for compatibility also makes the sound AAC (AAC sources are still copied). A remux that can copy the picture and main sound leaves out extra sound tracks the container cannot hold and says so in the result, instead of handing the whole file to a Conversion that would re-encode the main sound.

### Consequences
The page, the summary line, the result and the ffmpeg command agree on every pair (verified: webm-to-mov, MP4-with-Opus to MOV, webm-to-mp4, mkv/mp4-to-mov). New fixtures `sample-opus.mp4` and `sample-ac3.m4v`. Interlaced sources are re-encoded as progressive frames with both fields woven (combing on motion); deinterlacing is an open product decision. Inspect reports interlaced 720×576 as 720×288 (one field), a known bug.

---

## ADR-0024: On-device only (no server fallback); sizes shown in decimal megabytes

**Status:** Accepted · **Date:** 2026-09-30

### Context
Two questions stayed open while Phase 1 was built. The feature catalog kept an opt-in server fallback (backend S) for huge files and codecs browsers cannot encode, but the product is completely free (ADR-0012), so nothing pays for servers, and a server path complicates the privacy promise. Separately, size targets use decimal megabytes (ADR-0013) while displayed sizes used binary ones, so one card could show two numbers for the same file. The owner asked on 2026-09-30 to finish Phase 1; the main session took the recommendations it had given for both.

### Decision
There is no server fallback: every job runs on the user's device, and files or codecs the browser cannot handle get a specific message. `README.md` drops backend S. Every displayed size uses decimal units (1 MB = 1,000,000 bytes), matching the targets and how platforms and phones count.

### Consequences
No backend to build, run or secure; the privacy line is true on every page. `formatBytes` changes to decimal and every size on the site moves by about 5% at the MB scale. Reopening either needs a new ADR. Deinterlacing interlaced sources remains open (ADR-0023).

---

## ADR-0025: Batch queue as a stage mode decided by per-file hooks; command palette on Base UI with a static index; SI size units

**Status:** Accepted · **Date:** 2026-09-30

### Context
Batch processing (L1) and the command palette (L4) are Phase 1. Batching must not fork per-tool stages (ADR-0016); the palette must add nothing to first load; ADR-0024 moved sizes to decimal.

### Decision
Several files on a single-file page start `BatchStage`, one component for every tool, rendered by `ToolStage` and sharing `inspectFile`/`runJob` (`stage-run.tsx`), so a batch file is read and run exactly as a single one. Options come from the first readable file; `blocked` is asked per file (blocked or settled files are skipped with the reason); files run sequentially; a failure never stops the rest; Cancel stops the current file and everything after it; outputs are zipped with unique names. A page batches unless it has `Below`, `Overlay`, `noAction` or `multiple`, or sets `OptionsSpec.batch: false`: those hooks already declare a per-file primary control, so new tools get batch for free. `OptionsSpec.acceptHandoff` routes a handed-on file the drop zone rejects into a preset slot (add subtitles). The palette uses Base UI Dialog and Autocomplete (already installed) instead of cmdk, ranks with a pure local search (`lib/tool-search.ts`) over a static build-time `/tool-index.json` (about 4.6 kB gz) fetched on first open; the query never leaves the device and the palette does not animate. Sizes use SI symbols (B, kB, MB, GB); `onDeviceOnly` is removed from the schema.

### Consequences
One same-origin request when the palette first opens. Batch outputs are held in memory until OPFS exists. Panels see only the first file's `info` (`media.batch` is available for panels that adapt).

---

## ADR-0026: Per-tool keyboard shortcuts are scoped to the workspace

**Status:** Accepted · **Date:** 2026-09-30

### Context
Keyboard shortcuts (L8) help repeat work (I/O on trim, frame stepping, rotate keys), but window-wide listeners fight the command palette (⌘K), form fields and the page's own scrolling.

### Decision
Keys act only while focus is inside the tool's workspace, or nothing has focus and the last click was inside it; never in text fields; Space, arrows and Enter stay with the controls that use them (`src/components/tool/shortcuts.ts`). Space play/pause lives in the preview components, so it works on every video tool and in the done state. Pages declare their keys in `OptionsSpec.shortcuts`; the stage shows them in one disclosure hidden on touch-only devices. A hero that plays media attaches the stage's preview ref (`HeroProps.media`) so timelines and keys drive one player.

### Consequences
Shortcuts never trigger from elsewhere on the page. The 13 redesigned pages list their keys; other pages get Space automatically and list it with one line each.

---

## ADR-0027: Static CSP with build-time script hashes, not per-request nonces; middleware renamed to proxy.ts

**Status:** Accepted · **Date:** 2026-09-30

### Context
Phase 1 exit needs a strict CSP. In Next 16 nonces apply only during dynamic rendering, so every one of about 100 static pages would render per request, losing CDN caching and the no-per-request-compute model. JSON-LD is a data block and needs no nonce; the real inline scripts are Next's bootstrap and flight payloads. `middleware.ts` is deprecated in Next 16 in favour of `proxy.ts`.

### Decision
`next.config.ts` sends one CSP header on every response (`default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval' blob: 'unsafe-inline'`; `connect-src 'self' blob: data:`; `worker-src 'self' blob:`; `object-src`, `frame-src`, `frame-ancestors 'none'`; style `'unsafe-inline'` for React style attributes). After `next build`, `scripts/csp-hashes.mjs` writes a `<meta http-equiv>` policy into every prerendered page with the SHA-256 of each inline script and no `'unsafe-inline'`; the browser enforces both, so built pages run only same-origin files and those exact inline scripts. No eval anywhere: the ffmpeg runtime import is a bundler-ignored `import()`, and browser zod runs jitless through a resolve alias. COOP/COEP are unchanged (ADR-0005). The proxy file is `src/proxy.ts`.

### Consequences
Pages stay static; new inline scripts are hashed automatically. Pages rendered at runtime get only the header policy. A future third-party origin needs CSP entries and an ADR. Supersedes the "inline JSON-LD moves to a nonce" note in the README security posture.

---

## ADR-0028: A production deploy fails without NEXT_PUBLIC_SITE_URL

**Status:** Accepted · **Date:** 2026-09-30

### Context
Canonicals, sitemap, robots and JSON-LD fall back to `http://localhost:3000` when the site URL is unset, which would ship broken canonicals silently.

### Decision
`next.config.ts` throws when `VERCEL_ENV=production` or `REQUIRE_SITE_URL=1` and `NEXT_PUBLIC_SITE_URL` is unset or localhost. Local, CI and preview builds keep the fallback.

### Consequences
Setting the domain (ADR-0001) is one environment variable. Search Console and sitemap steps are documented under Launch steps in the README.

---

## ADR-0029: Lighthouse CI with the README budgets

**Status:** Accepted · **Date:** 2026-09-30

### Context
Phase 1 exit requires Lighthouse budgets on every page type.

### Decision
`@lhci/cli` (dev only, Apache-2.0) runs on `/`, `/tools/edit`, `/compress-video`, `/mov-to-mp4` and `/trim-video` with mobile emulation, three runs, asserting Perf ≥ 0.95, A11y/BP/SEO = 1, LCP ≤ 1.8 s, CLS 0, document ≤ 60 KB, first-load script ≤ 90 KB, zero third-party requests. Reports stay on disk. Directory, footer and card links do not prefetch.

### Consequences
CI fails until tool pages are code-split (measured 2026-09-30: tool pages about 580 KB gz of script and 5.3 s LCP; hub about 156–192 KB). The React plus Next baseline alone is above 90 KB gz, so the script budget needs an owner decision.

---

## ADR-0030: A tool page's first load is its drop zone; engine UI loads with the first file

**Status:** Accepted · **Date:** 2026-09-30

### Context
Tool pages loaded 574 kB gz of JS before any file, because the options map imported every panel and, through them, mediabunny, zod and the planners.

### Decision
`OptionsSpec` loads per engine on the first file (`options/index.ts`, `loadSpec`) together with one stage-parts chunk. A page's idle state (`IdleSpec`: `dropPrompt`, `Idle`, `several`) lives in `options/idle/<engine>.tsx` and the server page hands it to the stage, so it renders server-side. The stage receives `StageTool`, not the full tool definition. Idle modules stay free of engines and schemas; `tests/unit/idle-specs.test.ts` keeps them in line with each spec.

### Consequences
Tool pages drop to 179.8 kB gz (from 573.9), of which about 152 kB is the React, Next and next-intl floor every page pays. The first file drop waits one lazy load behind the same "Reading the file" state.

---

## ADR-0031: First-load script budget restated above the framework floor

**Status:** Accepted, numbers superseded by ADR-0107 (2026-11-19) · **Date:** 2026-09-30

### Context
The README budget of 90 kB gz of JS before a file drop is below the floor of the chosen stack: React DOM (71.5 kB), the Next runtime (46.1 kB) and next-intl (14.8 kB) come to about 152 kB gz on every page (measured 2026-09-30 after ADR-0030). Keeping 90 kB would mean a failing CI gate nobody can pass, or a different framework (ADR-0002).

### Decision
Home and hubs stay under 160 kB gz of first-load script; tool pages under 200 kB gz; our own code above the floor stays under about 50 kB on any page. `lighthouserc.cjs` asserts these per page type; every other Lighthouse budget is unchanged (Perf ≥ 0.95, LCP ≤ 1.8 s, CLS 0, document ≤ 60 KB, zero third parties). Taken by the main session to finish Phase 1; the owner can restate it.

### Consequences
The script gate is passable today (152 / 180 kB). LCP and the performance score are measured again against the unchanged budgets. Shrinking below the floor needs a framework-level change (for example dropping next-intl on single-locale builds), recorded separately if pursued.

---

## ADR-0032: mediabunny decode and mux gaps are corrected in our engine layer, never by patching the dependency

**Status:** Accepted · **Date:** 2026-09-30

### Context
Measured on 2026-09-30: 16-bit PCM re-encodes shifted samples above half scale by one step (reader /32768, writer ×32767); native MP3 decode started 25 ms late (LAME tag ignored); AAC re-encodes lost the first frame (no decoder pre-roll); lossless merge drifted about 19 ms per join; MPEG-TS inspect read interlaced 720×576 as 720×288; remove-metadata outputs carried the write time in `mvhd`/`tkhd`/`mdhd`.

### Decision
Correct each in our engine layer. Native audio-only re-encodes decode from AAC's priming packet or 50 ms before a cut, trim MP3 to its LAME gapless window, and scale integer PCM so it round-trips exactly (`mediabunny/audio-window.ts`, `mp3-gapless.ts`); FLAC/PCM → WAV therefore stays native. Lossless merge writes one continuous sound run timed by the codec frame length, keeps the first clip's priming behind a single edit list, and drops a clip's last packet when more than half of it lies past the clip's end. Multi-entry edit lists are rejected because mediabunny's own reader uses only the first edit. The inspector corrects field-coded H.264 size from the SPS (`avc-sps.ts`). Remove metadata zeroes the MP4/MOV header times after muxing (`clearMovieTimes`).

### Consequences
PCM and FLAC → WAV are sample-exact; MP3 and AAC audio-only outputs start on time with exact length; merge joins are within half a frame and never drift (stated on the merge page). Remaining: about 10.8 ms first-frame attenuation on re-encodes with video, Opus outputs 6.5 ms short (encoder does not flush look-ahead), and one FLAC reader case dropping a final partial frame. Upgrading mediabunny needs these checks re-run (`tests/unit/media-gaps.test.ts`).

Amended 2026-10-08 (see ADR-0050): all three remaining gaps are closed in our layer.

---

## ADR-0033: Lighthouse measures with applied throttling; Geist Sans ships as a Latin subset and Geist Mono is not preloaded

**Status:** Accepted · **Date:** 2026-09-30

### Context
With ADR-0030 and ADR-0031 in place, Lighthouse CI still failed LCP (2.3 to 3.1 s against 1.8 s). The traces showed observed LCP equal to FCP on every page (40 to 80 ms unthrottled): the LCP text is in the server HTML. The default simulated throttling counts every script fetched before the observed LCP as blocking it, and on localhost the scripts land first, so it reported LCP at time-to-interactive. Separately, both Geist faces were preloaded (70 KB each) although Geist Mono only sets ffmpeg commands below the fold.

### Decision
`lighthouserc.cjs` uses applied (devtools) throttling with Lighthouse's own mobile slow-4G numbers (562.5 ms latency, 1.47 Mbps down) and 4× CPU, so LCP is measured rather than estimated. Budgets are unchanged. Geist Mono is defined locally with `preload: false` (`src/lib/fonts.ts`). Geist Sans ships as a Latin subset (`src/fonts/Geist-Latin.woff2`, 33 KB instead of 70 KB, regenerated by `scripts/subset-geist.sh`, which needs fonttools); Geist is OFL 1.1 with no Reserved Font Name, so the subset keeps its name, and `src/fonts/OFL.txt` travels with it. Characters outside the subset fall back to the system sans. The subtitle burn-in fonts in `/wasm/fonts` stay full.

### Consequences
Lighthouse CI passes on all five pages (2026-09-30: LCP 1.54 to 1.57 s, performance 0.99 to 1.0, TBT under 12 ms). Text in non-Latin scripts renders in the system font until a locale needs its own subset (Phase 2 localisation adds subsets per locale).

---

## ADR-0034: The stage loads its parts in one step and reserves the working height on phones

**Status:** Accepted · **Date:** 2026-09-30

### Context
After ADR-0030 split the engine UI out of first load, design review 4 found two regressions. Each stage part was its own `React.lazy`, so the first render of any part suspended and the whole workspace was replaced by "Reading the file" for React's 300 ms fallback throttle, even mid-encode. And at 390 the Shell had no base minimum height, so the stage collapsed to a 71 px strip before growing to about 1100 px (CLS 0.36).

### Decision
`ensureSpec()` awaits the engine spec and the stage-parts module together and the stage renders parts from the loaded module: no `lazy()` or `Suspense` in the stage, and the "Reading the file" state appears only before the first spec load. The Shell keeps the drop zone's minimum height, and once a file is chosen it takes a reserved working height on phones (a token in `tokens.css`) so the stage grows in one step right after the user's action, which layout-shift scoring excludes, and the ready panel arrives inside the reserved box. `tests/e2e/stage-flash.spec.ts` samples the workspace every 16 ms to guard against the fallback and bounds CLS.

### Consequences
No fallback frames after a file is read (verified at 390 and 1280). Phones show a tall working area while a tool is active. Reading a file on a new engine still waits one lazy load behind the same "Reading the file" state.

**Amended 2026-10-08.** The one-step growth still scored 0.113 at 390 for a real picker or drop: a picker closes seconds after the tap that opened it and a drop is not input, so neither is excused by `hadRecentInput`. The idle drop zone now takes the same `--stage-min-h` (renamed from `--stage-min-h-active`) below md, so a chosen file changes no height; file lists hold a same-size row for each file still being read, and the list's summary row stacks on phones so its height does not follow its text. Rejected: a shorter drop zone that only reaches the fold (its top depends on the title's length) and an overlay workspace on phones (a redesign). Measured with a scripted drop: 0.000 at 390 on trim, compress, merge and a batch. Phones now show a tall drop zone with its button in thumb reach.

---

## ADR-0035: One per-frame filter runner: colour as a power curve plus an affine matrix, previewed with the same numbers

**Status:** Accepted · **Date:** 2026-10-01

### Context
Phase 2 adds black and white, colour looks, brightness/contrast/saturation and video fades (G4, G5, G9, G10). Each could be its own engine with its own maths, and a preview approximated with CSS filters would not match what the encoder writes (CSS brightness is a multiply, most "brightness" users want a midtone lift). Canvas 2D `filter` is not available in every browser's workers.

### Decision
One runner (`src/tools/engines/video-filter/`): decode → draw each frame through a colour transform → encode H.264. A transform is a per-channel power curve followed by an affine RGB matrix with offsets on 0–1 sRGB values (`color.ts`); every look, slider and fade is one of these, composed per frame. The worker applies it with WebGL 2 (one texture upload, one draw) and falls back to a 2D canvas and a pixel loop with the same numbers. The page previews it exactly with an SVG filter (`feComponentTransfer` gamma, then `feColorMatrix`) through `previewStyle` (`filter` added to that hook's contract), and the ffmpeg command and the ffmpeg.wasm fallback use `lutrgb` + `colorchannelmixer`. Two engines share it: `filter` (a `job` of mono, look or adjust drives the panel; batchable) and `video-fade` (its own engine id because its primary control is a timeline under the preview, which ADR-0025 makes per file).

### Consequences
Preview, output and ffmpeg command agree. No LUT (.cube) support; that needs a 3D texture path. Colour-space handling is whatever the browser does converting frames to sRGB for WebGL; HDR sources are not treated specially (unverified how they tone-map).

---

## ADR-0036: A re-encoded picture keeps the source's sound by packet copy, not by Conversion

**Status:** Accepted · **Date:** 2026-10-01

### Context
Frame rate, codec, filters, fades and borders change only the picture. mediabunny's Conversion re-encodes any sound whose first packet is before zero (AAC priming, ADR-0021), so a page saying "the sound is copied" would be false for most phone and ffmpeg files if the sound went through the same Conversion as the picture.

### Decision
`video-filter/picture.ts` encodes the picture alone (sound discarded), then joins it with the source's sound tracks through the packet copy (`copyTracks`, a small additive export from `mediabunny/packet-copy.ts` over `copyCore`, whose tracks may come from different inputs), which keeps priming behind an edit list. Sound the container does not hold as players expect (Opus or FLAC in MP4, AAC in WebM) is encoded once instead (AAC 128 kbps, or Opus in WebM), and a changed sound (a fade) goes through Conversion's audio `process`. `soundPlan` in `video-filter/plan.ts` decides, so the panel and the engine say the same thing.

### Consequences
"Sound copied" is verified in e2e by per-packet hashes (frame rate, black and white). The picture is held twice briefly (encoded alone, then muxed). The geometry runner (crop, aspect ratio, border) still sends sound through Conversion; its "copied" claim should get the same treatment (not changed here).

---

## ADR-0037: Frame rate only goes down, by dropping frames; codec changes promise only what the encoder confirms

**Status:** Accepted · **Date:** 2026-10-01

### Context
A4 lists "drop or blend"; A5 lists HEVC and AV1 whose encoders vary by browser and device. Blending (ffmpeg `framerate`) and interpolation (`minterpolate`) smear motion and are very slow in WASM; raising a rate without interpolation only repeats frames. The converter (ADR-0011/0023) already offers "keep" or "H.264" per container, not a codec choice.

### Decision
`framerate` lowers the rate only, with mediabunny's frame-rate transform (the last frame in each 1/fps slot; constant frame rate out); the page offers only rates below the source's and says whether the drop is even. `codec` is a separate engine (H.264, HEVC, VP9, AV1): the panel asks `canEncodeVideo` (VideoEncoder.isConfigSupported) for each codec at the file's size and bitrate and `VideoDecoder.isConfigSupported` for the source, marks each choice, and blocks with the reason; `supports()` asks the same. The container follows the codec (H.264/HEVC keep MP4/MOV/MKV, VP9 WebM, AV1 MP4), the bitrate is the best-quality density scaled by a working efficiency factor and capped by the source's own bitrate scaled the same way. No ffmpeg path for codec changes.

### Consequences
Pages never promise an encoder the browser lacks; headless Chromium in CI reports no HEVC encoder, so HEVC output is untested there. The efficiency factors are a choice, not a measurement, and the page shows real output sizes only.

---

## ADR-0038: Fast start rewrites the MP4 index in place of a remux

**Status:** Accepted · **Date:** 2026-10-01

### Context
A7 (optimise for web) could be a remux through the packet copy (whose MP4 muxer writes the index first), but a remux keeps only video and sound tracks, rewrites tags and holds the whole output in memory.

### Decision
`faststart` works like qt-faststart on the page: it reads top-level box headers and the `moov`, shifts every `stco`/`co64` offset by the new index size (widening to `co64` past 4 GiB) and builds the output Blob from slices of the original File around the new index. Already fast-start and fragmented files are settled in the panel; `saio` offsets are refused.

### Consequences
Byte-identical packets, every track, chapter and tag kept, size unchanged, near-instant, no memory copy (unit test compares ffmpeg streamhash on four fixtures). Only MP4/MOV/M4V/M4A/3GP.

---

## ADR-0039: Reverse decodes windows from the end under a memory budget; loops are packet copies; borders and blur reuse the geometry runner

**Status:** Accepted · **Date:** 2026-10-01

### Context
Reversing needs every frame, and decoders only run forwards; ffmpeg's `reverse` filter buffers the whole clip. Loops, boomerangs, borders and blurred backgrounds (C4, C5, D5, D9, G13) could each have been new processing.

### Decision
`reverse` decodes one key-frame group at a time from the end, copies frames out of the decoder into plain memory (so the decoder's frame pool is never held) and encodes them last first; a group larger than 384 MB of raw 4:2:0 frames is split into windows decoded from the key frame again (`reverse/math.ts`, cost shown on the page from the key frames). Reversed sound is decoded whole with a 400 MB limit (about 17 minutes of 48 kHz stereo) and otherwise removed with a stated reason. Files only ffmpeg reads are blocked with a link to the converter. `loop` is merge's `concatCopy` with one clip N times (whole plays; lossless; 1 GB output cap); a boomerang encodes one bounce (forwards, then backwards without the turning frame, silent) with the reverse encoder and copies it N times. `pad` (add a border: thickness as a share of the short side, any colour, grow or keep size) is a new engine on the geometry runner; the aspect-ratio engine gains a `blur` background (cover-scaled, downscaled 16× and enlarged twice, dimmed 20%, same maths in the preview canvas and a `boxblur` ffmpeg graph) and pad colours may be `#rrggbb`. "Vertical video to horizontal" is an aspect-ratio preset page, not an engine.

### Consequences
Memory stays bounded for any picture length; long key-frame gaps cost extra decoding, not memory. Outputs are still held in memory until OPFS exists. Border and blurred-background pages use an Overlay preview, so they do not batch (ADR-0025).

---

## ADR-0040: Sound tools measure and shape audio in our own DSP; ffmpeg.wasm only decodes and encodes; results state measured output

**Status:** Accepted · **Date:** 2026-10-01

### Context
Volume, normalise, fades and silence removal (E4, E5, C7, E11) need loudness numbers the page can show before a job and a way to process every format. ffmpeg.wasm has `loudnorm`, `volume`, `afade` and `alimiter`, but only for formats it writes, it loads 32 MB, and its limiter and dynamic loudnorm would give different results from a native path for the same page. WebCodecs cannot encode MP3 or Vorbis, and AAC or FLAC encoders are missing on some platforms.

### Decision
One DSP implementation in `engines/sound/dsp/`: a BS.1770-4 / EBU R128 meter (K-weighting derived per sample rate as libebur128 does, gating at −70 LUFS and −10 LU), a 4× Kaiser-windowed true-peak estimate, a linked look-ahead limiter (5 ms, 80 ms release; exact length, no delay), quarter-sine and linear fades matching ffmpeg's `afade` curves, and 10 ms level windows. A shared render (`sound/render.ts`) copies the picture packet for packet and encodes the sound once: AAC 192 kbps in the video's container (Opus in WebM, PCM in MOV without AAC), or the audio file's own format at no less than its bitrate. Every run starts on the page (`sound/page.ts`): natively when this browser has the encoder, otherwise the worker writes 32-bit float WAV and ffmpeg.wasm encodes it (and decodes WMA and AIFF first), with the original as a second input for tags and cover art. Normalise measures first; a fixed gain measures on the way through. The output is decoded and measured again, and the result line states that measurement, never the plan. Panels measure with the same code in a separate analysis worker (`workers/sound-analysis.worker.ts`), shared per file. Presets name use, not platforms (−14 music, −16 speech, −23 EBU R128), because platform targets were not checked against primary sources.

### Consequences
Every path makes the same samples; ffmpeg is a codec, not a processor. The meter agrees with ffmpeg's `ebur128` within 0.1 LU and 0.2 dB true peak on the fixtures (unit test). A limited normalise can land a few tenths under target; the page says so. Resampling inside the render (only when an encoder refuses the source rate) uses the existing linear resampler. The equivalent ffmpeg command uses `volume`/`alimiter`/`afade`, which is close but not sample-identical to our limiter.

---

## ADR-0041: Silence removal: one cut plan for the timeline and the engine; video cuts snap to frames and re-encode

**Status:** Accepted · **Date:** 2026-10-01

### Context
Jump cuts (C7) must show every cut before running and must not drift after many cuts. A cut inside a group of pictures cannot be a packet copy.

### Decision
`remove-silence/options.ts` turns 10 ms level windows into pauses (under the threshold for at least the minimum, blips under 40 ms bridged), keeps padding on both sides, and is called by the page's timeline and by the engine, which measures again itself. The threshold defaults to 8 dB above the noise floor (10th percentile of levels, kept between −55 and −30 dBFS) and is a line dragged on a dB level graph. Audio files join the kept spans with 5 ms ramps and keep their format. Videos move every cut edge onto a frame time, drop the frames and the sound of the same stretches, and re-encode to H.264 (high quality) and AAC in MP4. The preview skips marked pauses while it plays. The page has a `Below` timeline, so it does not batch (ADR-0025).

### Consequences
Picture and sound lose identical stretches (measured: video and sound durations within 0.05 s after two cuts). Video silence removal costs a full re-encode; audio-only does not touch the picture path. Music under speech prevents cuts; the page says so.

---

## ADR-0042: Audio sync and track selection are packet copies; sync is sample-exact only where an edit list can be written

**Status:** Accepted · **Date:** 2026-10-01

### Context
Shifting sound against picture (E6) and keeping some sound tracks (E10) need no decoding, but mediabunny writes only an empty edit, not a media time, and cannot read or write subtitle tracks, chapters or attachments.

### Decision
`audio-sync` rewrites sound timestamps and, in MP4/MOV, writes the first kept packet where it belongs with an edit list skipping into it (`edit-list.ts`, the same mechanism as AAC priming), keeping one packet of pre-roll when the sound moves earlier: exact to the sample. MKV and WebM shift by whole packets (packets whose middle falls before zero are dropped): within about one sound frame, stated on the page. Sound past the picture's end is cut so the length stays. All sound tracks move together. `audio-tracks` copies the picture and the chosen tracks with `copyTracks`, writing the main track first and marking only it default (new optional `defaultAudio` on the packet copy). The inspector now reports each sound track's name and default flag. Subtitle tracks, chapters and attachments are not carried, and the page says so; the ffmpeg route that would keep them is not built (it would hold the whole file in memory).

### Consequences
Both tools run in Node and are unit-tested against ffprobe (packets byte-identical, onset within 2 ms in MP4, 30 ms in MKV). Tracks the browser cannot decode (AC-3) copy fine. The remove-audio page's claim that subtitles are kept was false (verified) and is corrected.

---

## ADR-0043: Sound pages are one page per input kind when the job and output differ; heroes may be the primary control

**Status:** Accepted · **Date:** 2026-10-01

### Context
"Make an MP3 louder" and "make a video louder" use one engine with one option set, which the duplicate check (ADR-0011) rejects, but they are different jobs: a different file in, a different file out, a waveform or a picture as the preview, different copy. Fades and trims on audio files are chosen on the waveform, which is the hero, but heroes could not change options.

### Decision
A sound page may carry an `input: "audio" | "video"` preset key that steers the drop prompt and copy, when each page has its own story (volume, fade, silence removal, speed); a job that is the same for both (normalise) is one page taking both. `HeroProps` gains an optional `onChange` (ready state only; method syntax so heroes typed for `unknown` stay assignable), and `AudioHero` an optional `layer` drawn as a sibling of its seek bar (a slider's children are presentational). Values set on a hero are always also in the panel, because a batch shows no hero. Converter jobs that keep the format (stereo to mono, sample rate, trim audio) are presets of `convert-audio` and `video-to-audio`, not engines. Sample-rate changes always run through ffmpeg's resampler.

### Consequences
Thirteen audio pages from five new engines and three extended ones (convert-audio, video-to-audio, speed). Every `input` twin must keep its own unique content (the validator still checks). Stage change is additive: one prop passed in `tool-stage.tsx`.

---

## ADR-0050: Sound re-encoded beside a picture runs in its own composable Conversion; Opus encoder delay is measured and written into every container

**Status:** Accepted · **Date:** 2026-10-08

### Context
Three gaps were left by ADR-0018 and ADR-0032 (measured 2026-10-08 in Chromium). Re-encodes that keep a picture (compress, aspect ratio, precise trim, codec, merge, replace audio) decoded AAC without pre-roll: a click at 0 s (or at a precise cut) vanished, a tone started 10.8 ms late. WebCodecs Opus declares a pre-skip of 312 but delays 346 to 382 samples when fed 44.1, 32 or 22.05 kHz (it resamples first; at 16 kHz it declares 104 against a real 312), and its flush drops the end after non-48 kHz input; mediabunny writes the Ogg end granule as the packet sum, a Matroska CodecDelay of 0 with the pre-skip in SeekPreRoll, and no DiscardPadding. Opus outputs were 6.5 ms short or 13.5 ms long and 0.7 ms late. mediabunny's FLAC reader needs 16 bytes from a frame's start and so never read a last frame shorter than that (a 140-sample tail held constant is 13 to 15 bytes). Opus sources were read long too (Ogg end granule and Matroska DiscardPadding ignored: 4.0135 s for a 4 s .opus). Patching mediabunny stays ruled out (ADR-0032).

### Decision
`convert()` asks mediabunny (a composable Conversion on a NullTarget output that is never started) whether each sound track would be re-encoded; if so it runs two composable Conversions on one Output: the picture, and copied sound, from the job's start, and the re-encoded sound from up to 50 ms earlier (AAC's priming packet when there is one), its pre-roll dropped again by `fixSample` (`mediabunny/sound-split.ts`, `pre-roll.ts`). The runner owns the Output (tags written as Conversion would), combines progress as the slower of the two and cancels both. Hand-fed decoders (merge, add/replace audio) start the same 50 ms early. For Opus, the real delay is measured once per input rate and layout (`opus-delay.ts`: a pulse decoded with pre-skip 0), that much silence is appended before the flush (`opusEndGate` for Conversion, `addOpusTail` for hand-fed encoders), and `withEncoderDelaySignalled` (formerly `withAacPrimingSignalled`) writes the measured pre-skip and the real end: Ogg pages rewritten with the end granule (`ogg-opus.ts`), Matroska CodecDelay, SeekPreRoll 80 ms, OpusHead and DiscardPadding with blocks wholly past the end dropped (`matroska-timing.ts`), and an MP4 edit list plus `dOps`. Opus sources end where their container says (`opus-source.ts`). FLAC files are read through a source that reports the 1 to 6 zero bytes the reader asks for after a short last frame (`flac-tail.ts`); a FLAC decoder ignores them (fewer than the 10 bytes of the smallest frame). Rejected: one Conversion with a pre-rolled start (shifts the picture), resampling to 48 kHz ourselves before the Opus encoder (mediabunny's resampler is linear), padding every FLAC file.

### Consequences
Measured after (Chromium, fixtures): compress, aspect ratio and precise trim keep the click at 0 s or at the cut (first-click peak 0.61, was 0.00), every click within 16 µs, tone onset 0.16 ms (was 10.8 ms); Opus in Ogg, WebM, Matroska and MP4 decodes to exactly the sound fed in (144 000 samples for 3 s, was 143 688 or 144 648; 192 000 for 4 s, was 192 648), clicks within 16 µs (were 0.7 ms late); Opus sources are read to their real end (Ogg exact; WebM exact for constant frame sizes); FLAC with a short last frame decodes byte-identical to ffmpeg (88 204 samples, was 88 064). Tests: `tests/unit/media-gaps.test.ts` and `tests/e2e/engines.spec.ts`, `audio-tools.spec.ts`. A re-encode with a picture probes one extra Conversion init per sound track. ffmpeg's `-ss 0` input seek skips the first packet of any WebM whose Opus states its CodecDelay (ffmpeg's own WebM too), so measurements decode from the start. WebKit's Opus encoder measured no extra delay at 44.1 kHz (pre-skip 312) and has no FLAC decoder; Firefox was not measured. An Opus encode whose source decodes shorter than its container says gets no flush silence and can still lose up to 7 ms at the end. Upgrading mediabunny needs `media-gaps.test.ts` re-run; its "mediabunny alone" checks flag when a gap closes upstream.

---

## ADR-0051: Keyboard shortcuts and gestures site-wide: three layers, page keys first

**Status:** Accepted · **Date:** 2026-10-08

### Context
The owner asked for the common keyboard shortcuts and gestures throughout the site. ADR-0026 scoped per-tool keys to the workspace and took no modifier chords. Players, editors and sites people already use agree on a small set: Space or K play, J/L and arrows seek, comma and period step a frame, digits jump, M mutes, F goes full screen; "/" and "?" for search and help; ⌘/Ctrl+Enter, ⌘/Ctrl+O and ⌘/Ctrl+S in apps; tap, double-tap a side, double-click on video.

### Decision
Three layers, each in one place. Site keys in the header trigger (`command-palette-trigger.tsx`): ⌘K, "/" search, "?" opens a lazy-loaded list of every shortcut and gesture (`shortcuts-dialog.tsx`, also linked from the footer), never while typing or with a dialog open. Tool-page chords in the stage (`tool-stage.tsx`): ⌘/Ctrl+O choose a file (with one file in, back to the drop zone with the picker open), ⌘/Ctrl+Enter run, ⌘/Ctrl+S save, Escape cancel; they click the workspace's own `data-action` controls, so a chord only does what a click could. Player keys (`usePlayerKeys`, video and audio previews) run at fallback priority: a page binding of the same key wins (`useWorkspaceKeys(..., { fallback: true })`), so trim's I/O and extract frame's arrows keep their meaning. Pointer gestures on the preview (`preview-gestures.tsx`): click or tap toggles at once, a double tap on the left or right third seeks 5 s and undoes the first tap's toggle, a mouse double-click toggles full screen; moving or holding is not a tap, so the page still scrolls. Delete removes a focused clip in a list. Keyboard-initiated actions do not animate; the seek label appears at once and fades out at `dur-fast`. Rejected: a global keyboard library (a dependency for 30 lines), delaying single taps to detect double taps, overriding ⌘S on pages with nothing to save.

### Consequences
Amends ADR-0026: the stage now takes four modifier chords, only on tool pages and only when their control exists. A page that rebinds a player key must list it in `spec.shortcuts` (it shows under "This page" in the "?" list). `tests/e2e/keyboard.spec.ts` covers the layers and the touch gestures on the phone projects.

---

## ADR-0052: Codec pairs are locked pair pages; the duplicate check compares options after engine defaults

**Status:** Accepted · **Date:** 2026-10-08

### Context
SEO audit 2026-10-08: `/hevc-to-h264` (`{ codec: "avc" }`) did exactly what `/change-video-codec` (`{}`, default `avc`) did with an HEVC file, and the mirror for `/h264-to-hevc`. The validator compared raw preset options, so a default spelled out passed as different (ADR-0011, ADR-0017).

### Decision
The two pages are pair pages like the format pairs: `from`, `to` codec and `lockTarget`; the codec picker is hidden, a source in another codec is converted the same way with a note, and a browser without the target encoder is pointed to `/change-video-codec`. `/change-video-codec` links down to them (`hubEngines`). `scripts/validate-registry.ts` parses each preset through its engine's `optionsSchema` (defaults filled in; keys the schema does not know, such as `from` and `lockTarget`, still count) before comparing.

### Consequences
A preset that only restates defaults now fails the registry check. Pair pages must carry the 250 hand-written words of ADR-0011 pairs (both pass).

---

## ADR-0053: One address per page: a real 404 for every unknown URL and one-hop canonical redirects

**Status:** Accepted · **Date:** 2026-10-08

### Context
Site QA 2026-10-08: unknown URLs got Next's unstyled default 404 (no document, no `lang`, quirks mode, an axe violation) because the root layout is a pass-through and `<html>` lives in `[locale]`; `/TOOLS/EDIT/` took two redirects (Next's trailing slash, then our lowercase); `/trim-video%20` rendered a duplicate page with status 200; `/favicon.ico` returned a 190 KB HTML 404.

### Decision
`app/global-not-found.tsx` (Next's `experimental.globalNotFound`) renders the site's header, footer and a 404 body for unmatched URLs; `[locale]/not-found.tsx` renders the same body inside the layout for `notFound()`. `src/proxy.ts` sends one 308 to `canonicalPath()` (lowercase, no trailing slash, whitespace trimmed per segment; a malformed escape is left for the 404), with Next's own trailing-slash redirect off. `src/app/favicon.ico` is generated from `icon.svg` by `scripts/make-favicon.mjs`.

### Consequences
Every page has exactly one address and every miss is a styled, accessible 404 with ways back. The global 404 is `noindex`.

---

## ADR-0054: Engines test what the browser can do instead of asking; every track the plan promises must be in the output

**Status:** Accepted · **Date:** 2026-10-08

### Context
QA found silent failures where a browser said yes and then did not deliver. Playwright WebKit (Safari 26.5 engine) accepts H.264 High and Main profile, takes four frames and never outputs, errors or settles `flush()`: compress, frame rate, reverse, merge and filters sat at "0:00 processed" with no error. Chrome without platform HEVC, and every browser with ProRes, cannot decode the picture; mediabunny's Conversion then drops the video track, stays `isValid` because the sound survives, and crop, compress and fifteen other pages reported an audio-only file as success ("Fits under 8 MB: 48.1 kB"). The converter plan assumed HEVC decodes because it is in a codec list.

### Decision
`canEncodeAvc` also encodes six small frames at High profile (what mediabunny configures) and treats no output within 5 s as "cannot encode here", with that reason shown instead of the generic line (`mediabunny/encoder-probe.ts`; the worker reads it). `convert()` has a stall watchdog tied to output, not time: 15 s without one sample handed on stops the run with a specific error; once all samples are in, flushing and writing are not watched. Inspection asks the browser whether it decodes each track (`canDecode`, WebCodecs `isConfigSupported` on the track's own configuration) and records `MediaInfo.video.decodable` / `audio[].decodable`; the converter plan and the geometry and filter pages' `needsFfmpeg` route an undecodable picture to ffmpeg.wasm, and every engine that re-encodes the picture says so in `supports()` (`pictureDecodes`). Copies (lossless trim and split, plain loop, metadata rotation, lossless merge) still run. The shared runner fails when Conversion drops the picture or the main sound for any reason the job did not ask for, and reads every output back: no packets, or no picture when one was kept, is an error. A rotated picture is copied only into containers with a rotation flag (`rotationFlag` in `containers.ts`: MP4, MOV, 3GP); into Matroska and WebM it is re-encoded upright, since copying without the flag would play sideways. Rejected: a fixed total-time timeout (fires on slow devices), copying rotated video to MKV with the tag dropped.

### Consequences
WebKit compress fails in about 5 s with the reason, or after 15 s without progress if the probe passed; Chromium probe cost 3 ms. ProRes and HEVC-without-decoder fail before Run with the codec named, or go to ffmpeg where the page has an ffmpeg route; compress, reverse, boomerang and merge have none and say so. A phone-portrait MP4 → MKV or WebM is a re-encode (the plan says so). The "Keep VP9" choice for WebM → MOV is decided in the page (`convert-video.tsx`); `keepsVideoCodec` in `convert-video/plan.ts` is the check to use there. Real Safari was not tested; its H.264 encoder may well work, in which case the probe passes.

---

## ADR-0055: Copies carry the source's real start and end: Matroska CodecDelay read and written, cut-short Matroska read to its cut, page times from the file's start

**Status:** Accepted · **Date:** 2026-10-08

### Context
mediabunny reads neither a Matroska CodecDelay (ffmpeg writes AAC priming there) nor Opus pre-skip into packet times, and writes CodecDelay 0. So MKV → MP4/MOV copies put the sound 20.7 ms late, MP4 → MKV played the priming (23 ms late, 3.04 s for 3.00 s), MKV → WebM re-encodes 28 ms late, and fix-audio-sync on an MKV moved the sound 170.7 ms for 200. A Matroska file cut short read as zero packets and the remux wrote a 148-byte "success". MPEG-TS and offset MP4 files report an end time as duration (5 s showed as 0:06 to 0:09) and trim and split took page seconds as source timestamps. add-audio ignored an MP3's gapless window (each loop of a 2.000 s MP3 took 2.0376 s), a cut FLAC kept its source frame numbers, and inspection estimated bitrates from 60 packets and VBR MP3 length from its first frame.

### Decision
`matroska-timing.ts` reads each sound track's start delay from the file head (CodecDelay; for Opus the OpusHead pre-skip) and rewrites finished Matroska/WebM files per track (CodecDelay, SeekPreRoll, OpusHead, DiscardPadding, blocks past the end dropped). The packet copy applies a source's delay to its packet times, keeps priming or pre-roll packets in Matroska as in MP4 and states them as CodecDelay (one pre-roll packet before a cut, as the MP4 edit list does), and times Opus and AAC-LC from Matroska by sample count (Matroska times are whole milliseconds). Sound that Conversion would copy from a delayed source is copied beside a picture encoded alone. Decode windows (pre-roll split, audio-only re-encodes) start at the delay. `matroska-repair.ts` reads a cut-short Matroska file as if it ended at its last whole block (size fields patched in the source, nothing copied). `MediaInfo.startSec` is the file's start (first picture or sound, not AAC priming) and `durationSec` is end − start; every engine takes page times from 0 and adds `startSec` (trim, split; inspection's key frames are given in page time). `sound-span.ts` is the one place a sound's real span is decided (MP3 gapless window, Matroska delay, Opus end trimming, an MP3 without Xing frame by its packets); inspection, re-encode windows and add-audio use it. Cut FLAC frames are renumbered from 0 with both checksums recomputed. Bitrates count every packet where that is cheap (MP4/MOV/M4A index, audio files).

### Consequences
Measured: MKV → MP4/MOV beep offset 0.0 ms (was +20.7), MKV → WebM 0.0 (was +28.4), MP4 → MKV 132 300 samples for 3 s (was 133 120) with clicks within 15 µs, WebM Opus → MKV 144 000 (was 144 576), fix-audio-sync on MKV −200.1 ms (was −170.7); a 300 kB cut of a 428 kB MKV gives the same 70 video and 129 sound packets ffmpeg recovers; a 1 kB head is an error. add-audio MP3: beeps at 0.250 and 2.250 s (were 0.275 and 2.313), copy at 0.250 (was 0.275). Bitrates 90.1 and 73.1 kbps as ffprobe counts (were 111 and 91). Other engines that take times (video-to-audio ranges, frame extraction, GIF, sound tools) must add `startSec` too; their owners were told. MKV and WebM audio sync stays "to the nearest sound frame" on the page and in its copy, though CodecDelay could now make it exact.

---

## ADR-0056: The ffmpeg.wasm path keeps every sound track, says why it failed, and is corrected for FFmpeg 5.1; the inspector names what mediabunny cannot

**Status:** Accepted · **Date:** 2026-10-08

### Context
QA (2026-10-08) on the ffmpeg.wasm path, which is FFmpeg 5.1 (libavformat 59.27, `@ffmpeg/core-mt` 0.12.10), not 6.0: without `-map` an MKV with two AC-3 tracks (eng, fra) came out with one; FLAC into MP4 failed ("flac in MP4 support is experimental") although the plan said "sound copied"; Vorbis at a bitrate fails above 48 kHz ("encoder setup failed" at 64, 88.2 and 96 kHz); failures surfaced raw ("exited with code 1. Conversion failed! Aborted()"); change speed's `setpts=PTS/N` left frame selection to ffmpeg's rate conversion (77 frames for 75 at 2×, source frames 0 to 4 at 1×, picture 64.5 ms behind the sound; 21 for 19 at 8×) and libx264 refused 641×361. A whole-file AAC-in-MP4 re-encode ended 512 samples long (5.1 does not drop the end padding; local FFmpeg 9 does). Separately, mediabunny 1.55.5 skips MPEG-TS sound filed as private data (stream_type 0x06 without descriptor, as ffmpeg's 192-byte M2TS mode writes AAC), names no codec for H.263, MPEG-4 Part 2 or FFV1, and lists no Theora stream. GIF frame delays were a constant 8 cs at 12 fps (1.92 s for 2.0 s).

### Decision
The ffmpeg conversion maps `0:V:0?` (the first picture that is not cover art, as the native path keeps the primary track) and every audio stream, each copied or re-encoded by the plan's own rule (`ffmpeg/convert-args.ts`), languages kept; Matroska output also keeps subtitles and attachments, MP4/MOV get none, as natively. Copied FLAC into MP4 passes `-strict -2`. Vorbis above 48 kHz is resampled to 48 kHz; whole-file re-encodes from MP4/MOV get `-t <movie duration>`. Every ffmpeg failure goes through `ffmpeg/failures.ts`: known log patterns (no moov, damaged input, experimental in MP4, encoder setup, missing decoder, odd size, container cannot hold, memory) become a sentence and class; anything else is one sentence quoting the last meaningful log line. Change speed is `setpts=PTS/N,fps=<source rate>:round=up`, cropping an odd size by one pixel. The inspector's helpers read what mediabunny leaves out from the container header (`inspect/codec-id.ts`: MP4 sample entry, Matroska CodecID and VfW FourCC, Theora identification header), explain unreadable files (`inspect/unreadable.ts`: no moov, cut off, an image or text renamed, with every format a page reads), and an MPEG-TS source reports a corrected program table when a private stream's first payload is ADTS, MPEG audio or AC-3 (`mediabunny/ts-stream-types.ts`, CRC recomputed; mediabunny reads only the first table). GIF delays are distributed in hundredths on the running total; the size estimate takes a one-frame gifenc sample when the page provides one. Rejected: re-encoding FLAC to AAC for MP4 (FLAC in MP4 is a published mapping, the native path already copies it, and the plan promises a copy; which players play it was not measured), mapping `0:V` (a second picture of another codec fails the mux), `setpts=(PTS-STARTPTS)/N` (moves a deliberate offset between picture and sound), patching mediabunny (ADR-0032).

### Consequences
Measured in Chromium with ffmpeg.wasm and checked with ffprobe 9: two AC-3 tracks → two AAC tracks tagged eng and fra; FLAC copied into MP4 with the decoded sound's MD5 unchanged; 96 kHz WAV → OGG Vorbis 48 kHz; change speed 2× 75 frames, frame k = source 2k, offset 0.0 ms (8×: 19 frames, source 8k; 0.5×: 300 frames); 641×361 → 640×360; AAC-in-MP4 → MP3/FLAC 192 000 samples (was 192 512); GIF 24 frames = 200 cs. The 192-byte M2TS AAC decodes to the same PCM MD5 as ffmpeg's, and the H.263, MPEG-4 Part 2 and Theora names show, only once `openInput` and `inspect()` in `mediabunny/shared.ts` call these helpers (handed to that file's owner as a patch). Not fixed by flags: FFmpeg 5.1 ignores Matroska CodecDelay for AAC and AC-3 (MKV → MP3 21.3 ms and 5.3 ms late; mediabunny has the same gap per ADR-0055) and copying MP3 from MKV to .mp3 writes a gapless header that makes local ffmpeg skip 4096 samples instead of 1105 (62 ms early); both need the delay read on the page and passed as `atrim`/`-ss`. `atempo` itself shifts bursts by up to 15 ms at 2× and 40 ms at 0.5× (local FFmpeg 9 the same). The GIF estimate stays the content-blind median (fast 0.30, best 0.60 bytes per pixel; measured range 0.11 to 1.22) until the panel passes a sample.

---

## ADR-0057: Channel downmixes are ours (BS.775, scaled), the audio plan states what the encoder writes, lossy level loss is measured and corrected, and video cuts fall back to Baseline H.264

**Status:** Accepted · **Date:** 2026-10-08

### Context
QA on 2026-10-08, reproduced on the post-ADR-0050 tree in Chromium and Playwright WebKit (Safari 26.5 engine). Stereo to mono of a 5.1 WAV at −6 dBFS per channel hard-clipped (peak 0 dBFS, RMS −1.3 dB, 43 320 of 144 001 samples at full scale) because mediabunny's remix uses Web Audio's speaker rules, unscaled (mono weights add to 3.41); its remix also wrote stereo to mono WAV one sample long (192 001 for 192 000), and the sound render and video silence cut kept only L and R of 5.1 (the centre, where dialogue is, was dropped). ffmpeg's own `-ac` rematrix is scaled for integer output but not for float, so the two routes could differ. Opus was offered for 5.1 and failed: WebCodecs Opus takes at most two channels in Chromium and WebKit (`isConfigSupported` false for 4, 6, 8). Result lines restated the request: 96 kHz → MP3 said 96 kHz (file 48 kHz), 5.1 → MP3 said 6 channels (stereo), 22.05 kHz MP3 said 192 kbps (LAME's MPEG-2 ceiling is 160; 64 up to 12 kHz). LAME lowers the level (0.3 dB on tones, 0.6 to 0.9 dB on pink noise at 128 to 192 kbps), so "+6 dB" measured +5.7 and a −16 LUFS normalise −16.3. Every AIFF run on the volume, fade, normalise and silence pages failed because the output was measured with mediabunny, which has no AIFF demuxer. In WebKit, H.264 High and Main take frames and never return any (ADR-0054's probe), so remove silence from a video sat at "0:00 of 0:05 written" for good.

### Decision
One downmix (`sound/dsp/downmix.ts`) for every channel reduction: ITU-R BS.775 Table 2 weights (mono: C 1, L and R 0.7071, surrounds 0.5; stereo: L + 0.7071 C + 0.7071 Ls, mirrored), LFE left out, each output row divided by the sum of its weights so it cannot clip; stereo to mono is the plain average. The native path mixes inside the Conversion's `process` step (never mediabunny's `numberOfChannels`), the sound render and video cut use it in place of `merge/resample` `mixChannels`, and the ffmpeg route gets the same numbers as a `pan` filter instead of `-ac`. Channel order is WAV's (FL FR FC LFE, then surrounds); 3, 4, 5 and 7 channels are read as 3.0, quad, 5.0 and 6.1, and above eight the mix is an average. `planExtraction` applies `encoderLimits` to re-encodes: MP3 and Opus at most stereo, MP3 at its own rates with its bitrate ceiling, Vorbis at most 48 kHz (ffmpeg.wasm's libvorbis), so the plan, the command, the panel and the result line say what the file holds; a float source to FLAC or 24-bit PCM is marked `quantisedTo: 24`. A volume or normalise job encoded by ffmpeg to a lossy format measures the processed WAV while ffmpeg encodes, measures the encoded file, and encodes once more with the difference as a plain `volume` gain (at most 2 dB, never past the ceiling), keeping the closer of the two; this amends ADR-0040's "ffmpeg only decodes and encodes" by one scalar gain. AIFF outputs are decoded by ffmpeg before they are measured. Video silence cuts use Constrained Baseline (`fullCodecString`) where the High-profile probe finds the encoder stalls, and a 15 s no-progress watchdog fails a run that stalls anyway with what stopped and where.

### Consequences
Measured after (Chromium, checked with ffprobe and ffmpeg ebur128): 5.1 at −6 dBFS → mono WAV peak −6.02 dBFS, RMS −9.03 dB, 0 clipped, 144 000 samples; the MP3 route −6.28 (LAME); stereo → mono 192 000 samples, within one 16-bit step of (L+R)/2; 5.1 → Opus stereo; 96 kHz → MP3 says and writes 48 kHz; 22.05 kHz says and writes 160 kbps; MP3 +6 dB measures +6.0 (−13.6 → −7.6 LUFS), WMA → MP3 +6.0, pink-noise MP3 +6.1, normalise on MP3 −16.0; AIFF volume, fade, normalise and silence removal all write AIFF (normalise −16.0 LUFS). WebKit: remove silence from a video finishes in about 10 s as Constrained Baseline (was a hang past 90 s); with Baseline disabled the watchdog stops the run at 21 s with "The browser's H.264 encoder stopped returning frames at 0:00 of 0:07". A downmix is quieter than a sum (dialogue only in the centre lands 10.7 dB down in mono), which is the cost of never clipping. The level correction costs a second LAME or Vorbis encode on the volume pages. Tests: `tests/unit/audio-downmix.test.ts`, `tests/unit/audio-convert-plan.test.ts`, `tests/e2e/audio-fixes.spec.ts` (Chromium and mobile-safari).

Amended 2026-10-08 (long files, 3-hour 1.9 GB WAV in Chromium): PCM decoding never left the worker's microtask queue, so Cancel waited for the whole job (remove silence delivered its result 43 s after Cancel; normalise ran to 100 %), and a progress message per decoded block kept the page busy for about 30 s. The sound reader now hands the worker's event loop a turn every 50 ms and progress is passed on at most every 100 ms (`sound/pace.ts`); the sound page runner answers Cancel at once and terminates its own worker 1 s later, after the worker has removed its partial output. Sound render and video silence cuts write through `openOutputStore` (ADR-0058). Measured after: Ready 19 to 24 ms after Cancel, job worker closed 1.02 s after it, no partial file left in OPFS, no result shown; longest page stall 1 to 2 ms on full runs (was about 30 s); peak RSS normalise 875 MB (was 6.4 GB) and remove silence 1.13 GB (was 4.9 GB), flat in the output size. `sound/reader.ts` takes the sound's span from `soundSpan` (Matroska CodecDelay applied, beside a picture as `delay`), and video-to-audio ranges and video silence cuts add `MediaInfo.startSec` to page times.

---

## ADR-0058: Large outputs stream to OPFS through one output helper; results cross to the page as Blobs

**Status:** Accepted · **Date:** 2026-10-08

### Context
Every native engine wrote to mediabunny's `BufferTarget`, and the worker sent the result to the page as an `ArrayBuffer`. An `ArrayBuffer` cannot pass 2 GiB (mediabunny doubles it to grow), so every output over that failed at the very end, as "out of memory, use desktop Chrome" on desktop Chrome with 20 GB free: a merge of two 1.14 GB clips, a lossless trim of a 2.28 GB file, MP4 → MOV of it, a 4K reverse (QA 2026-10-08). A 1.42 GB merge peaked at 6.2 GB RSS. The handbook (`README.md#architecture`) already named OPFS for large outputs; ADR-0014, ADR-0025 and ADR-0039 recorded "held in memory until OPFS exists".

### Decision
One helper, `mediabunny/output-store.ts` `openOutputStore(expectedBytes)`: above 768 MB of expected output it streams through mediabunny's `StreamTarget` (chunked) into an OPFS file written with a sync access handle in the worker; MP4 and MOV then write their index last (`containers[to].format({ streamed: true })`, no in-memory fast start). Below that, or without OPFS, it is the in-memory `BufferTarget`; without OPFS an output expected past about 1.8 GB is refused before any work with a specific message. The finished file is the OPFS `File` itself; edits after muxing work on it without reading it whole: the MP4 index is edited alone (`editTrailingMoov`, `editOutputSound`, `applyPrimingEdits(…, dataMoves = false)`, `clearTimesIn`), Matroska and Ogg rewrites read the file back only when it fits. Results cross the worker boundary as Blobs (by reference), not transferred buffers. Each worker keeps its files in `outputs/<session>/` held by a Web Lock; a new worker removes directories whose lock nobody holds (closed or reloaded pages); cancel and failure remove the partial file; `EngineClient.releaseOutputs()` removes the rest. A 2 GiB allocation failure is reported as a size limit, a full quota as full storage, never as missing memory. Expected size is the sum of the inputs' sizes. Converted: the shared Conversion runner (`convert()`, so compress, convert, trim precise, crop, aspect ratio, rotate, split precise, filters and every engine that calls it), the packet copy (remux, lossless trim and split, audio copies, `copyTracks`), lossless and re-encoded merge, add/replace audio and audio sync. Rejected: always streaming (small outputs would lose fast start and gain disk churn), `createWritable` on the page (needs the page to own the output).

### Consequences
Measured (Chromium, built app): MP4 → MOV of the 2.28 GB file in 4.7 s, peak 1.04 GB RSS for the whole browser, output identical in frames and packets; merge a+a (2.28 GB) 4.7 s, 1.12 GB; merge a+e (1.42 GB) 3.7 s, 1.05 GB (was 6.2 GB); lossless trim of the 2.28 GB file 0:10–29:50 in 5.8 s, 1.34 GB; compress of the 1.14 GB file 89 s, 1.22 GB, edit list on the trailing index. Streamed MP4/MOV have their index at the end (the fast start page moves it). Large Matroska outputs keep mediabunny's sound timing when too large to read back (ADR-0055's CodecDelay rewrite needs the whole file). Reverse, sound render, remove silence and the other engines that build their own `Output` still use `BufferTarget` until their owners call `openOutputStore`. Start over does not yet call `releaseOutputs()` (the page owns that); files stay until the page closes and the next page sweeps them.

---

## ADR-0059: ffmpeg.wasm reads inputs in place, refuses outputs it cannot hold, and applies Matroska CodecDelay itself

**Status:** Accepted · **Date:** 2026-10-08

### Context
Large-file QA 2026-10-08: extract audio to MP3 copied a 1.1 GB input into ffmpeg.wasm's memory (3.9 GB peak) and failed on a 2.28 GB input ("File could not be read! Code=-1"). ffmpeg.wasm keeps its whole result in memory (about 2 GB at most, plus a copy when handed back), and its heap is a fixed 1 GiB per instance. FFmpeg 5.1 ignores Matroska CodecDelay, so AAC, AC-3 and MP3 re-encoded from MKV started 5 to 23 ms late, where local FFmpeg 9 is exact.

### Decision
Every ffmpeg input is mounted with WORKERFS (`ffmpeg/mount.ts`) and read from the File as needed, never copied in. A job whose estimated ffmpeg.wasm output exceeds 1.5 GB is refused before any work with a resource error that names the way that streams (native copies to MP4/MOV/MKV/WebM, M4A and WAV extraction write to OPFS, ADR-0058). The ffmpeg path drops each re-encoded Matroska track's CodecDelay with `atrim`, using `readMatroskaDelays` (`mediabunny/matroska-timing.ts`, the one reader), Opus excluded (FFmpeg 5.1 handles its pre-skip). The command shown on the page is the local one and leaves these wasm-only arguments out, since current FFmpeg applies the delay itself.

### Consequences
Extract audio to MP3 peaks at 1.3 GB for 1.1 GB and 1.46 GB for 2.28 GB inputs. MKV AAC, AC-3 and MP3 re-encodes match local FFmpeg 9 to the sample. The 1.5 GB limit is derived from the limits above, not measured to failure. Engines that still copy inputs in (crop, video filter, sound) move to `mountInput` as their owners touch them.

---

## ADR-0060: Picture re-encodes cut odd edges, carry or infer colour tags, and stay near the source's bitrate

**Status:** Accepted · **Date:** 2026-10-08

### Context
Video QA 2026-10-08 (#3, #8, #9): a 641×361 clip failed black and white, frame rate, fade, flip, reverse, boomerang, add text and frame-accurate trim with "Your browser cannot encode video", and the codec page reported no H.264 encoder. Chromium's `VideoEncoder.isConfigSupported` refuses H.264 when either edge is odd (and mediabunny refuses odd H.264 and HEVC itself); VP8, VP9 and AV1 accept odd sizes (measured, Chromium 151). Every engine probed and encoded at the source size. Re-encodes used the "best" density whatever the source spent (a 90 kb/s VP9 clip came out nine times larger). Chromium's H.264 encoder, told no frame rate, budgets bitrate / 30 per frame, so 60 fps outputs came out at twice the asked bitrate (41.3 Mb/s asked, 82.1 written). Chromium decodes every untagged picture as BT.709, so untagged SD outputs were tagged BT.709 over BT.601 pixels (30.3 dB RGB against the source) and canvas paths drew them with the wrong matrix.

### Decision
H.264 and HEVC re-encodes write the source less its odd last column or row (`crop/math` `encodedSize`, 641×361 → 640×360), cut and never scaled, the crop tools' convention and speed's. Pad by the edge colour was rejected: it invents a column. Probes, plans, results and ffmpeg commands use the even size (`crop=640:360:0:0`, also on the ffmpeg.wasm routes); VP9, AV1 and VP8 keep odd sizes. mediabunny tries the encoder with the raw first frame before `process`, and an odd H.264 frame fails that and makes it draw every frame rounded up (642×362), so odd sources are cut with mediabunny's `crop`; even sources keep frames as decoded. The output carries the source's colour tags; an untagged picture is read as BT.601 at 576 lines or fewer and BT.709 above (`video-filter/color-tags.ts`). Where frames reach the encoder as decoded, they are re-tagged (a plane copy, untagged SD only); where mediabunny already drew them, a matrix correction turns the decoder's guess into the intended reading; reverse makes its own decoder label frames correctly. Every re-encode's bitrate is the density capped by the source's bitrate on the share of the picture kept, scaled by codec efficiency, floor 200 kb/s (`crop/plan` `reencodeBitrate`); the reverse encoder is told the real frame rate.

### Consequences
All picture tools run on odd sizes; results state "641×361 → 640×360 (H.264 needs even edges)". Re-encodes are near the source size (4K60 reverse: 602 MB estimated, 600 MB written, was 1.19 GB). The matrix correction cannot restore saturated colours the decoder clipped (odd untagged SD through a canvas: luma 38 dB, red 26 dB); the full fix is decoding with the right colour space through the shared `convert()` (a `VideoDecoderConfig.colorSpace` override measured 39.2 dB against 25.1), after which frame-prep's re-tag and correction go. Canvas paths are tagged BT.601 by Chromium's RGB→YUV encoder even for HD; the tag matches the pixels. Mediabunny Conversions without a `frameRate` still overshoot 2× at 60 fps until the shared runner passes the rate.

Amended 2026-10-08 (media): the shared `convert()` takes `decodeColorSpace` and gives every decoder configuration of the primary video track that colour space (the decoder override this ADR named; frame-prep's re-tag and correction can go once its callers pass it), and tells the encoder the source's frame rate (`metadata.frameRate`: the job's rate, else the average of the first 240 packet steps; for Matroska and WebM only when those steps are steady within 1 % or 1.1 ms). Measured, 60 fps H.264 compress at 1.04 Mb/s asked: 2.07 Mb/s written before, 1.04 after. Convert (`convert-video/plan` `size`, `sizeNote`) and frame-accurate trim (`trim` `preciseVideo`) take the size from `encodedSize`, probe at it and cut with mediabunny's `crop`: a 641×361 VP9 WebM to MP4 writes 640×360 H.264 where it was refused, and the plan says "641×361 becomes 640×360: H.264 needs even edges.". The ffmpeg.wasm convert route (`ffmpeg/convert-args.ts`) does not add the cut yet.

Amended 2026-10-08 (media, frame-prep): the ffmpeg.wasm convert route now cuts the odd edge for libx264 and libx265 too (`convertArgs(plan, tracks, info.video)`; the shown command carries `-vf crop=640:360:0:0`). The picture engines that go through `convert()` (video filters, rotate and flip, crop and pad, overlays) pass the frame plan's `decodeColorSpace`, and reverse's plan sets it on its own track; `framePlanForTrack` then asks the decoder what the first frame is labelled with that configuration, and the plane-copy re-tag and the drawn-frame matrix correction run only when the label is still wrong. Measured (2026-10-08, one frame decoded with and without `colorSpace: smpte170m`): Chromium's H.264 and VP9 decoders honour the configured colour space, so on Chromium neither fallback runs; WebKit's H.264 decoder ignores it (it labels bt709, full range, sRGB transfer) and its VP9 decoder honours the matrix and primaries but keeps the bt709 transfer, so the fallbacks stay for WebKit. RGB PSNR against ffmpeg's reading of the source as BT.601, Chromium, before → after: odd 641×361 VP9 to H.264 black and white 40.81 → 45.41 dB, frame rate 28.76 → 38.50 dB (luma 35.69 → 39.10), rotate and flip 26.21 → 29.10 dB; untagged SD rotate and flip 38.30 → 45.87 dB; frame rate 48.05 → 48.01, black and white 48.92 → 48.88, reverse 48.46 → 48.45 (encoder variation), flip and odd reverse unchanged. Rotating and flipping an odd VP9 picture writes 362×642 (scaled), not 641×361 → 361×641; that is a separate defect.

---

## ADR-0061: WebKit's AAC encoder is measured and corrected like any other; MP3 copies out of Matroska carry a LAME gapless header

**Status:** Accepted · **Date:** 2026-10-08

### Context
Measured in Playwright WebKit (2026-10-08): AAC outputs encoded by WebKit started 65.35 ms (3137 samples at 48 kHz) late and lost their first click. Four separate quirks: the priming probe read 0 because WebKit's decoder rejects the ES_Descriptor its own encoder gives as `description`; the encoder silences the first 1024 input samples; it stamps chunks at the time of the input that completes each frame (jittered stts, a non-zero first timestamp that became an empty edit); and an input with the same timestamp as the one before it replaces it. Chromium's encoder has none of these. Separately, MP3 copied out of MKV into MP3 decoded to 133,632 samples (132,300 in the source) with its first click 25.08 ms late: an MP3 file has no edit list, and mediabunny writes a Xing header without the LAME delay and padding fields players read for gapless playback.

### Decision
`priming.ts` measures each browser's AAC encoder once per rate and channel count: it passes `aacConfig` (the AudioSpecificConfig taken out of an ES_Descriptor, or built for AAC-LC) to the decoder, encodes a tone then noise, and cross-correlates (pulses read 2116 in WebKit; noise reads 2112 in both). It reports `priming` and `lost` (1024 in WebKit, 0 in Chromium). Where `lost` is not 0, writers put one frame of silence in front (`addAacLead`, in the source's sample format), move every later timestamp by it, pad the end with priming plus a frame, and the edit list or Matroska CodecDelay counts the lead. The MP4 rewrite sets every stts delta to 1024 and the edit starts at the stream's real start. MP3 copies whose source signals a delay (Matroska CodecDelay or a cut) replace mediabunny's Xing frame with an Info frame carrying a LAME tag: delay = lead − 529 (the decoder's own delay), padding = the rest of the last frame. Cuts keep two MP3 frames of pre-roll for the bit reservoir. Feature detection by user agent was rejected: the probe measures what the encoder does.

### Consequences
WebKit AAC outputs are sample-exact (132,300 samples at 44.1 kHz, 144,000 at 48 kHz; first click 0.60, clicks within 20 to 49 µs); Chromium unchanged (exact, ±15 µs). MKV → MP3 copies decode to 132,300 samples with the first click at 0.02 ms (LAME delay 576); a 1 to 2 s cut is 44,100 samples, ±20 µs. Players that ignore the LAME tag (few) hear the pre-roll. Every AAC writer must call `addAacLead` after `output.start()` and pass `aacLeadPadded`; sound render, reverse, remove silence and audio to video do not yet.

Amended 2026-10-08: sound render (volume, fade, normalise, sound edits beside a picture; the lead goes at the sound's own start), remove silence from video, reverse and audio to video now call `addAacLead` and pass `aacLeadPadded`. Audio to video feeds its encoder f32-planar throughout, because WebKit's encoder restarts and loses another frame when the sample format changes, as it did at a fade. A WebKit e2e makes an M4A of the clicks fixture 3 dB quieter: the first click is kept (peak above 0.3), clicks are within 0.1 ms, onset under 1 ms, and the length matches the source within 2 samples.

---

## ADR-0062: A tool ships only when it is genuinely good at its job in the browser; on-device models are a later, separate wave

**Status:** Accepted (quality bar, model-free first round) · Model wave rejected by the owner, see ADR-0105 · **Date:** 2026-11-18

### Context
The owner's goal (2026-11-18): a Swiss army knife of video tools that run in the browser, are free, need no account, and are really good, accurate and well working. The paused round (PROGRESS Next up 6) banned ML models. Reviewing that list against the goal showed most tools reach high quality with WebCodecs, canvas/WebGL and our own DSP, but a few cannot: watermark removal on video (edge fill smears; per-frame inpainting flickers even with a model), vocal removal by centre cancel (well behind model-based competitors), and broadband speech noise removal by spectral subtraction.

### Decision
A page ships only when its result is genuinely good for the job its name promises, measured on fixtures (and against local FFmpeg where an equivalent exists). A builder who cannot reach that bar stops and reports instead of shipping. The first round (groups 1 to 7 of the paused plan) is model-free and has no new large downloads. Out of it: video watermark removal (dropped; blurring a mark is honest and is covered by the blur tool), vocal removal and stem splitting, speech noise removal (both moved to the model wave). Proposed for the model wave, pending the owner: models allowed only where they move a tool from weak to good (RNNoise, Demucs, person segmentation, Whisper, face and subject detection); self-hosted on our origin, never a third-party CDN; downloaded only when the tool is first used, with the real size shown first; cached after; nothing uploaded; hardware checked before a heavy run.

### Consequences
Every new tool page's report states the measurement that shows it meets the bar. Watermark removal has no page. The model wave needs its own ADR for hosting, caching, CSP and the size disclosure before any model ships.

---

## ADR-0063: Blur part of a video: key-framed regions sized relative to themselves, one WebGL renderer for preview and output, no pixelate page

**Status:** Accepted · **Date:** 2026-11-18

### Context
The job is hiding a face, a number plate, a screen or a name. The control has to be geometry on the picture, the subject often moves, and the result must actually hide what is under it (ADR-0062). Options considered: a fixed blur radius in pixels (the same setting hides a large face and leaves a small plate readable), a blur of the whole frame masked per region (one strength for every region), per-frame 2D canvas filters (`ctx.filter = blur()`, which darkens edges against transparent pixels and differs across browsers), automatic face tracking (needs a model, ADR-0062's model wave), and a separate `pixelate-video` page.

### Decision
`blur-region` engine and `blur-video` page. A region is a rectangle or an ellipse placed by key frames (centre and size as shares of the picture); one key, or "Follows a moving subject" off, is still; between keys it moves in a straight line, holding before the first and after the last; each region has its own time range. Strength is relative to the region's shorter side: Gaussian sigma 0.4 × strength, pixel block 0.5 × strength, default Medium (0.5); inverted mode (everything but the regions) is relative to the frame. One WebGL 2 renderer (`blur-region/render.ts`) runs in the worker and on the page's preview: the region plus three sigmas is reduced so the Gaussian works at sigma 2.5 texels, with clamped edges (no dark rim at the frame's edge). Box (solid black) is offered and advised for secrets. No pixelate page: the job and the control are the blur page's, and a page that differs only by a default effect is the doorway pattern the validator exists to stop; "pixelate" is a keyword and alias of `blur-video`.

### Consequences
Measured (Chromium, a 220×64 number plate in two versions with different letters, region drawn tight): letter-scale difference between the two results (A − B with its 17 px local mean removed) 108.6 levels before, 1.70 after Medium blur against an encoder noise of 1.12 on the same still picture; Strong 0.94 (noise 0.82); Light 7.92 (noise 2.39, large letters partly legible); Pixelate Medium 16.5 and Light 56.9 (noise 1.7 and 2.3). Blur keeps the coarse distribution of ink (whole-region difference 11.8 levels after Medium, 95.5 before), so a candidate-matching attack can still tell two known plates apart: the page says Box is the choice for secrets. A moving plate with two key frames: detail left 9 to 12% of the source at 0.2, 1.5 and 2.8 s. Speed (desktop Chromium, Apple silicon): 1080p30 39 fps, 4K60 10 fps (the WebGL canvas is read back for every encoded frame), 640×360 about 100 fps. Face detection and automatic tracking wait for the model wave.

---

## ADR-0064: Image layers: free placement, stack order and animated stickers decoded once in the worker; a separate page from the watermark

**Status:** Accepted · **Date:** 2026-11-18

### Context
"Add image", "overlay image" and "add sticker" ask for something the watermark page does not do: several pictures, placed and turned anywhere, each for its own time, stacked, some animated. Extending the watermark page would bury its one-logo-in-a-corner flow under layer controls; the validator would also see one engine with two jobs. Animated GIF, WebP and APNG need real frame timing in the output.

### Decision
`image-overlay` engine and `add-image-to-video` page: up to 8 layers, each with centre and width as shares of the picture, rotation, opacity and a time range; list order is stack order. The page reads each picture (natural size; SVG drawn once to PNG at up to 2048 px, since the worker has no SVG decoder; animation detected from the bytes). The worker decodes every frame once with `ImageDecoder`, at the size it is drawn, under a 512 MB budget (all layers scaled down together past it), and draws with the 2D composite; animation loops from the moment the layer appears, delays of 10 ms or less played as 100 ms as browsers do. Where `ImageDecoder` is missing the first frame is used and the summary line says so before the run. The watermark page stays as it is and the two pages link to each other in prose.

### Consequences
Measured: a still sticker and a blinking GIF or APNG (black then white, 0.5 s each), the animated one moved, turned 45° and shown from 1 s: absent before 1 s (the source picture unchanged there), black at 1.25 s, white at 1.75 s, black at 2.25 s; the ring of the still sticker where it was placed. Speed: 1080p30 69 fps, 4K60 33 fps with two layers. No ffmpeg.wasm path: ffmpeg-only containers are sent to the converter first (ADR-0066).

---

## ADR-0065: Green screen: a colour-difference keyer against a local screen plate, shared shaders, and no transparent output

**Status:** Accepted · **Date:** 2026-11-18

### Context
Real screens are unevenly lit and spill green onto the subject; the edges (hair, motion blur) are where keyers fail. FFmpeg's `chromakey` (YUV distance to one colour) plus `despill` is the local reference. Options tried on a synthetic shot with a known answer (`tests/e2e/greenscreen-scene.ts`: light from 62% to 112%, ±6 levels of noise, soft edges and spill): chroma distance to one key (as `chromakey` and OBS do), distance to the key's brightness line, a colour-difference keyer (G − max(R, B)) against the global key, and the same against a local screen plate with the screen subtracted from edge pixels. Transparent output was considered: no encoder and container pair was confirmed that both Chrome and Safari write and play with alpha.

### Decision
`chroma-key` engine and `remove-green-screen-from-video` page. Key-ness is the screen channel over the larger of the other two (green or blue; yellow and skin score zero). A plate of the screen's own colour is the average of clearly-screen pixels per 8 px block, blurred by about 28 px, on half-float targets. Cover = 1 − key-ness ÷ plate key-ness, ramped between 0.05 and 0.95 (Tolerance and Softness move the ends); the plate's colour × (1 − cover) is taken off and the background put in its place; Spill holds the screen channel down towards the larger other channel. The key colour is found from the frame's edge band (largest hue group covering at least a quarter of it) or tapped on the preview; no screen at the edges blocks the run with a request to tap. One set of shaders (`chroma-key/render.ts`) runs in the worker and the preview. Backgrounds: colour, image or video (fill or fit inside; a shorter video loops or holds its last frame, read in step by `overlay/follow.ts`). Sound: the foreground's, or none. Output always has a solid background.

### Consequences
Measured after the H.264 encode against the right answer, at 0.3, 1 and 2.2 s: 37.6 to 37.8 dB overall and 28.3 to 28.5 dB on edge pixels; FFmpeg 9 `chromakey` + `despill` with the same key at its best of four settings (0.07 / 0.05), without an encode: 35.4 to 35.9 dB overall and 23.8 to 24.2 dB on edges. Speed: 1080p30 28 fps, 4K60 8 fps. Green clothing turns grey at full Spill (the hint says so). The keyer has no model: it needs a screen; a "remove background" from ordinary footage waits for the model wave's person segmentation.

---

## ADR-0066: The composite gains a whole-frame WebGL stage, page time and a sound switch; region and layer tools refuse ffmpeg-only inputs with a way to convert

**Status:** Accepted · **Date:** 2026-11-18

### Context
`overlay/composite.ts` painted a 2D layer over each decoded frame. Blur and keying must read the frame, not paint over it, and need WebGL; later builders (text and time on the picture, picture quality) build on the same runner. Layers drew with the source timestamp, which differs from page time when a file starts after zero (ADR-0055). The ffmpeg.wasm fallback cannot express key-framed ellipses, layer stacks with animated stickers or a plate keyer without a second implementation of each.

### Decision
`CompositeJob` takes either `layer` (unchanged) or `stage`: a `FrameStage` gets each decoded frame, its page time and its draw size and returns the finished picture (a WebGL OffscreenCanvas). `pageTime: true` gives layers page time; `sound: "none"` writes the picture alone; `Layer.dispose` frees what a layer holds. `overlay/gl.ts` holds the WebGL 2 helpers (programs, unit quad, top-left pixel coordinates, clamped textures, render targets with optional half-float) for worker and page alike; `overlay/follow.ts` reads a second video frame by frame in step. Watermark, text and subtitles keep their behaviour (no flags set). Blur, image layers and green screen run on WebCodecs only; a file only ffmpeg reads, or a picture this browser cannot decode, is blocked on the page with a one-tap handoff to the converter.

### Consequences
AVI, WMV, FLV and MPEG-TS need one conversion step before these three tools. A WebGL canvas is read back for every encoded frame, which caps 4K at about 10 fps here; `transferToImageBitmap` or a VideoFrame from the canvas without readback is the next thing to measure. Builders B and D: `runComposite({ stage })` for whole-frame work, `runComposite({ layer, pageTime: true })` for drawing over it.

---

## ADR-0069: Styled burn-in stays on add subtitles: three looks, a position band, short phrases timed by length, tracks inside the video; no separate burn page

**Status:** Accepted · **Date:** 2026-11-18

### Context
Round 3 asked for styled burned-in subtitles: presets (Classic, Boxed, Bold social), size, position dragged on the picture, colour, box, line width, a live preview at the playhead with a cue list, a "short phrases" mode, embedded subtitle tracks as a source, and correct handling of encodings, overlapping cues, cues past the end, right-to-left and non-Latin scripts. `add-subtitles-to-video` already burns in (canvas renderer on WebCodecs, libass for ASS styling and ffmpeg-only containers, ADR-0022) and already ranks for "burn subtitles into video". A `burn-subtitles-into-video` page would be the same engine with `mode: "burn"` preset: the same job (a subtitle file and a video in, a video with the words in it out) and the same controls, which is the duplicate pattern ADR-0011 and ADR-0063 reject.

### Decision
No new page; the burn mode of add subtitles gains the looks. `CueRenderer` (`overlay/text.ts`) takes an optional `CueStyle` (size, weight, colour, outline, a box behind each line, wrap width, bottom edge); without one it draws exactly as before, and Classic with no overrides resolves to that same plain style (unit-tested). `subtitles-add/style.ts` resolves the look: Bold social is bold, larger and, on a vertical video, sits above the bottom 35% and inside 6% side margins, Meta's Reels safe zone from `src/content/platforms/frames.ts` (checked 2026-09-30); landscape gets the lower third. The page's preview draws with the same renderer on a canvas over the picture; a dashed band drags the text up and down (vertical slider for the keyboard); a cue list with Previous and Next sits under a filmstrip. Short phrases (`subtitles-add/phrases.ts`) split cues into the fewest phrases of at most 18 characters, as even in length as possible, breaking at clause punctuation, with time shared out by character count, labelled as an estimate; no phrase gets less than 300 ms. Word-level highlight is not offered: our parser does not keep ASS karaoke or WebVTT inline timestamps, and a highlight from estimated timings would be wrong more often than right. Text tracks already in an MKV or MP4 (SRT, ASS, WebVTT, MP4 timed text) are read with the extract engine's readers and offered as the burn source; picture tracks (PGS, VobSub) are not. A line whose first strong letter is Hebrew or Arabic is laid out right to left. Burned cues are drawn at page time (from the file's start), as the preview plays them. For ffmpeg-only containers the look is passed to libass as `force_style` on the 384×288 script.

### Consequences
Measured (Chromium, 640×360 flat grey, Boxed): two cues at 0.5–1.5 s and 2.0–2.8 s show on frames 15–44 and 60–83 exactly, the frames where a frame's time lies inside the cue (the rule libass follows; the local FFmpeg 9 has no libass, so the comparison with its `subtitles` filter is skipped there and runs where it exists); the box's bottom edge lands at row 336 for a band at 94% (338). Arabic, Hebrew, Chinese, Japanese, Korean, Devanagari, Thai, Greek, Cyrillic and Vietnamese all draw real glyphs with the renderer's font stack in Chromium on macOS, and each cue of a ten-script file leaves text in its frames; coverage on other systems depends on their fonts. The summary line changed to the dot-separated form; one existing assertion in `subtitles.spec.ts` follows it.

---

## ADR-0070: Progress bar and timer: one time-overlay engine, frame-time spans that end on the last frame, fixed-cell digits; the layer composite checks Cancel per frame

**Status:** Accepted · **Date:** 2026-11-18

### Context
A progress bar and a running timer are both drawn from each frame's time inside a range, on the 2D layer composite. Two questions decide whether they look right: where the span ends (a bar measured to the range's end is never full on the last frame; a countdown measured to it never shows 0:00), and whether proportional digits make the timer shuffle sideways. Cancel on the layer path did not stop the run: `Conversion.cancel` alone let it encode on (seen on the timer page 5 s after Cancel).

### Decision
`time-overlay` engine, two pages (`add-progress-bar-to-video`, `add-timer-to-video`) told apart by `kind`. The span runs from the range's start to the start of its last frame, so frame 0 shows an empty bar and 0:00 and the last frame a full bar, or 0:00 counting down. Counting up rounds down and counting down rounds up, with 10⁻⁶ s of slack for frame-time float error. Digits sit in fixed cells (0.72 em, wider than Geist Bold's widest digit at 0.693 em), each glyph centred, so the block's size is known without measuring a font and the block is sized for the widest value the range shows. The worker loads Geist Bold from `/wasm/fonts`; the page's preview draws with the same functions (`time-overlay/draw.ts`). The bar's end is drawn at a fractional width. Thickness and digit size are shares of the shorter side; the bar sits on the even output frame. `overlay/composite.ts`'s layer path now throws `cancelled` at the next frame once the signal is aborted (watermark, text, subtitles and image layers get the same fix).

### Consequences
Measured (Chromium, 640×360 flat grey, 90 frames): bar length against the ideal, worst 0.37 px and mean 0.07 px; FFmpeg's `overlay` with the command the page shows, worst 1.03 px and mean 0.50 px (it places the strip at whole pixels). Timer: counting up changes on frames 30 and 60 only; counting down from the span (2.967 s) changes on frames 29, 59 and 89 only; the same value drawn in two runs differs by 2.6 levels RMS (encoder noise), different values by 31.6. Cancel to ready: 40 to 54 ms on a 12 s 720p file. An ffmpeg-only container is sent to the converter, as for the other layer tools (ADR-0066).

---

## ADR-0071: Intro and outro: cards fitted to the main video on its frame grid, crossfades over picture and sound, written by the compose writer

**Status:** Accepted · **Date:** 2026-11-18

### Context
An intro or outro is a title card, a still (a logo) or a clip, usually of another size, rate and sound layout than the main video. `merge-videos` joins clips (packet copy when they match, a re-encode to the first clip's frame otherwise) but has no cards, no crossfade and keeps each clip's own frame times. A packet copy of the main video between encoded cards would need a second sample description, which mediabunny does not write and players handle unevenly.

### Decision
`intro-outro` engine and one page, `add-intro-to-video` (H1 "Add an intro and outro to a video"). The main video sets the frame (its display size, even) and the rate. Timeline: the intro, the video starting one crossfade before the intro ends, the outro starting one crossfade before the video ends; each fade at most half of either side. The intro and outro are drawn on the main video's frame grid (clips read in step by `overlay/follow`, fitted inside with bars or filling the frame); every frame, the main video's too, takes its own slot on that grid. In a fade the incoming part is drawn over the outgoing one at the share of the fade passed. Sound: the main video's and any clip's sound brought to one rate with the windowed-sinc resampler (ADR-0091) and the merge channel mix, silence under cards, equal-power crossfades. Everything goes through the compose writer (ADR-0075). Title cards are drawn by one function on the page and in the worker, bold Geist, sized down to fit 80% of the width and 60% of the height, white on dark colours and near black on light ones. A readable file name or the file's title tag fills the title; camera names (IMG_, PXL_, numbers) do not. Clips over 5 minutes are refused with a pointer to merge videos. Several videos can take the same cards as a batch.

### Consequences
Measured (Chromium; a 3 s grey video with a 440 Hz tone, a 3 s title card, an outro clip of 1 s at 480×480, 25 fps, 880 Hz mono 44.1 kHz, 0.5 s crossfades): 180 frames, 6.0 s, H.264 640×360 at a constant 30 fps, AAC; the title card black with white text; the middle of the first fade at 32.7 (ideal 32, black to grey 64); the video alone at 64; the outro fitted 360×360 between black bars; sound silent under the card (RMS 0), 439.6 Hz under the video and 880.0 Hz under the outro (zero-crossing estimate). Cancel to ready under 60 ms. The main video is always re-encoded once; the page says so and points to merge videos for lossless joins.

---

## ADR-0075: Time and layout tools write through one compose writer; freeze frame re-encodes the picture and copies the sound when it is unchanged

**Status:** Accepted · **Date:** 2026-11-18

### Context
Freeze frame, picture in picture and side by side, and platform clips all make a new picture frame by frame (repeated, composed or cut) and a new sound (silence put in, two mixed, cut exactly). The shared Conversion runner (`mediabunny/shared` `convert`) maps one source to one output frame for frame and cannot insert frames or take two pictures; the per-frame composite (`overlay/composite`) belongs to the overlay tools. A held frame could in theory be spliced into the copied stream (a long sample, or a second sample description), but mediabunny writes neither, players treat one-second-plus samples unevenly, and the sound would still need an edit list with gaps, which browsers do not honour.

### Decision
One writer, `engines/compose/encode.ts` `encodeComposed`: the engine hands in a frame producer (stamped `VideoSample`s) and a sound producer (planar float blocks at any rate and layout); the writer converts the sound, encodes H.264 and AAC (Opus where AAC is missing) into MP4, and carries every correction of the remove-silence writer it generalises (Baseline H.264 where High returns nothing, the WebKit AAC lead and its edit list, Opus tails, OPFS streaming above 768 MB, the frame rate told to the encoder, a 15 s stall watchdog, cancel within a frame). `compose/source.ts` opens a picture with the frame plan's decoder colour space and passes decoded frames straight to the encoder when they are even and square (rotation kept as track metadata); otherwise each is drawn to an even canvas. `compose/sound.ts` reads a span exactly `round(end·rate) − round(start·rate)` frames long, padded with silence where the sound ends early, with 5 ms ramps at joins. Freeze frame has two modes: Video pauses (the held frame repeated at the source rate for the hold, the sound cut at the end of the held frame with silence put in, both through the writer) and Sound plays on (the frames under the hold replaced, through `video-filter/picture` `encodePicture`, so the sound is packet-copied). The picture is always re-encoded, near the source bitrate (`crop/plan` `reencodeBitrate`); repeated frames cost almost nothing.

### Consequences
Measured on `sample.mp4` (640×360, 30 fps), Chromium: a 2 s hold at 1.5 s; the frames outside the hold against the source, 42.1 dB before and 40.1 dB after the hold (PSNR, all planes); the held frames identical to each other and to source frame 45; sound under the hold silent (RMS < 0.002), tone level unchanged outside. The ffmpeg command shown (`loop` per hold from the last, `atrim`/`aevalsrc`/`concat`; `freezeframes` per hold for Sound plays on) was run locally and gives the same lengths. Files only ffmpeg.wasm reads (AVI, WMV, MPEG-2) and pictures the browser cannot decode are refused before the run with a link to the converter (`options/native-only`), as there is no ffmpeg route.

---

## ADR-0076: Zoom and pan: key frames with a log-scale zoom, fractional views drawn with high-quality filtering, previewed with the same function

**Status:** Accepted · **Date:** 2026-11-18

### Context
A zoom must not duplicate crop (one rectangle for the whole clip, a smaller output). It moves a view over time and keeps the output size. FFmpeg's `zoompan` rounds the view's position to whole pixels, which makes slow moves step; interpolating the zoom factor linearly makes a push-in seem to slow down as it closes.

### Decision
`zoom-pan` engine, `zoom-pan/options.ts` the one source: a key frame is a time, a centre (0–1) and a zoom (1–8×); the view keeps the picture's shape; between key frames the zoom changes on a log scale and the centre in a straight line, eased with smoothstep ("Smooth") or not ("Linear"); views are clamped inside the picture. Each frame is drawn from the fractional view with `imageSmoothingQuality = "high"` onto a canvas of the source size, through `encodePicture` (sound copied). The page's overlay draws the view at the playhead as a crop frame (dragging it edits the key frame there or adds one), the timeline carries the key frames, and the Result preview draws the preview element through `rectAt`, the engine's function. The status line names the closest view's detail ("Closest view 2×: 180 of 360 lines of detail"). The ffmpeg command scales each frame by the zoom (`eval=frame`) and crops; `crop`'s `iw` keeps the first frame's size when `scale` changes it per frame, so the scaled size is written from the zoom expression.

### Consequences
Measured on `sample.mp4`, Chromium: a steady 2× view against FFmpeg's exact `crop=320:180:160:90,scale=640:360:flags=lanczos` 38.4 dB; the default 1×→1.5× push-in against the shown command 31.2 dB (FFmpeg rounds its scaled size and crop to whole pixels each frame, the page does not, so part of that difference is FFmpeg's stepping); first frames against the source 41.6 dB. HDR and 10-bit sources go through the canvas in sRGB like every canvas path here (ADR-0035).

---

## ADR-0077: One layout engine for picture in picture, side by side and stacked: a 3840 px frame cap, sound mixed under a limiter, a preview with its own clock

**Status:** Accepted · **Date:** 2026-11-18

### Context
Picture in picture and side by side are two searches and two pages, but the same work: two pictures decoded in step and drawn into one frame, one sound out of two. Two 4K pictures side by side would be 7680 px wide, which H.264 encoders in browsers refuse. Summing two full-level soundtracks clips. The stage shows no preview for multi-file tools.

### Decision
One `layout` engine with `layout: pip | side | stack` (the side-by-side page offers stacked as a choice; the picture-in-picture page is locked to pip by preset). `layout/options.ts` holds the geometry for the preview and the engine: Auto keeps both pictures whole (the main picture's shape for pip, at most 1920 px long; one height or one width for side and stack, never enlarged, at most 3840 px long); 16:9, 9:16 and 1:1 make a frame of that shape at up to 1080 px on the short side, each picture cut to fill its half or shown whole with bars. The inset keeps the second picture's shape, sits in a corner (anchored, so it stays there when the frame changes) or where it was dragged, with a rounded corner and an optional border. The second clip starts `offset` seconds after the first (negative skips its start); a clip not playing holds its nearest frame or is hidden. Output runs at the higher of the two frame rates, at most 60. Each output frame takes the frame each clip shows at that moment (a forward cursor over each `VideoSampleSink`). Sound: the main clip's, the second's, or both summed and passed through the look-ahead limiter at −1 dBTP (`sound/dsp/limiter`), so nothing changes below the ceiling. The page's `Below` is the preview: both videos placed with the same geometry in CSS, a clock of its own driving them (the output can outlast either), the inset draggable and moved by arrow keys.

### Consequences
Measured on the fixtures, Chromium: the main picture of a pip output, away from the inset, against the source 39.2 dB; the left picture of a side-by-side output (drawn at its own size) 44.5 dB. Two 10 s 3840×2160 60 fps H.264 inputs (headed Chromium, Apple silicon desktop, built app): side by side to 3840×1080 at 60 fps in 4.9 s with the browser's own processes peaking at 1.31 GB (0.64 GB before the run); picture in picture to 1920×1080 in 2.9 s, 1.25 GB peak. Phones were not measured; the panel says two 4K inputs may be slow or run out of memory there. The ffmpeg command (scale or pad into cells, `overlay` on a black `color` source, `adelay`, `amix` with `normalize=0` then `alimiter`) was run locally for pip, side and stacked frames. Rounded corners are not in the command (no simple FFmpeg filter).

---

## ADR-0078: Clips for short-video platforms: proposals at pauses and key-frame scene changes, every clip re-encoded, platform lengths only from dated sources

**Status:** Accepted · **Date:** 2026-11-18

### Context
Split video cuts at times the user sets and can copy losslessly at key frames. Cutting a long recording into short vertical clips needs boundaries that do not fall mid-word, a vertical frame placed per clip, and lengths that suit the platforms. Only YouTube Shorts states a length in `src/content/platforms/frames.ts` (3 minutes, checked 2026-09-30); TikTok's entry gives only an ad duration and Instagram Reels' none.

### Decision
`clips` engine and `cut-video-into-shorts` page. Candidates: the middle of every pause of at least 0.35 s (the remove-silence level analysis and its noise-floor threshold, `sound/dsp/silence`), scored by length, and scene changes found from key frames only (`clips/scenes.ts`: 32×18 grey, a change of at least 28/255 and three times the median), scored above any pause. From the start, each clip ends at the best candidate between half the cap and the cap, later preferred, never leaving a scrap under a quarter of the cap; with none, at the cap or in the middle of what is left (`clips/plan` `proposeCuts`). Boundaries are draggable and the proposal follows the length choice until one is moved. The analysis runs on the page after the first file, so the ready state is not held up by it: the sound in the sound-analysis worker (retried once on the page itself when that worker reports no progress for 6 s), then the scene pass on the page's own mediabunny (a second engine worker for it stalled intermittently in headless Chromium). Each included clip is cut at its exact times and re-encoded (a pause is rarely on a key frame), 9:16 cropped (a full-height window, at most 1080×1920, never enlarged, placed per clip) or over a blurred copy (`crop/native` `drawBlurred`, exported for it), or kept in shape; vertical sources keep theirs. Clips download one by one or as one ZIP (the stage's). Lengths offered: 15 s, 30 s, 1 min, 90 s and 3 min; the page states only the Shorts length, dated, and tells the reader to check TikTok and Instagram in their apps.

### Consequences
Measured on `sample-clips.mp4`, Chromium: the three pauses and the one scene change were found; with a 15 s cap the boundary landed on the scene change at 8.00 s; clip 1 (9:16 crop, 100×180) against the same crop of the source 43.9 dB. The window is as wide as the output's even-rounded shape (100 of 180 lines, not 101.25), so it is scaled evenly; an earlier 9:16 window squashed it by 1.25 % and measured 20.5 dB against an unsquashed reference. In headless Chromium the sound-analysis worker stalls at 0% on videos longer than about 20 s (also on remove silence; headed Chromium finishes the same file in under 4 s), so the e2e fixture is 18 s and the page retries the measurement itself. A 62-minute 640×360 30 fps video (headed Chromium, built app): pauses and key frames measured in 19.6 s (287 pauses, no scene change in the one continuous shot), 72 clips proposed at a one-minute cap, all 72 cut to 9:16 in 186 s with the browser's own processes peaking at 1.51 GB. Without sound, boundaries come from scene changes and the cap. All clips stay in memory as Blobs until downloaded; an hour cut into one-minute clips at 1080p is a few gigabytes.

---

## ADR-0099: Recorders replace the drop zone through an optional capture hook; the finished file opens as the result

**Status:** Accepted · **Date:** 2026-11-18

### Context
The screen, webcam and voice recorders (feature catalog J1 to J3) have no input file: the stage's idle state is a drop zone, and every later state assumes a file was read and an engine run on it. Forking the stage for three pages would break ADR-0016; an engine in the worker cannot hold MediaStream tracks, and `getDisplayMedia` must be called from the click itself.

### Decision
`IdleSpec` gains an optional `Capture` component (`options/types.ts`), rendered in place of the drop zone; pages without it are unchanged. It owns setup and recording and calls `onCaptured({ file, info, meta, ffmpegCommand })`; the stage then shows the done state with the file as the result (preview, Download, Start over, next step with the file handed on) through the engine's ordinary `OptionsSpec` (`options/capture.tsx`: verdict, `previewResult`, `nextStep`, `Hero` for sound). `onStart` loads that spec and the stage parts while the recording runs. Recording runs on the page (`engines/capture/recorder.ts`): mediabunny's `MediaStreamVideoTrackSource` and `MediaStreamAudioTrackSource` encode with WebCodecs as the tracks play, into a `StreamTarget` over an OPFS file opened with `createWritable()` (`capture/sink.ts`, same `outputs/<session>` directory and Web Lock convention as ADR-0058), or into a capped in-memory buffer where there is no OPFS. The engine ids `screen-record`, `webcam-record` and `audio-record` carry the options schema and a capability probe; their `run()` refuses, as there is no file to process. The encoder chunk loads on pointer-over or focus of Start recording, never on page load. A handed-on file is not taken by a recorder page.

### Consequences
No WebM-then-convert step: Stop writes the index and the MP4 is ready. Memory stays flat (2 MiB write chunks); a closed or crashed tab loses the recording (no recovery of the partial file yet; the next page sweeps it). The browser asks before a reload or close mid-recording. Stage changes are additive: the idle branch, `onCaptured`, and a guard in the handoff effect.


Amended 2026-11-18 (design review): Discard sits above the sticky bar, not in it, and asks first in a dialog ("Discard this 0:42 recording? It cannot be recovered."). The live line is not a live region (it changes four times a second); a hidden one announces phase changes and the time once a minute. Focus moves to Stop when recording starts and back to Start recording after a discard. The meter and waveform step at 4 Hz without scrolling under reduced motion. Microphone and camera bubble are each one device list with an "off" entry first. A closed share dialog is never an error in any browser; the macOS screen-permission message names System Settings and says to reopen the browser.
---

## ADR-0100: Recordings are MP4 with H.264 and AAC at fixed densities, sized from the first frame, with the AAC priming signalled; sound is never resampled by mediabunny

**Status:** Accepted · **Date:** 2026-11-18

### Context
Measured in Chromium with fake devices (2026-11-18): a shared screen's settings announced 1280×900 while frames came at 1280×720 (letterboxed recording); mediabunny's audio `transform` (channel count or rate) held every sample until `finalize()` (one 177,600-frame sample at Stop, nothing encoded live, so memory grew with the recording); AAC from WebCodecs starts with the encoder's priming, playing the sound late.

### Decision
Picture: H.264 in MP4 when the browser encodes H.264 and AAC; otherwise WebM with VP9 or VP8 and Opus, said on the recording line (never Opus in MP4, which QuickTime and most editors refuse). Variable bitrate at 0.08 bits per pixel per frame for screens and 0.1 for cameras, frames above 30 fps at 75 %, between 1 and 16 Mb/s; `latencyMode: "realtime"`, key frame every 2 s, content hint "detail" for screens. The size comes from the first frame (a muted video element, 1 s timeout, then the settings), made even and optionally capped at 1080 or 720 lines; every frame is fitted into that box (`fit: "contain"`), so a resized window or a turned phone is letterboxed, never refused. Screens are sampled at a constant 30 or 60 fps (a still screen sends no frames); a camera's frames keep their capture times wherever the page has `MediaStreamTrackProcessor`, since resampling to a fixed grid stamps each frame at the end of the interval it arrived in, half a frame late on average (measured: sound against picture −35, −48, −42 ms resampled; −13, −38, −27, −10, −37, −14, +1 ms with capture times). The camera bubble and a mirrored webcam picture are drawn in mediabunny's per-frame `process` step on an OffscreenCanvas (camera frames from a `MediaStreamTrackProcessor`, or a video element where there is none). Sound: no mediabunny transform; several tracks (microphone and shared sound) are mixed, and a single track at a rate other than 44.1 or 48 kHz is brought to 48 kHz, through Web Audio in real time. After Stop, an edit list skips the AAC encoder's priming measured by `priming.ts`; an Ogg Opus file gets its measured pre-skip.

### Consequences
Measured (Chromium 151 fake devices, 2026-11-18): static text at 1280×720 recorded at 316 kb/s average with luma PSNR 42.3 dB against the source, local FFmpeg libx264 veryfast at the same rate 41.2 dB; a noisy moving 720p source at 2.73 Mb/s (target 2.76), 241 frames in 8.03 s, luma PSNR 34.1 dB against libx264 veryfast 30.3 to 30.9 dB at the same rate; sound against picture at the first click, after subtracting the fake devices' own relation measured on the page just before recording, −27 ms on average over six webcam runs of the final harness (−9, −34, −32, −40, −34, −16 ms; sound slightly early, under one frame at 30 fps; `tests/e2e/capture-sync.spec.ts` holds it under 50 ms, as the harness itself moves by up to about 25 ms). Chromium's file-backed fake camera advances its content about 1.1 % slow (measured on the bare track), so later flashes drift in tests; that is the fake device, not the recorder. Live sound follows the system clock as mediabunny stamps it; a real microphone's clock skew against the system clock is not corrected. A recording starts about 0.3 s after the press (device open, encoder probe); the timer counts from the real start. Memory stays flat on long recordings (2 min of 720p webcam with a moving, noisy source, Chromium, built app): JavaScript heap after garbage collection 7, 7, 7, 7 and 8 MB at 10, 30, 60, 90 and 120 s while the file grew to 41.7 MB on disk; 3,571 frames in 120.1 s, sound 120.2 s.

---

## ADR-0101: The voice recorder writes M4A, WAV or Opus as it records; browser voice processing stays on by default

**Status:** Accepted · **Date:** 2026-11-18

### Context
A voice recorder must choose its format before recording (the file is encoded live), and browsers apply noise suppression, echo cancellation and automatic gain to microphones unless asked not to.

### Decision
M4A (AAC 128 kb/s mono, 192 stereo), WAV (16-bit PCM at the microphone's rate) and Opus in Ogg (64 kb/s mono, 128 stereo, `.opus`). MP3 is a next step to the converter (WebCodecs has no MP3 encoder). The three processing switches sit under More options, on by default because they suit speech, with hints saying to turn them off for music. WAV stops itself before the 4 GiB RIFF limit (6 h 12 min stereo, 12 h 25 min mono at 48 kHz); RF64 is not written, for compatibility.

### Consequences
Measured: all three formats read back at 48 kHz mono with lengths matching the recorded time; packets arrive every 10 ms during recording and the last one 10 ms before Stop's click. Opus files may not open in older players, which the page says.

---

## ADR-0102: The site installs as an app; a hand-written service worker caches visited pages and what they loaded, and updates without asking

**Status:** Accepted · **Date:** 2026-11-18

### Context
Feature catalog L5 and L6 ask for an installable app that works offline. The home page has about 2.9 kB of first-load script headroom (ADR-0031); a service worker library or a client registration component would spend it. The service worker must keep cross-origin isolation (ADR-0005) and the CSP (ADR-0027).

### Decision
`app/manifest.ts` (name from `site.name`, the monochrome mark as 192, 512 and maskable 512 PNGs made by `scripts/make-pwa-icons.mjs`, standalone, the light theme's colours). `public/sw.js`, no build step and no dependency: pages network-first with navigation preload, each loaded page kept (80 at most) and served offline, an unvisited page answered offline by a short note with the isolation headers; `/_next/static/` and `/wasm/` cache-first, stored only when a page first asks (400 entries at most), so an engine and the ffmpeg core are offline once used, never downloaded ahead; range requests and other origins untouched; `skipWaiting` and `clients.claim`, so a new worker takes over on the next navigation with no prompt, and pages, being network-first, are always the deployed ones. Registration is 154 bytes of inline script in the locale layout, production only, after `load`, hashed into the page CSP by `csp-hashes.mjs`.

### Consequences
No script resource is added to any page. Cached hashed files from old deploys age out by the entry cap. iOS installs from Safari's Add to Home Screen, without a share target.

---

## ADR-0103: Files shared to the app open a chooser of tools and are handed on, several at once where the tool takes several

**Status:** Accepted · **Date:** 2026-11-18

### Context
The manifest's share target delivers files as a POST. Tool pages take files only from a picker, a drop, a paste or another tool's handoff (module memory, one file).

### Decision
The service worker answers `POST /share-target`: it stores the files in the `share-inbox` cache and redirects to `/share` (noindex, not in the sitemap). The chooser reads and then deletes them, sorts them by kind (type, else extension) and lists a short, fixed set of tools for that kind, for one file or for several (several only lists pages that take them all: merge, or a batch). `lib/handoff` gains `setHandoffFiles` and `takeHandoffFiles`; the stage takes all handed files into a multi-file page or a batch and the first otherwise; single-file handoff is unchanged. Files of another kind than the first are named as left out. A `POST /share-target` with no active service worker redirects to the chooser, which says nothing was received.

### Consequences
A shared file is on the device only in the browser's cache, and only until the chooser reads it. The tool lists are maintained by hand in `app/[locale]/share/page.tsx`; a slug missing from the registry is dropped at build. Android Chrome and desktop Chrome or Edge with the app installed get the share target; iOS has none.


Amended 2026-11-18 (design review): the worker sorts the shared files by kind as the chooser does and redirects to `/share?files=N&kind=…`, so the page (rendered per request; it is noindex) shows the right tool list at first paint and only a two-line summary waits for the files; a tool chosen before they are read waits for them and then hands them on. Choices drop their arrows and the "in your browser" clause.
---

## ADR-0104: Recorder code loads only on recorder pages; the idle chunk is shared by every tool page

**Status:** Accepted · **Date:** 2026-11-18

### Context
Lighthouse CI on the built site (2026-11-18) showed every tool page loading the same 207.9 kB gz of script, over the 204.8 kB budget (ADR-0031). The server page hands each tool its own idle module (ADR-0030), but Turbopack puts every idle module of the map in one client chunk, so each tool page loads all of them. The three recorders' UIs were about 11.5 kB gz of that chunk.

### Decision
A recorder's `IdleSpec.Capture` is a `lazyCapture` wrapper (`components/tool/capture/lazy-capture.tsx`): the idle chunk holds only `React.lazy` and a holding shell; the recorder's own UI is a separate chunk. The page is prerendered with the recorder in it, so the first paint is the full recorder and hydration waits for its chunk (no fallback on a first load; the holding shell only on a client-side navigation). Within a recorder, the recording-time pieces (live line, controls, level meter, waveform) are lazy too and are fetched with the encoder on pointer-over or focus of Start recording. The recorder pages' pure helpers live in `capture/light.ts`, apart from the codec plans and command strings in `plan.ts`, which only the encoder chunk loads.

### Consequences
Measured with Lighthouse CI (mobile, applied throttling, three runs, final build of 2026-11-18): other tool pages 197.4 kB gz (from 207.9 before the split), screen recorder 204.8 kB (204,793 B, 7 bytes under the 204,800 B budget), webcam recorder 204.6, voice recorder 204.6, home 160.9 (budget 163.8; the service worker's inline registration adds no script resource); LCP 1.59 to 1.67 s, CLS 0, every assertion passing. To get there the refusal copy (`capture/access-messages.ts`), the screen recorder's recording preview and its phone notice (`capture/screen-live.tsx`) also load only when needed. The tool-page floor grew 1 kB while this round ran (other pages' idle modules), so the recorder pages have no headroom left: the next byte added to the shared idle chunk puts the screen recorder over. Splitting the idle map per page at build time would fix the cause for everyone; that is a stage-level change for the owner of ADR-0030.


Amended 2026-11-19 (design review): the review's fixes added code (a confirmed Discard, device lists with an off entry, the real format on the ready line). To pay for it, recording start and stop, Discard, the leave-page warning, device opening, the screen recorder's after-share steps and the format probe moved out of the first load; refusal copy already had. Measured (Lighthouse CI, three runs): voice recorder 204,670 B (under 204,800), webcam recorder 204,987 B (+187), screen recorder 205,064 B (+264), other tool pages 197,590 B, home 160,881 B. Two causes keep the screen and webcam recorders over: Turbopack copies `Segmented`, `Field` and `Checkbox` into the recorder chunk although the shared idle chunk already holds them, and every extra script response carries about 1 kB of headers, most of it the CSP. The shared floor also grew 1.2 kB during the round. Ways out, none taken here: split the idle map per page (the owner of ADR-0030), send the CSP header only on documents and worker scripts (an ADR-0027 change), or restate the tool-page budget.
---

## ADR-0093: Animated WebP, APNG and AVIF from video: our own muxers, an AV1 bitrate per pixel, BT.601 planes we convert ourselves

**Status:** Accepted · **Date:** 2026-11-18

### Context
Video → animated WebP, APNG and AVIF (catalog B6) had no engine. FFmpeg.wasm was not to be the primary path (ADR-0062), and no browser API writes an animated image. Measured in Chromium 151 and Playwright's WebKit 26.5: the canvas writes still WebP in Chromium, not in WebKit; both have VP8 and AV1 `VideoEncoder`s; `CompressionStream("deflate")` exists in both. Chromium's AV1 `bitrateMode: "quantizer"` barely changes the result (48.7 → 47.1 dB luma PSNR and 413 → 315 kB from quantizer 26 to 63 on one clip), so it cannot serve as a quality control. WebKit's encoders turn RGB into YUV with BT.709 and leave AV1 streams untagged, which readers take as BT.601 (34 dB → colour shift).

### Decision
A new `animated-image` engine shares the GIF engine's frame sampling and sizes. WebP: rectangles that changed by more than 6 levels since what is on screen, encoded by the canvas (libwebp, quality 0.6/0.75/0.9) and muxed by our `VP8X`/`ANIM`/`ANMF` writer; where the canvas cannot (Safari), every frame is a VP8 key frame from WebCodecs at 0.12/0.2/0.4 bits per pixel. APNG: our writer, exact changed rectangles, identical frames folded into longer delays, adaptive PNG filters, browser deflate; lossless. AVIF: AV1 at 0.06/0.12/0.24 bits per pixel per frame (variable bitrate), one key frame, our `avis` writer (`ftyp` avis, a `meta` primary item pointing at the first sample, one `pict` track; endless loop = edit-list repeat flag plus an indefinite track duration, as libavif reads it). For VP8 and AV1 the page converts RGB to BT.601 limited-range I420 itself and tags it (`colr` nclx 6/6/6), so every browser's output reads the same. Defaults: WebP 15 fps, APNG 12, AVIF 24, width 480, Balanced.

### Consequences
Measured on six 4 s clips at 480×270, 15 fps, against the lossless frames (Chromium): WebP Balanced 10.8 kB to 4.6 MB, luma PSNR 35.8 to 48.1 dB, 2 to 20 times smaller than a GIF of the same frames (ours or FFmpeg's palettegen); APNG 0 to 14% smaller than FFmpeg's `apng -pred mixed`; AVIF Balanced 13.9 kB to 111 kB (1.6 to 40 times smaller than GIF), but FFmpeg's SVT-AV1 reaches the same accuracy in a third to three fifths of the bytes, and pure noise collapses to 17 dB (stated on the page). Chromium 151 and WebKit 26.5 play, loop and stop all three as written. WebKit WebP through VP8 is about twice the size of Chromium's for the same accuracy. (Amended 2026-11-18 after re-measurement: about 1.1 times Chromium's size at the same accuracy on camera-like footage, larger where Chromium stores only changed rectangles; the page states 1.1.) Safari as a product and Firefox were not run; Firefox's lack of WebCodecs encoders would block AVIF there through the page's own probe.

---

## ADR-0094: The sharpest frame is the highest Laplacian variance on 2×2-averaged brightness; one page, the thumbnail maker deferred

**Status:** Accepted · **Date:** 2026-11-18

### Context
The brief asked for a thumbnail maker and a best-frame picker on one `frame-pick` engine, without duplicating extract frame or the contact sheet. The best-frame job (a sharp still of a moment) is distinct; the thumbnail job (a still sized and cropped for a destination, suggested by exposure and variety) needs a crop frame and a candidate strip, which did not fit this round.

### Decision
`frame-pick` scores every frame of a chosen range (an even sample above 900) by the variance of the 4-neighbour Laplacian of BT.601 brightness after 2×2 averaging (which removes most single-pixel noise), at a long edge of at most 640 px, then decodes the winner at full display size. One page, `sharpest-frame-from-video`, with the range on the trim timeline. The thumbnail maker is not built.

### Consequences
On a 3 s clip with one sharp frame among blurred ones it finds that frame, also with heavy grain added (3.7× the median), in Chromium and WebKit; on a panning shot with motion blur it picks the frame where the pan stops. 90 frames at 640×360 score in about 130 ms. A long range finds the most detailed scene, not the best expression; the page says to keep the range around one moment.

---

## ADR-0095: Embedded MP4 covers are shown by macOS Finder and Quick Look; no separate cover page this round

**Status:** Accepted · **Date:** 2026-11-18

### Context
The brief asked to verify which file browsers or players show an embedded cover before building a "set video thumbnail" page. `edit-video-metadata` already writes MP4 `covr` from an uploaded image.

### Decision
Measured on this Mac with `qlmanage -t` (the Finder and Quick Look thumbnailer): a blue MP4 with a red `covr` (written by FFmpeg, and by our edit-metadata engine, JPEG or PNG, landscape and portrait) shows red; without a cover, blue. Windows Explorer, VLC and phone galleries could not be checked here. The cover page (pick a frame of the video as the cover) is not built this round; the existing edit-metadata page covers an uploaded image.

### Consequences
At least one mainstream file browser shows the cover, so a frame-to-cover page is worth building next, with the claim limited to what was verified.

---

## ADR-0096: Creation dates are rewritten in every header and date key in place, set with a zone or shifted, on the edit-metadata engine

**Status:** Accepted · **Date:** 2026-11-18

### Context
Changing a video's recording date (catalog I4) is metadata, so it belongs on the edit-metadata engine (no re-mux; ADR-0011, one engine, a page preset). A file states its date in `mvhd`, every `tkhd` and `mdhd` (UTC seconds since 1904, 32 or 64 bit), Apple's `com.apple.quicktime.creationdate` key (local time with offset) and, from FFmpeg, a `creation_time` key; FFmpeg writes its keys in `moov/udta/meta`, iPhones in `moov/meta`.

### Decision
Options gain `dates`: set (local wall-clock time and a UTC offset) or shift (seconds). Every header's creation and modification time is rewritten in place (refused past 2040-02-06 in version 0 boxes or before 1904; an unset 0 stays unset when shifting), and both date keys are rewritten where they exist in either location, in the style they were written (Apple's offset kept when shifting). The page is `change-video-creation-date` (preset `task: "date"`), batchable, with a hero that reads the dates back from the output; heroes now receive the page preset (an optional `HeroProps.preset`).

### Consequences
FFprobe reads the new header and key values; the media bytes are unchanged and the size is unchanged when the key text keeps its length. The downloaded file's file-system date is the save time, which no page can set; the page says so. Matroska DateUTC is not edited.

---

## ADR-0097: Repair keeps every complete packet of a cut-off MP4, MOV, fragmented MP4, MKV or WebM; a missing index is diagnosed, not rebuilt

**Status:** Accepted · **Date:** 2026-11-18

### Context
Repair (catalog I5) covers files cut off by interrupted downloads, full cards and crashes. When the MP4 index (`moov`) is missing, rebuilding it (the untrunc approach) needs codec settings from a reference recording and the boundaries of every sound frame, which AAC in `mdat` does not mark; a wrong guess yields a file that plays wrongly.

### Decision
A `repair` engine diagnoses first from structure alone (`repair/diagnose.ts`): an intact index whose sample table lists bytes past the end (each track's complete lead counted), a fragmented MP4 with a partial last fragment, a Matroska segment shorter than declared or of unknown size, or no index. It then packet-copies (ADR-0021) into the same container: for a cut MP4/MOV everything presented before the earliest missing sample of any track, so picture and sound end together; for fragments the file up to the last complete fragment; for Matroska what mediabunny reads. A missing index is explained (with untrunc named) and not attempted. The page reads files itself (`inspect`), since the media inspector refuses them.

### Consequences
On a 4 s MP4 cut at 60%: 75 of 120 frames and 115 of 189 sound packets complete, 2.4 s written, and FFmpeg decodes the result with no error (it reports a partial file and an AAC error on the original). A cut MKV keeps 2.6 s, a cut fragmented MP4 its 2 whole fragments (2.1 s). Samples inside a partial fragment are not salvaged; a damaged but complete index is not rebuilt.

---

## ADR-0087: Pitch shifting is a band-limited resample plus a phase-locked vocoder that keeps attacks; one page for audio and video

**Status:** Accepted · **Date:** 2026-11-18

### Context
Change pitch (E11) must keep the length to the sample, land within a cent, and not smear drums. FFmpeg's usual chain (`asetrate`, `aresample`, `atempo`) is the baseline available locally (no `rubberband` in the Homebrew build). Measured on synthetic fixtures: its output length is off by up to 240 samples in 4 s, a 3-note chord with 5 harmonics each comes out with 15 to 20% of its energy (−6.8 dB at +3, −5.9 at −5, −4.9 at +12) away from the expected partials, and at +3 its attacks land about 25 ms early. A plain phase vocoder (93 ms frames) keeps tones exact but spreads each drum hit over its window: echo 11 to 13 dB under the hit in the 40 ms before it.

### Decision
`sound/dsp/pitch.ts`: read the sound p times faster through a Kaiser-windowed sinc resampler (ADR-0091), then stretch it back by a phase vocoder with identity phase locking (4096-point Hann frames at 44.1/48 kHz, synthesis hop of an eighth), stereo as mid and side. Attacks are found on the stretched signal (3 ms windows of first-difference energy, 9 dB over the previous 24 ms); the frame grid is re-anchored on each attack, no frame reads or writes across one (separate input and output masks), the first frame after it takes the analysis phases, and the overlap-add divides by the window weight each sample really got. Output length equals input length exactly, aligned without delay. The engine (`pitch`) runs through the shared sound job with an optional `processor` hook (additive in `sound/job.ts`) and the existing page runner, so video pictures are copied and MP3/OGG go through ffmpeg.wasm as for volume; peaks raised above −1 dBTP by the shift go through the shared limiter. The page audits a shift before running: a preview worker (`workers/sound-preview.worker.ts`) decodes 8 s at the playhead and runs the same `PitchShifter`. One page (`change-audio-pitch`) takes audio and video: the job and the output (same format, same length) are the same for both, the ADR-0043 case for one page.

### Consequences
Measured (tests/unit/sound-pitch.test.ts): tones at ±1, 3, 5, 7, 12 semitones and with cents land within 0.01 cent, level within 1%, residual under −90 dB, length exact for every input from 1 sample up, every block size gives the same samples. Attacks: echo before a click −24.7 dB (+3) and −26.1 dB (−5) against −26.1 dB in the source (plain vocoder −12.9 and −10.9), the click within 0.3 ms of its place. Chord: energy off the partials −45.7 dB (+3), −42.5 (−5), −23.8 (+12), against FFmpeg's −6.8, −5.9, −4.9; a single note with 8 harmonics −48.7 to −53 dB at every shift. The +12 chord figure is limited by partial pairs 10 Hz apart that no 93 ms frame resolves. Formants move with the pitch (no formant preservation); the page says so. About 25× real time per core.

---

## ADR-0088: Key and tempo come from our own signal analysis; the finder is a multi-file page whose list is the results table

**Status:** Accepted · **Date:** 2026-11-18

### Context
The key and BPM finder (E11) must be accurate without a model, give half and double tempo, the relative key, the Camelot code and an honest confidence, handle tempo that moves, and analyse many songs at once. Pages with `noAction` cannot batch (ADR-0025).

### Decision
`sound/dsp/music.ts` reads features in one streaming pass: an onset curve (rectified rise of log(1 + 10·|X|) up to 4 kHz, 2048-point frames every 256 samples) and a 10-cent pitch-class histogram of interpolated spectral peaks (16 384-point frames, 55 Hz to 4.2 kHz). Tempo: autocorrelation over 24 s windows weighted by a log-normal prior at 130 BPM, refined to 0.01 BPM by folding the curve modulo the period over the whole piece, strength judged against off-tempo folds (white noise 0.05 to 0.08, music 0.88 to 0.94, threshold 0.35: below it the page says there is no steady beat); 16 s windows give the local tempo, and a spread above 2% reports the average and the range. Key: tuning from the histogram's circular mean, chroma correlated with Temperley's Kostka–Payne profiles; confidence from the margin over the runner-up. The page (`key-bpm-finder`, engine `audio-analyze`, which returns JSON) is `multiple` (1 to 50) with `noAction`: each row's note is its result, the panel shows one song in full and downloads a CSV; "Change the key" hands the song to the pitch page.

### Consequences
Measured on synthetic tracks (tests/unit/sound-music.test.ts, kick, clap, hats, bass and chords; no copyrighted audio): all 24 keys right with high confidence, a 30-cent sharp recording read as 29 cents; 12 tempos from 75 to 174 BPM right to 0.1 BPM at the kick's level, 60 and 200 read at double and half (both shown as alternatives); a tempo moving from 116 to 124 BPM averaged 119.7 to 120.1 with the range given; 48 and 22.05 kHz read alike; MP3 and AAC fixtures read the same as the source. Krumhansl–Kessler profiles also named every key but left the parallel key within 0.01 to 0.14. Tempo between half and double is a convention, not a measurement; real music with key changes or modes reads with lower confidence. About 160× real time.

---

## ADR-0089: Merge audio copies MP3 frames when the files match and otherwise decodes once; multi-file jobs may run on the page

**Status:** Accepted · **Date:** 2026-11-18

### Context
Joining audio files (E11) end to end: users expect MP3s to keep their quality, files of other rates and layouts to join cleanly, and optional gaps, crossfades and even loudness. MP3 has no encoder in WebCodecs, and multi-file runs only went to the engine worker.

### Decision
Engine `join-audio`. MP3s with the same rate and layout, joined end to end without loudness matching, are joined frame for frame (`join-audio/mp3-join.ts`): each file's audio frames (ID3v2, Xing/Info, APE and ID3v1 skipped, every frame header walked) become slices of the input Files behind one new Info frame with the total count, an index built from the real frame offsets, and a LAME tag holding the first file's encoder delay and the last file's padding (the writer of ADR-0061, rebuilt for a frame count we already know). Each inner join keeps the padding and delay of the two files (13 to 39 ms at 44.1 kHz for LAME files); the page says so. Everything else decodes file after file, converts to the first file's rate with the band-limited resampler (ADR-0091) and to the widest layout (mono plays on both sides), applies median loudness matching (EBU R128, limiter at −1 dBTP), a gap or an equal-power crossfade (shortened to half the shortest file), and encodes once: AAC or PCM in the worker, MP3 and FLAC by ffmpeg.wasm from float WAV. The stage gains `runManyJob`: a multi-file spec whose `route` says "page" runs `pageRunnersMany[engine]`; every other multi-file tool keeps the worker path unchanged. A multi-file spec with a `Hero` and `previewResult` shows that hero for the output once done (merge audio: the joined file's waveform and player instead of file 1 in a video box); no other multi-file spec has a hero, so nothing else changes.

### Consequences
Measured: two MP3s joined decode (ffmpeg) to exactly the sources' samples plus the predicted join gap, and their packet data is byte-identical to the sources' (tests/unit/join-audio.test.ts, tests/e2e/sound-tools.spec.ts). A 44.1 kHz stereo WAV and a 48 kHz mono WAV join to exactly 264 600 samples at 44.1 kHz stereo with the second file's tone within a cent on both sides. Memory stays flat in the number and length of files; outputs past 768 MB stream to OPFS. Tags are not carried into a frame copy; the ffmpeg encode carries the first file's.

---

## ADR-0090: The ringtone maker writes iPhone M4R and Android MP3 or OGG, suggests the loudest 30 s, and enforces no length limit until one is verified

**Status:** Accepted · **Date:** 2026-11-18

### Context
A ringtone maker should default to a good part, fade it, optionally make it louder, and write what each phone takes. The iPhone ringtone length limit and the current install steps could not be checked against a primary source in this session (no web research), and inventing a number is not allowed.

### Decision
Engine `ringtone`: the chosen part is read alone (`renderSound` with one span, so a video's sound works too), faded (quarter-sine, 0.5 s in, 2 s out by default), optionally brought to −14 LUFS with peaks under −1 dBTP, and written as AAC 192 kbps in MPEG-4 named `.m4r` (native where the browser encodes AAC, else ffmpeg.wasm) or as MP3 or Ogg Vorbis 192 kbps for Android through ffmpeg.wasm; the result is decoded again and its loudness stated. The part opens on the loudest 30 s (`suggestPart`, from the 10 ms levels, starting at the quietest moment in the second before). No maximum length is enforced and the page states none; the install paragraph names the methods without a check date.

### Consequences
The main session must verify the iPhone length limit and the install steps against Apple and Android primary sources, then add the limit as a dated cap (one constant in `ringtone/options.ts`, `DEFAULT_RINGTONE_SEC` stays) and date the steps. Until then a user can make an iPhone ringtone longer than iOS accepts.

---

## ADR-0091: New sound tools resample with a Kaiser-windowed sinc, not linear interpolation

**Status:** Accepted · **Date:** 2026-11-18

### Context
The merge and sound render resample linearly (`merge/resample.ts`), which does not filter and folds content above the new Nyquist frequency back into the band. Pitch shifting reads every sound at a non-integer rate, and merge audio joins 44.1 and 48 kHz files.

### Decision
`sound/dsp/resample.ts`: streaming, any ratio, 64 zero crossings, Kaiser β 10, passband to 90% of the lower Nyquist frequency, cutoff falling with the step when reading faster, a 512-point-per-crossing table with linear interpolation, state across blocks. Pitch, merge audio and the preview use it. Existing engines keep their resampler; moving them is a separate change.

### Consequences
Measured: a 1 kHz tone 44.1 → 48 kHz keeps its level to 10⁻⁴ with the residual under −100 dB; 9 kHz through 44.1 → 22.05 kHz keeps its level within 0.01 dB, 15 kHz is removed by more than 90 dB; any block size gives the same samples. It costs about 130 multiply-adds per output sample and channel.

---

## ADR-0098: Thumbnail maker and frame-as-cover pages: suggestions scored on the page, one engine under two ids, MOV covers on the cover page

**Status:** Accepted · **Date:** 2026-11-18

### Context
The owner asked for the two pages deferred in ADR-0094 and ADR-0095. One options spec is loaded per engine id, and a crop frame (`Overlay`) on the sharpest-frame page would hide its playback bar. Quick Look shows a `covr` item in a QuickTime-branded file too, but the tag page treats MOV as having no cover and FFmpeg-style MOVs keep tags as numbered keys in `udta/meta`.

### Decision
Thumbnail maker (`video-thumbnail-maker`): the `frame-pick` engine gains a `thumbnail` mode (frame at a time, cropped in display pixels, scaled with high-quality resampling, JPG/PNG/WebP) and is registered a second time as engine id `thumbnail` so the page has its own spec: crop frame for 16:9, 9:16 or 1:1, size presets or crop size, suggestions from 30 frames sampled on the page and scored by exposure × √(sharpness ÷ median), with near-duplicates (16×9 brightness signature within 0.06) dropped. No platform size is stated (none is in `src/content/platforms/`). Frame as cover (`change-video-thumbnail`): the edit-metadata engine with preset `task: "cover"` and a new `coverInQuickTime` option, so MOV gets an iTunes item list with `covr` in `udta`; MOVs whose `udta/meta` is a metadata-key list are refused. The frame is captured from the preview as a JPEG, at most 1920 px on its long side.

### Consequences
On a fixture with 1.5 s of black, a test pattern and colour bars, suggestions skip the black and cover both scenes. Quick Look showed the cover for MP4 (landscape, portrait) and MOV. The tag page's MOV behaviour is unchanged.

---

## ADR-0092: Cached worker scripts keep the worker's own URL; every worker says when it is ready (the sound worker stall)

**Status:** Accepted · **Date:** 2026-11-18

### Context
In headless Chromium the loudness and level worker (`sound-analysis.worker`) sat at 0% on normalise and remove silence (builder C saw the same on clips, and a second engine worker that hung), and sound runs that start a second engine client sat at "Loading the encoder". Measured 2026-11-18 on a production build with a 60 s AAC file: 6 loads in 6 stuck. Ruled out by experiment: WebCodecs (a bare `AudioDecoder` in a blob worker decoded all 2585 frames in under 70 ms, three at once), concurrent reads of one `File` from four workers (26 ms), and mediabunny's stream reader (`useStreamReader: false` changed nothing). Logging every worker message on the page showed the cause: the waveform and loudness workers, created from their own URLs, answered with the engine worker's own `{ type: "ready", id: 0 }` and ignored their jobs; created by hand from the same URLs with no service worker in the way, they ran their own code. Turbopack starts every worker from one bootstrap file and names each worker's chunks in the URL fragment (`turbopack-worker-<hash>.js#params=...`), read from `location.href`; a worker's location is the URL of the response that started it. The service worker (ADR-0102) serves `/_next/static/` cache first, and the Cache API ignores fragments, so once the first worker's bootstrap response was cached (written after its fetch, hence the timing), every later worker received that response with the first worker's URL, loaded the first worker's chunks and ran its code. Separately, the Turbopack runtime runs a worker's entry module only after awaiting its other chunks, so a message posted right after `new Worker()` can arrive before the handler exists and be dropped.

### Decision
`public/sw.js` returns a cached worker script as a new `Response` (no stored URL), so the worker keeps the URL it was created with; other files are returned as before. Every worker posts a ready message as the last line of its module (`workers/ready.ts` `announceReady`; the engine worker `{ type: "ready", id: 0 }`), the page sends nothing before it (`startWorker`; `EngineClient` queues inspect, run, cancel and release), and a worker that has not said it is ready within 4 s, having run none of our code, is replaced, up to three times, with a console warning.

### Consequences
Measured after (same build and fixtures): see the e2e results in the round 3 report. Regression tests: `tests/unit/worker-ready.test.ts` (a worker that drops early messages, and one that never runs its module) and `tests/e2e/sound-tools.spec.ts` (normalise, waveform and remove silence on 60 s AAC, three times each, in one browser context so the service worker is active). Any new worker must announce readiness, and any service-worker change must keep worker scripts' URLs. C's 6 s retry on the clips page and its move of scene detection to the page can be revisited.

---

## ADR-0081: Denoise is a spatio-temporal non-local means on the GPU, its strength set by grain measured in the video

**Status:** Accepted · **Date:** 2026-11-18

### Context
Denoise had to beat what a user gets from local FFmpeg (ADR-0062) and run on device without a model. Candidates: a recursive low-pass like `hqdn3d`, a bilateral filter, spatial non-local means like `nlmeans`, and non-local means that also searches the previous cleaned frame. A fixed strength suits one clip and over- or under-filters the next. Measured on a dead-leaves pan with Gaussian grain (`sample-grainy.mp4`, luma σ about 9 levels; clean reference rebuilt by `scripts/make-quality-fixtures.mjs --clean`), first as a JS prototype, then in the browser.

### Decision
`clarity` engine (`job: denoise`), `denoise-video` page. Each pixel is the average of the 5×5 neighbourhood in this frame and in the previous cleaned frame, weighted exp(−max(d − 2σ², 0)/h²) by 3×3 brightness-patch distance, the pixel itself weighted as its best match; h = strength × σ. σ is measured on the page before the run (Immerkær's operator over the flatter half of the middle 512×512 px of five frames, median) and passed in the options, so preview and file use the same figure; the worker measures again when it is absent (batch). One WebGL 2 renderer (`clarity/render.ts`, half-float targets) runs in the worker and in the page's before/after split. Strength presets 0.7, 1, 1.4 of σ, slider 0.3 to 2.5. A frame step forward in the preview carries the recursion on, any other seek starts from the frame alone.

### Consequences
Measured (Chromium, losslessly read from the preview canvas, frame 30, PSNR all planes against the clean picture): source 30.87 dB; drawn alone 36.52; after stepping from the start (as the file is made) 37.77; FFmpeg `nlmeans=s=6:p=5:r=11` (its best of the settings tried) 37.05; `hqdn3d=16:12:24:18` (its best) 35.36; FFmpeg defaults are far weaker (`hqdn3d` 31.2, `nlmeans` 30.8 over the clip). JS prototype over 30 frames: 37.8 dB luma against 36.8 for tuned `nlmeans`; at light grain (σ ≈ 3.7) 43.3 against 42.7. The written file (browser H.264 at the standard re-encode rate, 829 kb/s for this 640×360 clip): 33.20 dB against the source's 30.22; FFmpeg's filters through libx264 at the same rate give 34.86 (`nlmeans`) and 33.91 (`hqdn3d`), so the encode, not the filter, limits the file here. Speed (headed Chromium, Apple silicon): 1080p30 77 fps, 4K60 41 fps. The ffmpeg command shown uses `nlmeans` with the same patch and search, spatial only.

---

## ADR-0082: Sharpen is a brightness-only unsharp mask with a grain threshold and a halo limit, on the denoise renderer

**Status:** Accepted · **Date:** 2026-11-18

### Context
A plain unsharp mask (FFmpeg `unsharp`) lifts grain, draws bright and dark halos at edges, and fringes colour when applied per channel. Contrast-adaptive sharpening (`cas`) was weaker on the fixture. The page needs a before/after view that matches the file.

### Decision
Same `clarity` engine (`job: sharpen`), `sharpen-video` page, same renderer and split preview as denoise. Brightness is blurred by a separable Gaussian (Detail size Fine 0.7, Medium 1, Coarse 1.8 px), the difference scaled by the strength (Light 0.8, Medium 1.5, Strong 2.5), differences under 2.5 levels scaled down (grain), the result held within its 3×3 neighbourhood's range ± 10 levels, and the change added to R, G and B alike.

### Consequences
Measured on `sample-soft.mp4` (the clean scene blurred by σ 1.2), frame 30 read losslessly from the preview: soft 31.09 dB, Medium 34.17, FFmpeg `unsharp` 7×7 1.5 34.69 and 5×5 1.5 34.61 against the unblurred picture; the prototype at amount 2 reached 35.76 dB and SSIM 0.977 against `unsharp`'s best 35.37 and 0.972, so a fidelity score slightly favours stronger, halo-free-of-limits settings while the page keeps the halo limit. Grain is still lifted (the prose says to denoise first). Speed: 1080p30 108 fps, 4K60 49 fps.

---

## ADR-0083: Stabilize measures global motion by direct alignment, smooths the path with a Gaussian and holds it inside the picture

**Status:** Accepted · **Date:** 2026-11-18

### Context
FFmpeg's `vidstab` (two passes, local features) is the usual reference; it is not in this machine's FFmpeg 9 build, so `deshake` (one pass, translation only) was measured instead. Options: block-matched features with RANSAC, phase correlation, or direct (dense) alignment of brightness. The correction must not show empty edges by default, and a sudden jolt should not force a large zoom on the whole video.

### Decision
`stabilize` engine and `stabilize-video` page. Pass 1 decodes every frame at 320 px wide (CanvasSink, display orientation) and finds the similarity (shift, turn, scale) to the previous frame by Gauss-Newton over a pyramid with Tukey weights (moving subjects count little); pairs that do not line up (cut, flash) count as still. The camera path is smoothed per parameter with a Gaussian (σ 0.33, 1 or 2.5 s for Light, Medium, Strong; odd reflection at the ends keeps a pan a pan). Zoom to fill (default) enlarges by what the smooth path needs, at most 8, 15 or 25%; frames that would need more are pulled towards the camera's own path, the pulled path is smoothed again, and a final per-frame limit guarantees no edge. Show borders keeps the size with the same limit on the correction. Pass 2 redraws each frame in WebGL with Catmull-Rom bicubic sampling and encodes once to H.264 near the source's bitrate; sound is copied. Progress reports the analysis, then the frames written. Rolling shutter is not corrected.

### Consequences
Measured on `sample-shaky.mp4`-style footage (a 640×360 view over a known scene with ±9 px, ±7 px and ±1.2° hand shake, a slow pan and an independently moving box), each output frame registered against the known scene: residual jitter (RMS of the path minus its 10-frame Gaussian) input 5.37 / 4.82 px and 0.920°; FFmpeg `deshake` 2.94 / 4.23 px and 0.983° (it does not turn); this engine Light 0.37 / 0.76 px and 0.147°, Medium 0.07 / 0.09 px and 0.022° at 14.6% zoom, Strong 0.07 / 0.06 px and 0.016°. Frame-to-frame jerk in the e2e (the engine's own estimator at 320 px): 3.92 / 2.80 px and 1.178° before, 0.04 / 0.05 px and 0.022° after. Speed, both passes (headed Chromium, Apple silicon): 1080p30 38 fps, 4K60 31 fps; JS analysis about 17 ms a frame. Real footage with parallax, rolling shutter or motion blur was not measured; there is no ffmpeg.wasm path (files only ffmpeg reads go to the converter first).

---

## ADR-0084: Black bars are found on the page from 24 sampled frames by agreement, on the crop engine with a `bars` preset

**Status:** Accepted · **Date:** 2026-11-18

### Context
FFmpeg's `cropdetect` takes the union over frames, so one dark scene or a subtitle in a bar moves the answer, and it has no notion of content inside a bar. Removing bars is a crop; a new engine would duplicate the crop engine's processing.

### Decision
`remove-black-bars-from-video` page on the `crop` engine with `presetOptions: { bars: true }` (an optional schema field that does not change processing). The page reads 24 frames from 5% to 95% at full size; per frame a row or column is bar when at most 1% of it is brighter than 32/255, plus up to two lines of bleed (mean under 35% of the picture's three lines in; WebKit draws `sample-letterbox.mp4`'s last bar row at a fifth of the picture's brightness); frames whose content is under a fifth of the picture are skipped. Per edge, the bar is the size most frames agree on within 2 px (ties to the smaller), even, at most 45% of the side, nothing under 4 px. Frames whose bar is clearly smaller are named as content inside the bar, with a tick box that keeps that strip. The crop frame starts on the answer and stays adjustable; no bars is a settled success.

### Consequences
On `sample-letterbox.mp4` (46 px bars, a near-black scene with one grey patch, a white strip in the bottom bar for 0.6 s): 46 px top and bottom in Chromium and WebKit, the strip named in 6 of 24 frames, output 640×268, the kept picture 40.1 dB against the same crop of the source after one encode. Blurred or coloured bars are not detected (the prose says so). Files only ffmpeg reads are sent to the converter first, as the detection decodes on the page.

---

## ADR-0085: Change bitrate is its own engine: explicit video kb/s in the source's codec where possible, sound copied or at its own rate, the written rate read back

**Status:** Accepted · **Date:** 2026-11-18

### Context
Compress picks a bitrate from a preset or a target size, always writes H.264 in MP4 and always re-encodes AAC at 128 kb/s; it has no explicit rate, no constant rate and no sound copy. Adding those to compress would crowd its page and change its promise.

### Decision
`bitrate` engine and `change-video-bitrate` page (compress category). Options: video kb/s (log slider plus a field, default the Balanced density capped at 70% of the source's rate), sound Copy (default), 64 to 320 kb/s or None, rate control Variable or Constant (offered only when `canEncodeVideo` confirms it), and the codec: the source's (HEVC, VP9, AV1) when this browser encodes it, else H.264, in the container the codec page uses. The picture goes through `encodePicture` (sound packet-copied); `PictureJob` gains `sound: "encode"` and `audioBitrate` (additive). The result reads the written video's average rate back from its packets.

### Consequences
Measured (Chromium): `sample.mp4` asked 300 kb/s, 315 kb/s written (ffprobe); a VP9 WebM stays VP9 with its Opus copied; an MKV stays MKV. The estimate is (video + sound) × duration × 1.01. WebKit encodes are not covered by the e2e.

## ADR-0105: No on-device ML models: the toolkit stays model-free

**Status:** Accepted, amended by ADR-0106 (small models for five named jobs) · **Date:** 2026-11-19 · Supersedes the model-wave part of ADR-0062

### Context
ADR-0062 kept the quality bar and a model-free first round, and proposed a later wave of on-device models (Whisper captions and transcripts, subtitle translation, RNNoise speech cleanup, Demucs vocal removal, segmentation for background removal, face tracking), downloaded on first use. Those downloads are tens to hundreds of MB, slow on weak phones, and break "light and ready when the page loads".

### Decision
The owner decided (2026-11-19) that no tool will use a machine-learning model, now or later. Every tool is signal processing, codecs, geometry or text handling that runs from the page with no model download. Catalog rows that need a model (E8 speech noise removal, E9 vocal isolation, F2 auto subtitles, F7 transcription, F8 and F5's subtitle translation, automatic face tracking in G3, background removal without a screen) are not planned. `@huggingface/transformers` is not a dependency.

### Consequences
No model hosting, caching, CSP or size-disclosure work. Prose and the vocabulary table send model-shaped queries to what the site does honestly (a subtitle file, a green screen, a blur region placed by hand) and say what it does not do. Model-free tools still open: compare two videos, mains hum removal (50/60 Hz), saved presets, platform pages waiting on dated sources.

## ADR-0106: Small on-device models (under 2 MB each) are allowed for four named jobs

**Status:** Accepted · **Date:** 2026-11-19 · Amends ADR-0105

### Context
ADR-0105 (same day) ruled out every model. The owner then reviewed which model-backed features have small models and decided those are in scope: they run in the user's browser like the ffmpeg engine (a static file we host, downloaded on first use of that one page, cached, executed on the device by WebAssembly or WebGPU), so no server, no upload and no per-use cost (ADR-0024 unchanged).

### Decision
Allowed, each on its own page or as an option of an existing one:
1. Speech noise removal (RNNoise, about 100 KB).
2. Pauses found by speech, not loudness (Silero VAD), for remove silence and the Shorts clip boundaries.
3. Automatic face finding and following for blur (BlazeFace or YuNet), with the user still able to check and add regions by hand.
4. Background blur or replace for a talking-head video without a green screen (MediaPipe selfie segmentation).

Rules: each model file is under 2 MB (owner, 2026-11-19), so DeepFilterNet's usual builds are out unless a variant measures under it; the runtime that executes a model is measured and reported with it and kept as small as possible (a model's own WASM build or a lean inference of our own before a general runtime of several MB); nothing loads before that tool's page is used; models and runtimes are self-hosted (no third-party fetch, CSP unchanged in spirit); licences must be permissive and are recorded in README tech stack and `/licences`; each tool still meets ADR-0062's bar on fixtures, and the page states what it misses (side-on faces, hair edges, music behind speech). Everything else in ADR-0105 stands: no Whisper, translation, Demucs or other large models.

### Consequences
A runtime choice is needed per model (a model's own WASM build, a lean hand-written inference, or a shared runtime if one fits the cap); that is measured before any page is built. Sizes, licences and runtimes are verified from primary sources first; the figures in the 2026-11-19 conversation were from memory.

## ADR-0107: First-load script budget raised to 300 KB (home and hubs) and 350 KB (tool pages)

**Status:** Accepted · **Date:** 2026-11-19 · Restates the numbers of ADR-0031

### Context
ADR-0031 capped first-load script at 160 KB gz on home and hubs and 200 KB on tool pages, about 8 and 48 KB above the framework floor (React DOM, Next, next-intl, about 152 KB). By the end of round 3 every tool page was within 7 KB of the cap and two recorders were a few hundred bytes over it (ADR-0104 amendment), and the planned discovery work (search, file-first suggestions) needed room. A typical mobile page ships around 500 KB of JS; the commonly cited guidance for a page usable in a few seconds on a median phone is roughly 300 to 350 KB (owner discussion, 2026-11-19, figures from memory).

### Decision
The owner raised the budget (2026-11-19): home and hubs 300 KiB gz (307,200 B), tool pages 350 KiB gz (358,400 B), enforced in `lighthouserc.cjs`. Every other Lighthouse assertion stays as it was: performance ≥ 0.95, LCP ≤ 1.8 s under applied throttling, CLS 0, accessibility, best practices and SEO at 1. The budget is a ceiling, not a target: ADR-0030's rule stands (a page's first load is its drop zone; engine UI, search indexes and model files load on use).

### Consequences
The recorders pass without splitting the idle map; splitting it (ADR-0104) stays a good optimisation, no longer a blocker. A new page or feature that spends the extra room must still pass the unchanged speed assertions, so slow script cannot hide behind the larger number.

---

## Template

```
## ADR-00NN: <title>

**Status:** Proposed | Accepted | Open | Superseded by ADR-00MM · **Date:** YYYY-MM-DD

### Context
<what forced the decision; alternatives considered>

### Decision
<what we chose and why, in a few sentences>

### Consequences
<what this makes easier, harder, or mandatory>
```
