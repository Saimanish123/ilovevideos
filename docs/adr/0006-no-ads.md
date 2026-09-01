# ADR-0006: No advertising; revenue via optional Pro tier later

**Status:** Accepted · **Date:** 2026-09-02

## Context
Ads conflict with: cross-origin isolation (ADR-0005), the premium monochrome design, CLS budgets, the privacy promise (ad networks track), and page speed. Competitors that run ads convert server-side and look like it.

## Decision
No ads at launch or in Phase 2. Revenue options, in order of preference when needed: Pro tier (server processing for heavy jobs, larger batch, API, priority support); donations/sponsorship of the open-source engine layer; affiliate links only where editorially honest (e.g. a recommended external tool), disclosed.

## Consequences
Runway must come from elsewhere until Pro exists. Do not design ad slots into any layout.
