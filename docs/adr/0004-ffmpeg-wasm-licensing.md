# ADR-0004: ffmpeg.wasm as fallback engine; GPL build accepted with compliance

**Status:** Accepted · **Date:** 2026-09-02

## Context
mediabunny/WebCodecs covers the fast path but not legacy codecs, libass burn-in, vidstab, loudnorm, delogo. ffmpeg.wasm's default core is built with `--enable-gpl` (x264/x265). We ship it to browsers (distribution).

## Decision
Use `@ffmpeg/core-mt` GPL build for the fallback engine. Comply: publish our exact build configuration and a link to the corresponding source on the licences page; the engine layer that links to it is itself open-source-compatible (GPL-compatible licence for `src/tools/engines/ffmpeg/**`). Prefer WebCodecs for all H.264/HEVC encoding so x264/x265 are rarely exercised. Evaluate a custom LGPL core (no x264/x265, with libvpx/aom/opus) in Phase 2 if the GPL obligation becomes a problem for a Pro tier.

## Consequences
Licences page is a launch requirement. Engine code layout must keep the ffmpeg-linked module separable.
