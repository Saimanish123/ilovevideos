---
paths:
  - "src/tools/registry/**"
  - "src/content/**"
  - "src/messages/**"
---
# Registry & content rules

- Start from the flow brief (`README.md#tool-page-specification` §0) and the vocabulary table; a page with the wrong name or the wrong primary control is rejected in review. Format pairs are generated from `src/content/formats/` + `tools/pairs.ts`, never hand-written. A new page reuses an existing engine with `presetOptions` (and `content.action` for the button label) unless the processing genuinely differs; never add an engine for a different default. One file per tool in `src/tools/registry/tools/`, exported and added to `tools/index.ts`. Slug is lowercase-hyphenated, matches the primary query (`compress-video`, `mov-to-mp4`).
- `content.en` must be unique to this page: no paragraph reused from any other tool (CI fails). Minimum 350 body words. Format pairs must explain remux vs transcode, what survives, what is dropped.
- Follow `README.md#content-guidelines`: sentence case, no exclamation marks, no emoji, no banned words, numbers with non-breaking space before units, `×` for dimensions.
- `subtitle` ≤ 100 characters: it is clamped to two lines on the tool card. H1 pattern `<Verb> <object>`. `metaTitle` ≤ 60 chars, task first. `metaDescription` ≤ 155.
- Platform limits must carry tier and "checked <YYYY-MM>" text.
- Set `updatedAt` to today's date only when content or behaviour materially changes; never on refactors.
- Never mention the brand name in content (ADR-0001). Never claim "100% secure" or similar.
- Run `pnpm lint:copy && pnpm lint:registry` after edits.
- Before declaring a change in these paths done: run the `seo-auditor` agent. Building a whole tool page belongs to the `tool-builder` agent.
