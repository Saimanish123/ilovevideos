# Tech Stack

Decisions here are final for Phase 1. Alternatives considered are recorded in `docs/adr/`. Versions checked against the npm registry on 2026-09-02.

## Summary

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | **Next.js** (App Router) | 16.3 | Static pre-rendering of hundreds of pages, Metadata API, `sitemap.ts`/`robots.ts`, typed routes, `next/font`, first-class Vercel deploy, custom headers for COOP/COEP. Astro was the runner-up (ADR-0002). |
| UI | **React** | 19.2 | Ecosystem for the primitives we chose. |
| Language | **TypeScript** strict | 5.9 | `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. |
| Styling | **Tailwind CSS v4** with `@theme` tokens | 4.3 | Tokens in CSS, no config file, `initial` resets used to *delete* the chromatic palette so hue cannot leak in. |
| Primitives | **Base UI** (`@base-ui/react`) | 1.7 | Unstyled, accessible, exposes `--transform-origin` for anchored motion. Not shadcn defaults. |
| Motion | **motion** (`motion/react`) + CSS transitions | 13.x | Springs, layout, gestures where CSS cannot. Rules in `.claude/skills/animate`. |
| Icons | **lucide-react** at stroke 1.5 + custom tool glyphs | 1.39 | One weight, one style. |
| Fonts | **Geist Sans / Geist Mono** via `geist` package | 1.7 | Neutral grotesque with tabular figures and optical sizing; self-hosted; no layout shift. |
| Theme | **next-themes** (`data-theme`) | 0.4 | No flash; system default. |
| i18n | **next-intl** | 4.14 | Locale routing `as-needed` (English has no prefix), `hreflang` via `alternates`, static params per locale. |
| Validation | **zod** | 4.5 | Registry schema, engine options. |
| Structured data | **schema-dts** | 2.0 | Typed JSON-LD. |
| State | **zustand** | 5.x | Job queue / batch state on the client. |
| Media engine 1 | **mediabunny** | 1.55 | WebCodecs-based read/write/convert for MP4, WebM, MKV, MOV, MP3, WAV, OGG, etc. MPL-2.0. Fastest path; hardware encode via browser. |
| Media engine 2 | **@ffmpeg/ffmpeg** with `core-mt` | 0.12.x | Universal fallback: legacy formats (WMV, FLV, RMVB…), filters (vidstab, delogo, loudnorm), codecs the browser cannot encode. Needs SharedArrayBuffer → COOP/COEP. Default core is GPL (x264/x265); ship the GPL build and comply, or build an LGPL core without x264 for the default path (ADR-0004). |
| GIF | **gifenc** | 1.0 | Fast palette quantisation; ffmpeg `palettegen` path for "best quality". |
| Speech-to-text | **@huggingface/transformers** (Whisper, WebGPU/WASM) | 4.x | On-device captions. Model downloaded on demand, cached in browser. |
| Large files | **OPFS** | native | Sync access handles in workers; avoids holding multi-GB files in memory. |
| Lint/format | **Biome** | 2.5 | Single tool, fast, a11y rules on. No ESLint/Prettier. |
| Unit tests | **Vitest** | 4.x | Registry, pure helpers, engine option math. |
| E2E | **Playwright** + axe | 1.62 | Every tool page: renders, JSON-LD present, zero axe violations, keyboard path. Real media processing E2E on Chromium with fixture files. |
| Package manager | **pnpm** | 11 | |
| Hosting | **Vercel** (static + edge headers) | | Static output for all tool pages; ISR unnecessary. Cloudflare Pages is the fallback if Vercel bandwidth cost grows; both allow custom headers. |
| Analytics | **Plausible** or **Umami** (self-hosted), cookieless, proxied first-party | | No consent banner needed. Also compatible with COEP if served from our origin. |
| Server fallback | **Fly.io** or **Hetzner** VPS running ffmpeg behind a tiny API, or Cloudflare Containers | | Only if/when opted in (Phase 2). Auto-delete ≤ 1 h. Never Vercel functions (bundle/time limits). |

## Browser support policy

- **Tier 1** (full WebCodecs path): Chrome/Edge 110+, Safari 17.4+ (desktop and iOS), Firefox 130+ desktop.
- **Tier 2** (ffmpeg.wasm path only, slower): Firefox for Android, older Safari.
- **Unsupported**: anything without WebAssembly. We show a plain message, never a broken tool.
- Capability detection at runtime (`src/lib/capabilities`) picks the backend per tool per session and tells the user which path is in use.

## Key constraints the stack imposes

1. **COOP/COEP on every page** for `SharedArrayBuffer`. `Cross-Origin-Embedder-Policy: credentialless` is used so cross-origin images/fonts still load; any script or iframe from a third party must send CORP or it is blocked. This rules out most ad networks and third-party embeds, which we do not want anyway (ADR-0005/0006).
2. **WASM memory**: 32-bit ffmpeg.wasm tops out at ~2–4 GB addressable; very large inputs stream through OPFS and are processed in chunks, or fall back to WebCodecs where memory is per-frame.
3. **Static build size**: hundreds of pages × locales is fine; JSON-LD and prose come from the registry at build time. Heavy engine bundles are code-split and loaded only after a file is dropped.
4. **Fonts**: one family, subset, `display: swap` with size-adjusted fallback to avoid CLS.
