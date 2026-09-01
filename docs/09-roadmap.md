# Roadmap

Phases are scoped by *engines*; page count follows from the registry. Dates are targets from 2026-09-02.

## Phase 0 — Foundation (weeks 1–3)

- [x] Docs, design system, tokens, registry schema, Next.js scaffold, CI checks (this commit).
- [ ] Decide product name and domain (ADR-0001). **Launch blocker.**
- [ ] UI kit in `src/components/ui`: Button, Input, Slider, Segmented, Select, Dialog, Sheet, Toast, Tooltip, Progress line; kitchen-sink route `/dev/ui`; visual regression baseline.
- [ ] Stage v1: drop zone → file card → options panel → progress → result card, with a mock engine.
- [ ] Worker runner + capability detection + mediabunny inspector.
- [ ] Format-profile library (30 formats) in `src/content/formats/` used by pair pages.
- [ ] Home, category hubs, tool page shell, footer, command palette (⌘K).

## Phase 1 — Launch set (weeks 4–10): ~20 engines, ~120 pages

Engines: compress, resize, remux, convert-video, video-to-audio, convert-audio, video-to-gif, gif-to-video, trim, split, merge, speed, crop, aspect-ratio, rotate, flip, mute, add-audio, subtitles-add (soft), subtitles-convert, watermark, frame-extract, inspect, strip-metadata. Batch queue on every tool. "Show ffmpeg command."

Pages: core tool pages (~25), compress-for-platform (15), under-N-MB (7), top format pairs (~40 video, ~15 audio), resize-for-platform (~12), subtitle utilities (~8).

Exit criteria: Lighthouse budgets met on every page; E2E green on Chromium + Mobile Safari; registry validation green; privacy checks green; Search Console verified; sitemap submitted.

## Phase 2 — Depth (months 3–6): +15 engines, ~350 pages total

Engines: framerate, codec (HEVC/AV1 where supported), faststart, loop, reverse, remove-silence, pad, volume/normalise, audio-fade, audio-sync, audio-tracks, subtitles-generate (Whisper on-device), subtitles-burn, subtitles-extract, text-overlay, blur-region, color-adjust, filter, image-overlay, thumbnail-grid, edit-metadata, video-to-frames, images-to-video, screen/webcam/audio recorders.

Platform: PWA with share-target and offline; tool chaining; presets; opt-in server fallback (separate origin, consent gate, reaper); first 3–5 locales via translated format profiles; editorial guides (20).

## Phase 3 — Breadth & differentiation (months 6–12): ~500 pages

Engines: stabilise, denoise/sharpen, noise reduction, vocal isolation (spike first), chroma key, PiP, intro/outro, best-frame, compare, repair. More locales (to ~8). Pro tier evaluation (batch on server, API). Consider open-sourcing the engine layer.

## Always

- Quarterly refresh of platform limits and codec-support tables in content.
- Weekly Search Console review; rewrite titles/descriptions for pages with impressions and CTR < 2%.
- Every PR: `pnpm check`, Playwright, Lighthouse CI, design review against `05-design-principles.md` anti-pattern table.
