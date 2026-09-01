# Tool Page Specification

Every tool page is produced from one `ToolDefinition`. This spec fixes the order, behaviour and content rules so that 500 pages feel like one product.

## 1. Anatomy (top to bottom)

1. **Breadcrumb** (visible, small): Home › Category › Tool. `BreadcrumbList` JSON-LD mirrors it.
2. **H1**: `content.title`. `<Verb> <object>`.
3. **Subtitle**: one sentence; what + where it runs.
4. **Stage** (the tool). Idle = drop zone with privacy line. Active = preview + controls + progress + result. Fixed min-height so nothing shifts.
5. **What this does**: 2–3 sentences.
6. **How to use it**: `<ol>` of 3–6 one-sentence steps.
7. **Good to know**: 3–6 paragraphs of specific knowledge. For format pairs, the *remux vs transcode* story, what survives, what is dropped, quality cost. For platform pages, dated limits with a "last checked" date.
8. **Questions**: 4–8 Q/A as visible HTML (`<dl>`). No FAQPage markup dependency.
9. **Related tools**: 6 cards, varied per page (explicit list + same category), never an identical block.
10. **Footer** (global).

The LCP element is the H1/subtitle/stage block: server-rendered text, no hero image.

## 2. Stage behaviour

| State | What the user sees | Primary button |
|---|---|---|
| Idle | Drop zone, accepted formats, privacy line | none (the drop zone is the action) |
| Loading engine | File card appears immediately; thin progress line "Loading encoder (12 MB)…" honest to bytes | disabled `<Verb>` with reason |
| Ready | Preview (first frame, scrubber) + options with good defaults + estimate line ("≈ 3.1 MB, about 40 s") | `<Verb>` |
| Processing | Real progress (frames or bytes), phase label, elapsed, Cancel | Cancel (secondary); primary hidden |
| Done | Result card: before → after, Download, Start over, "Send to another tool" | Download |
| Error | Two-sentence message: what happened, what to do | Try again / Start over |

Rules: URL never changes; no navigation; files never leave memory/OPFS; Cancel frees everything within 1 s; Escape = Cancel while processing.

## 3. Options panel

- Defaults produce a good result with zero interaction.
- Max ~6 controls visible; the rest under "More options" (disclosure, not a modal).
- Each control has a one-line hint in `fg-muted` explaining the trade-off.
- Presets first (segmented control), fine-grained second.
- Numeric inputs beside sliders, tabular figures.

## 4. Content rules

- Unique per page; enforced by `validate-registry` (no shared paragraph, ≥ 350 words).
- No banned words (`lint-copy`).
- Format pairs use the format-profile library for the two formats and add a pair-specific "what actually happens" paragraph.
- Platform pages state limits with tier and date: "Discord: 10 MB (free), 50 MB (Nitro Basic), 500 MB (Nitro). Checked 2026-09."
- Every page links contextually to ≥ 1 sibling tool inside "Good to know".

## 5. Metadata

- `<title>`: `metaTitle · site` (≤ 60). `<meta description>` ≤ 155.
- Canonical self. hreflang in sitemap. OG image generated per tool (monochrome).
- JSON-LD: BreadcrumbList only (plus Organization/WebSite sitewide).

## 6. Definition of done for a new tool page

- [ ] Registry entry validates; `updatedAt` set.
- [ ] Engine has `supports()` probing real capability; `run()` reports real progress; cancellable.
- [ ] Engine integration test with a fixture file passes in Chromium.
- [ ] E2E: renders, H1 correct, zero axe violations, keyboard path to Download.
- [ ] Content reviewed against `11-content-guidelines.md`; specific, true, dated where relevant.
- [ ] Lighthouse budgets met.
- [ ] Design review against anti-pattern table; `review-animations` skill run if motion was added.
