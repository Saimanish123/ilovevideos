---
paths:
  - "src/tools/registry/**"
  - "src/content/**"
  - "src/messages/**"
---
# Registry & content rules

- One file per tool in `src/tools/registry/tools/`, exported and added to `tools/index.ts`. Slug is lowercase-hyphenated, matches the primary query (`compress-video`, `mov-to-mp4`).
- `content.en` must be unique to this page: no paragraph reused from any other tool (CI fails). Minimum 350 body words. Format pairs must explain remux vs transcode, what survives, what is dropped.
- Follow `docs/11-content-guidelines.md`: sentence case, no exclamation marks, no emoji, no banned words, numbers with non-breaking space before units, `×` for dimensions.
- H1 pattern `<Verb> <object>`. `metaTitle` ≤ 60 chars, task first. `metaDescription` ≤ 155.
- Platform limits must carry tier and "checked <YYYY-MM>" text.
- Set `updatedAt` to today's date only when content or behaviour materially changes; never on refactors.
- Never mention the brand name in content (ADR-0001). Never claim "100% secure" or similar.
- Run `pnpm lint:copy && pnpm lint:registry` after edits.
