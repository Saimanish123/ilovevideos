# ilovevideos: agent guide

Free, no-account, privacy-first online video toolkit. One page per tool, hundreds of pages generated from a registry, processed on the user's device. Premium monochrome UI. `ilovevideos` is a codename (ADR-0001): never hardcode it, use `site.name`.

All project knowledge lives in three files. Read by section, not end to end.

| File | Use it for |
|---|---|
| `README.md` | The handbook. Normative. Sections are anchored: `#architecture`, `#system-design-and-production-principles`, `#tech-stack`, `#design-principles`, `#design-system`, `#tool-page-specification`, `#content-guidelines`, `#seo-strategy`, `#privacy-and-processing`, `#engineering-workflow`, `#feature-catalog`. |
| `DECISIONS.md` | ADR log. Check before proposing anything architectural; append when you decide. |
| `PROGRESS.md` | Current state, next up, roadmap, session log. Injected at session start; updated at session end. |

## Session protocol

1. **Start**: the `SessionStart` hook injects Current state, Next up, the last session entry and the decisions index. Trust it. Do not re-derive decisions.
2. **Work**: follow the routing table below. Run `pnpm check` before claiming anything is done.
3. **End**: use the `handoff` skill (session log entry, refresh Current state and Next up, ADR if a decision was made). The `Stop` hook blocks once per session if source changed and `PROGRESS.md` did not.

## Routing (mandatory, not optional)

Skills and agents are described so that they trigger on their own; hooks add a hint when you touch the matching paths or ask about the matching topic. Treat this table as instructions, not suggestions.

| Situation | Do this |
|---|---|
| Add, finish or change a tool page | Write the flow brief (`README.md#tool-page-specification` §0) first. Delegate to the `tool-builder` agent. Then run the `seo-auditor` agent. |
| Adding a format pair page | Add a `PairSpec` with a real story to `src/tools/registry/tools/pairs.ts`; add a profile to `src/content/formats/` if the format is new. Never hand-write a pair page. |
| Engine, codec, container, worker, OPFS, remux vs transcode, processing performance | Delegate to or consult the `media-engineer` agent. |
| Any change under `src/components/**`, `src/app/**`, `src/styles/**` | Rules in `.claude/rules/design-tokens.md` load automatically. Before declaring done, run the `design-reviewer` agent on the diff. |
| Adding or changing motion (transitions, springs, gestures, hover, enter/exit) | Build with the `animate` skill (and `apple-design` for gestures, sheets, springs). Review with the `review-animations` skill before declaring done. |
| Asked what could animate, or to audit existing motion | `find-animation-opportunities` or `improve-animations` skill. Read-only. |
| Registry or content edits (`src/tools/registry/**`, `src/content/**`, `src/messages/**`) | Rules in `.claude/rules/registry-content.md`. Run `pnpm lint:copy && pnpm lint:registry`. Run the `seo-auditor` agent before declaring done. |
| Sitemap, robots, JSON-LD, metadata | `seo-auditor` agent. Policy: `README.md#seo-strategy`. |
| Adding a dependency | `pick-ui-library` skill first. Add a row to `README.md#tech-stack`. Licensing or privacy implications go in `DECISIONS.md`. |
| Toasts | `ask-sonner` skill. |
| Choosing between architectures, libraries, licences, privacy or SEO postures | Write the ADR in `DECISIONS.md` in the same change. |
| Finishing a task or session | `handoff` skill. |

Subagents cannot spawn subagents: after `tool-builder` returns, the main session runs `design-reviewer` and `seo-auditor` itself.

## Non-negotiables

1. **Design**: `README.md#design-principles` (the anti-pattern table is a hard reject list) and `README.md#design-system` (semantic tokens only; no raw hex, no arbitrary spacing; warm neutral palette with one `accent` slot used in at most three places per screen; `destructive` and the focus ring are the only other hue, ADR-0009).
2. **Copy**: `README.md#content-guidelines`. No exclamation marks, no emoji, no banned marketing words, sentence case. `pnpm lint:copy` enforces it.
3. **Privacy**: `README.md#privacy-and-processing`. No network call touches user data in engines or workers (`pnpm lint:privacy`). No cookies. No third-party scripts.
4. **SEO**: `README.md#seo-strategy` and Appendix B. The tool runs on the landing URL. Unique content per page (`pnpm lint:registry`). BreadcrumbList only; never FAQPage, HowTo or SoftwareApplication. Google ignores sitemap priority and changefreq.
5. **Motion**: easing and duration tokens in `src/styles/tokens.css` are the only curves allowed. Exits shorter than enters. Reduced motion respected.
6. **Flow before code**: `README.md#tool-page-specification` §0. Every tool page starts from the user's job, uses the vocabulary table, gets the right primary control (timeline for time, visual frame for geometry, presets for size), and belongs to a generated family when it is one of many. No page duplicates an existing engine + options; `pnpm lint:registry` rejects it.
7. **Production**: `README.md#system-design-and-production-principles`. Real progress, real numbers, specific failures, nothing heavy before a file is chosen, one source of truth per fact.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 (`@theme` tokens in `src/styles/tokens.css`) · Base UI · motion · next-intl · zod · mediabunny (WebCodecs) + ffmpeg.wasm fallback · Biome · Vitest · Playwright · pnpm. Details and versions: `README.md#tech-stack`.

## Commands

```bash
pnpm dev          # next dev
pnpm check        # typecheck + biome + copy lint + registry validation + privacy lint + docs lint + unit tests
pnpm test:e2e     # playwright (builds first)
pnpm lint:fix     # biome --write
```

## Layout (short form; full tree in `README.md#repository-layout`)

- `src/tools/registry/` schema + `tools/*.ts`. **Adding a tool page = one file here + one line in `tools/index.ts`.** Content lives here, not in messages.
- `src/tools/engines/<engineId>/` one `Engine` per engine (`types.ts`); runs in workers under `src/tools/workers/`.
- `src/app/[locale]/[slug]/page.tsx` the single tool-page route. Do not add per-tool routes.
- `src/components/ui/` primitives on Base UI with our tokens; `src/components/tool/` stage, cards, page shell.
- `src/lib/seo/` JSON-LD helpers; `src/lib/capabilities/` runtime backend selection.
- `.claude/` rules (path-scoped, auto-loaded), agents, skills, hooks, settings.

## Working rules

- Prefer editing the registry or engines over adding routes or components.
- Every engine: `supports()` probes real browser capability; `run()` reports real progress and honours `AbortSignal`; emits the equivalent ffmpeg command; ships a fixture test.
- Every UI change ships for mobile and desktop together: verified at 390 and 1280 with screenshots, works at 768, keyboard operable, zero axe violations, 44px targets, respects reduced motion. Playwright runs Chromium, mobile Chrome and Mobile Safari.
- Do not spawn subagents for research unless asked; web search budget is finite. Delegation per the routing table is expected.
- Report outcomes faithfully: if a check fails, say so with the output.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
