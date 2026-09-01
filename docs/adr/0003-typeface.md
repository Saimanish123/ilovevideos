# ADR-0003: Geist Sans + Geist Mono, single family

**Status:** Accepted · **Date:** 2026-09-02

## Context
Monochrome UI puts all hierarchy on type. Needs tabular figures, optical sizing, tight display tracking, self-hosting, permissive licence.

## Decision
Geist (SIL OFL) via the `geist` package. Inter with `cv11/ss01` was the alternative; Geist has better default forms at display sizes and avoids the "default Inter" look. One family; mono only for ffmpeg command display.

## Consequences
`--font-geist-sans`/`--font-geist-mono` CSS variables set on `<html>`; tokens reference them. If Geist ever underperforms in a locale's script, add a per-locale fallback stack, not a second display family.
