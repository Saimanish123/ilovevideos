## What and why

<!-- One paragraph. Link the ADR id if this implements a decision. -->

## Checklist (README.md#engineering-workflow)

- [ ] `pnpm check` passes locally
- [ ] Relevant Playwright spec passes when UI or a tool page changed
- [ ] UI: 375/768/1280, keyboard operable, zero axe violations, reduced motion; reviewed against the anti-pattern table; `review-animations` run if motion changed
- [ ] Engine: `supports()` probes real capability, real progress, `AbortSignal`, ffmpeg command string, fixture test
- [ ] Content: unique per page, brand-free, dated platform limits, `pnpm lint:copy && pnpm lint:registry` green
- [ ] New dependency: row in `README.md#tech-stack`, `pick-ui-library` consulted
- [ ] Decision made: entry appended to `DECISIONS.md`
- [ ] `PROGRESS.md` updated (current state, next up, session log)
