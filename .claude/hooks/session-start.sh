#!/usr/bin/env bash
# SessionStart hook: mark the session start and inject project memory into context.
# stdout is added to the agent's context. Keep it short: PROGRESS.md sections are written to be brief.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
mkdir -p .claude/state
date +%s > .claude/state/session-started
: > .claude/state/hints-emitted
src=$(jq -r '.source // "startup"' 2>/dev/null || echo startup)

section() { awk -v h="## $1" '$0==h{f=1;next} /^## /{f=0} f' PROGRESS.md | sed '/^$/N;/^\n$/D'; }
last_log() { awk '/^## Session log/{f=1;next} f&&/^### /{c++} c==2{exit} f&&c==1' PROGRESS.md | sed '/^$/N;/^\n$/D'; }

echo "## Project memory (auto-injected by .claude/hooks/session-start.sh, source: $src)"
echo "Do not re-derive anything below. Full detail: PROGRESS.md, DECISIONS.md, README.md by section anchor. Before finishing, follow the handoff protocol in .claude/skills/handoff/SKILL.md; the stop gate enforces it."
echo
echo "### Current state (PROGRESS.md)"; section "Current state"
echo; echo "### Next up (PROGRESS.md)"; section "Next up"
echo; echo "### Last session"; last_log
echo
echo "### Decisions (DECISIONS.md)"
grep -E '^\| ADR-' DECISIONS.md | sed -E 's/^\| (ADR-[0-9]+) \| (.*) \| (.*) \| .* \|$/- \1: \2 [\3]/'
echo
echo "### Git"
git log --oneline -3 2>/dev/null
changes=$(git status --short 2>/dev/null | head -15)
[ -n "$changes" ] && { echo "Uncommitted:"; echo "$changes"; } || echo "Working tree clean."
exit 0
