# ilovevideos — agent guide

Free, no-account, privacy-first online video toolkit. One page per tool, hundreds of pages, generated from a registry, processed on the user's device. Premium monochrome UI. Read `docs/README.md` for the index; the documents below are normative.

## Non-negotiables

1. **Design**: `docs/05-design-principles.md` (anti-pattern table is a hard reject list) and `docs/06-design-system.md` (tokens only; no raw hex, no arbitrary spacing, no hue except `destructive` and focus ring).
2. **Copy**: `docs/11-content-guidelines.md`. No exclamation marks, no emoji, no banned marketing words. Sentence case. `pnpm lint:copy` enforces it.
3. **Privacy**: `docs/08-privacy-and-processing.md`. No `fetch` of user data in engines/workers. No cookies. No third-party scripts.
4. **SEO**: `docs/07-seo-strategy.md` + `docs/research/02-seo-technical-research.md`. The tool runs on the landing URL. Unique content per page (`pnpm lint:registry`). No FAQPage/HowTo/SoftwareApplication JSON-LD; BreadcrumbList only. Google ignores sitemap priority/changefreq.
5. **Motion**: use the imported skills in `.claude/skills/` (`animate`, `review-animations`, `apple-design`). Easing tokens in `src/styles/tokens.css` are the only curves allowed.

## Stack (see docs/04-tech-stack.md)

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 (`@theme` tokens in `src/styles/tokens.css`) · Base UI · motion · next-intl · zod · mediabunny (WebCodecs) + ffmpeg.wasm fallback · Biome · Vitest · Playwright · pnpm.

## Commands

```bash
pnpm dev             # next dev
pnpm check           # typecheck + biome + copy lint + registry validation + unit tests
pnpm test:e2e        # playwright (builds first)
pnpm lint:fix        # biome --write
```

Run `pnpm check` before declaring any task done.

## Layout

- `src/tools/registry/` — schema + `tools/*.ts`. **Adding a tool page = one file here + one line in `tools/index.ts`.** Content lives here, not in messages.
- `src/tools/engines/<engineId>/` — one `Engine` implementation per engine (`types.ts`). Runs in workers under `src/tools/workers/`.
- `src/app/[locale]/[slug]/page.tsx` — the single tool-page route. Do not add per-tool routes.
- `src/components/ui/` — primitives on Base UI with our tokens. `src/components/tool/` — stage, cards, page shell.
- `src/lib/seo/` — JSON-LD helpers. `src/lib/capabilities/` — runtime backend selection.
- `docs/` — all plans and decisions; ADRs in `docs/adr/`.

## Working rules

- Prefer editing the registry/engines over adding routes or components.
- Every engine: `supports()` probes real browser capability; `run()` reports real progress and honours `AbortSignal`.
- Every UI change: works at 375/768/1280, keyboard operable, zero axe violations, respects reduced motion.
- New dependencies need a line in `docs/04-tech-stack.md` and a check with the `pick-ui-library` skill.
- Decisions that change architecture, licensing, privacy or SEO posture get an ADR.
- Do not spawn subagents for research without being asked; web search budget is finite.
- Product name is a codename (ADR-0001): never hardcode "ilovevideos" in UI or content; use `site.name`.
