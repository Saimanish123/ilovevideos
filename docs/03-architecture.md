# Architecture

## 1. Shape

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
        │  picks backend per capabilities:                   │
        │   1. WebCodecs + mediabunny  (fast, HW accel)      │
        │   2. ffmpeg.wasm core-mt     (universal, slower)   │
        │   3. Canvas/WebGPU           (GIF, overlays, STT)  │
        │   4. Server (opt-in only)    (Phase 2)             │
        └────────────────────────────────────────────────────┘
```

Everything above the "runtime" line is static HTML generated at build. Everything below runs on the user's device. There is no application server in Phase 1.

## 2. The registry is the product

`src/tools/registry/schema.ts` defines `ToolDefinition`. Adding a tool page = adding one file to `src/tools/registry/tools/` and one line to its index. From that single object we derive: route, metadata, canonical/hreflang, JSON-LD, H1/subtitle/prose/FAQ, home grid card, category hub entry, footer link, command-palette entry and aliases, related-tool links, sitemap entry, and the stage's accepted file kinds and preset options.

Validation runs in CI (`pnpm lint:registry`): schema, slug uniqueness, no paragraph reused across tools, minimum word count. This is the mechanical guard against thin pages.

Engines live in `src/tools/engines/<engineId>/` and implement the `Engine<Options>` interface (`types.ts`): `optionsSchema`, `supports(backend, input, options)`, `run(...)`. One engine, many tool pages.

## 3. Processing pipeline

1. **Drop** → file(s) accepted by the stage. Files > ~200 MB are written to OPFS immediately so they are not held in memory.
2. **Inspect** → mediabunny reads container/track metadata in a worker (ms). Produces `MediaInfo` shown in the file card and used to choose defaults (e.g. "this MOV can be remuxed losslessly").
3. **Options** → engine's zod schema, pre-filled from the tool's `presetOptions` and the file's `MediaInfo`. Defaults must produce a good result with zero interaction.
4. **Select backend** → `supports()` probes: WebCodecs `isConfigSupported` for the target codec, `crossOriginIsolated` for ffmpeg core-mt, WebGPU for STT. First supported backend in the tool's `backends` list wins. The UI states which path is running.
5. **Run** in a dedicated Worker. Progress is real (frames encoded / total frames; bytes muxed / estimated). `AbortSignal` cancels cleanly and frees memory.
6. **Result** → Blob (or OPFS handle for large outputs) → result card with real before/after numbers → Download (File System Access API `showSaveFilePicker` where available, else `<a download>`). Optional: "Send to another tool" hands the Blob to the next tool page in memory via a session store.
7. **Cleanup** → OPFS scratch is deleted on completion and on page unload.

## 4. Backends

| Backend | Use for | Notes |
|---|---|---|
| **WebCodecs + mediabunny** | remux, trim, merge (compatible streams), compress/resize/fps/codec change (H.264/VP9/AV1/HEVC where supported), extract audio, mute, add audio, crop/rotate/flip via `VideoFrame` → Canvas → encoder, frame extraction, inspect, strip/edit metadata | Hardware encode on most devices. Per-frame memory, so file size is not a memory problem. |
| **ffmpeg.wasm (core-mt)** | legacy containers/codecs, subtitle burn-in with libass, vidstab, delogo, loudnorm, complex filtergraphs, anything WebCodecs lacks | Requires SharedArrayBuffer (COOP/COEP). ~30 MB core, loaded lazily and cached. GPL build → we publish our build config and offer source per licence (ADR-0004). |
| **Canvas / WebGPU / JS** | GIF encoding (gifenc), text/watermark/blur overlays composited per frame, colour adjustments, silence detection, Whisper STT (transformers.js) | Composites feed back into the WebCodecs encoder. |
| **Server** (Phase 2, opt-in) | 4K HEVC encode on weak devices, > 4 GB files on 32-bit WASM, stabilisation on long clips | Explicit consent dialog before any upload; TLS; processed in RAM/tmpfs; deleted ≤ 1 h; no content logs. |

## 5. Frontend structure

```
src/
  app/                    Next.js routes (thin; all content from registry)
    [locale]/             locale layout: fonts, theme, header/footer
      page.tsx            home: hero + category grids
      [slug]/page.tsx     every tool page (static, dynamicParams=false)
      tools/[category]/   category hubs (Phase 1)
    sitemap.ts robots.ts
  components/
    ui/                   Button, Input, Slider, Segmented, Select, Dialog, Sheet, Toast (Base UI + tokens)
    dropzone/ player/     stage building blocks
    tool/                 ToolPage (static shell), ToolStage (client), FileCard, ResultCard, ProgressLine
    layout/               header, footer, theme toggle, command palette
    icons/tools/          custom monoline tool glyphs
  tools/
    registry/             schema, categories, tools/*.ts
    engines/              one folder per engine; each exports an Engine
    workers/              engine runner worker, ffmpeg loader, STT worker
  lib/
    capabilities/ seo/ i18n/ site.ts cn.ts
  styles/                 tokens.css, globals.css
  messages/               en.json (UI strings only; tool prose lives in the registry)
  content/guides/         editorial MDX guides (Phase 2)
```

## 6. Performance budget

| Metric | Budget |
|---|---|
| Tool page HTML | < 60 KB |
| JS on first load (before file drop) | < 90 KB gzipped |
| Engine bundle (lazy) | mediabunny ≈ 100 KB; ffmpeg core ≈ 30 MB (cached, immutable) |
| LCP | < 1.8 s on 4G mid-range Android |
| INP | < 200 ms (all encoding in workers; main thread only renders progress) |
| CLS | 0 |

## 7. Security & privacy mechanics

- COOP `same-origin`, COEP `credentialless`, CORP `same-origin` on WASM assets, strict Permissions-Policy (camera/mic/display-capture self only for recorders).
- No third-party scripts. Analytics proxied first-party and cookieless.
- No cookies at all in Phase 1. Preferences (theme, presets) in `localStorage`.
- Server path (Phase 2): separate origin, separate consent, separate docs.

## 8. Testing strategy

- **Unit** (Vitest): registry invariants, option math (target-size → bitrate), duration/size formatting, capability probing with mocks.
- **Engine integration** (Vitest + Playwright Chromium): fixture media in `tests/fixtures/` (short MP4/MOV/WebM/MKV/GIF/MP3), run each engine end-to-end in a real browser, assert output container/codec/duration via mediabunny inspection.
- **E2E** (Playwright, Chromium + Mobile Safari): every tool page renders, H1 matches registry, JSON-LD valid, zero axe violations, keyboard-only path to Download.
- **Visual** (Playwright screenshots): kitchen-sink `/dev/ui` at 375/768/1280 in light and dark; diffs reviewed in PRs.
- **Lighthouse CI** on a sample of pages per PR with the thresholds in the design principles.
