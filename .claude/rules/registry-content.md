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
- `subtitle`: one plain sentence, about 60 characters, ≤ 80 (schema); no jargon, no privacy line (ADR-0149). H1 pattern `<Verb> <object>`. `metaTitle` ≤ 60 chars, task first. `metaDescription` ≤ 155.
- Platform limits carry their tier and a linked source; the check date stays in `src/content/platforms` data, never on the page (ADR-0149).
- Set `updatedAt` to today's date only when content or behaviour materially changes; never on refactors.
- Never mention the brand name in content (ADR-0001). Never claim "100% secure" or similar.
- Run `pnpm lint:copy && pnpm lint:registry` after edits.
- Before declaring a change in these paths done: run the `seo-auditor` agent. Building a whole tool page belongs to the `tool-builder` agent.
- Pages carry no evidence: measurements, test fixtures and check dates live in DECISIONS.md, tests and data files; pages state what the tool does and its limits in plain words. No privacy reassurance outside `/privacy`, `/about` and the home promises; no engine or library names in prose (credit on `/licences`). `pnpm lint:copy` enforces these (ADR-0149).
