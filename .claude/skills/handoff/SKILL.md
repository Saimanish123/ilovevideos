---
name: handoff
description: End-of-session handoff for this repo. Updates PROGRESS.md (session log entry, Current state, Next up) and appends any decision to DECISIONS.md so the next session starts with full context. Use when finishing a task or session, when the user says done, wrap up, hand off or sign off, or when the stop gate asks for it.
---

# Handoff

Persist what this session learned so the next one does not re-derive it. Takes two minutes. Do it after `pnpm check` passes, before the final message.

## Steps

1. **Session log entry** in `PROGRESS.md` under `## Session log`, newest first, heading `### YYYY-MM-DD: <short title>`. Four bullets, under 12 lines total:
   - `Changed:` what was added, removed or modified, by area (files or modules, not every path).
   - `Verified:` exactly what was run and its result (`pnpm check` green, which Playwright spec, manual checks at which widths). If something was not verified, say so.
   - `Decisions:` ADR ids added or changed this session, or `none`.
   - `Next:` the one to three concrete things the next session should do first, including anything left half-done.
   If a session log entry for today with the same title already exists, extend it rather than adding a second.
2. **Current state**: edit the bullets so they describe the repo as it is now. Remove bullets that are no longer true. Keep it under about 15 bullets.
3. **Next up**: reorder, remove finished items, add newly discovered work. Numbered, most important first.
4. **Open questions**: add anything that needs a human decision; remove what was answered (and record the answer in `DECISIONS.md` if it was a decision).
5. **Roadmap**: tick checkboxes that are done. Do not restructure phases here; that is a decision.
6. **DECISIONS.md**: if this session chose between real alternatives on architecture, licensing, privacy, SEO or process, append an ADR using the template at the bottom of the file and add an index row. Reference the ADR id in the session log.
7. Run `pnpm lint:docs`. Fix anything it reports.

## Rules

- Facts only. Do not record intentions as if they were done.
- Dates are absolute (`2026-09-02`), never "today" or "yesterday".
- No secrets, no personal data, no file contents from user media.
- The stop gate blocks the session once if source changed and `PROGRESS.md` did not. Doing this proactively avoids that.
