---
paths:
  - "src/tools/engines/**"
  - "src/tools/workers/**"
  - "src/lib/capabilities/**"
---
# Engine rules

- Implement `Engine<Options>` from `src/tools/engines/types.ts`. Options validated with zod. `supports()` probes real capability (`VideoEncoder.isConfigSupported`, `crossOriginIsolated`, WebGPU) — never assume.
- Backend order: WebCodecs/mediabunny → ffmpeg.wasm → canvas/JS → server (server only via the consent gate; Phase 2).
- No `fetch`, `XMLHttpRequest`, `sendBeacon` or WebSocket touching user data. The only network calls allowed are loading our own static WASM/model assets from `/wasm/` or `/models/`. The ffmpeg core is copied there by `scripts/copy-wasm.mjs`; never load it from a CDN.
- Files > ~200 MB go to OPFS; never hold multiple copies of a file in memory. Use transferable `ArrayBuffer`s across the worker boundary.
- Progress must be real (frames/bytes). Honour `AbortSignal` and release memory on cancel.
- Prefer remux (stream copy) whenever codecs are container-compatible; report it to the UI so the page can say "lossless, instant".
- Produce the equivalent `ffmpeg` command string in `EngineResult.ffmpegCommand`.
- Each engine ships an integration test with a fixture file under `tests/fixtures/` that asserts output container, codec and duration.
- Run `pnpm lint:privacy` after edits. Codec, container and pipeline decisions go through the `media-engineer` agent. Failure classes: `unsupported-input`, `unsupported-output`, `resource`, `cancelled`, `internal` (see `README.md#system-design-and-production-principles`).
