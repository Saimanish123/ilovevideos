# ADR-0002: Next.js App Router over Astro

**Status:** Accepted · **Date:** 2026-09-02

## Context
Hundreds of static SEO pages, each with a heavy client-side island (the stage). Candidates: Next.js 16, Astro 5 with React islands, React Router 7 framework mode, TanStack Start.

## Decision
Next.js. Reasons: `generateStaticParams` + Metadata API + `sitemap.ts`/`robots.ts` cover the SEO surface natively; `next-intl` gives locale routing with static params; typed routes; `next/font`; custom headers for COOP/COEP; Vercel deploy with zero config. Astro would produce slightly smaller pages but its React-island story for a large stateful workspace (workers, OPFS, zustand) is less mature and the team's velocity is higher in Next.

## Consequences
Keep App Router pages thin and static; hydrate only the stage. Watch bundle size on first load (< 90 KB budget). Revisit if Next.js static export of ~10k pages × locales becomes slow (shard builds or move hubs to on-demand ISR).
