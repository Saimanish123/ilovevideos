#!/usr/bin/env bash
# Stop hook: if source changed during this session and PROGRESS.md was not touched, block once
# and ask for the handoff. stop_hook_active guards against loops.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
active=$(jq -r '.stop_hook_active // false' 2>/dev/null)
[ "$active" = "true" ] && exit 0
marker=.claude/state/session-started
[ -f "$marker" ] || exit 0
[ PROGRESS.md -nt "$marker" ] && exit 0
changed=$(find src scripts tests .github .claude/agents .claude/rules .claude/skills .claude/hooks .claude/settings.json \
  package.json next.config.ts biome.json tsconfig.json playwright.config.ts vitest.config.ts \
  CLAUDE.md README.md DECISIONS.md -type f -newer "$marker" 2>/dev/null | head -5 | tr '\n' ' ')
[ -z "$changed" ] && exit 0
jq -n --arg c "$changed" '{decision:"block", reason:("Files changed this session (" + $c + "...) but PROGRESS.md was not updated. Do the handoff now, following .claude/skills/handoff/SKILL.md: (1) add a session log entry to PROGRESS.md (what changed, how verified, decisions, next); (2) refresh Current state and Next up; (3) append a DECISIONS.md entry if an architecture, licensing, privacy, SEO or process decision was made; (4) run pnpm lint:docs. Then finish.")}'
exit 0
