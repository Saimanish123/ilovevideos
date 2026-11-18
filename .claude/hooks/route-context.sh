#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit) hook: once per area per session, remind which rules, agent
# or skill apply to the file just edited. Emitted as additionalContext.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$f" ] && exit 0
rel=${f#"$PWD"/}
state=.claude/state/hints-emitted
mkdir -p .claude/state; touch "$state"
emit() {
  grep -qx "$1" "$state" && exit 0
  echo "$1" >> "$state"
  jq -n --arg m "$2" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}'
  exit 0
}
case "$rel" in
  src/components/*|src/app/*|src/styles/*)
    emit ui "UI area edited. Rules: .claude/rules/design-tokens.md (tokens only, grayscale, one primary button, motion tokens). Before declaring done: run the design-reviewer agent on the diff; run the review-animations skill if any motion changed; check 375/768/1280, keyboard path, axe. See README.md#design-principles §2 anti-patterns." ;;
  src/tools/engines/*|src/tools/workers/*|src/lib/capabilities/*)
    emit engine "Engine area edited. Rules: .claude/rules/engines-privacy.md. Use the media-engineer agent for codec/container/pipeline decisions. Each engine needs supports() probing real capability, real progress, AbortSignal handling, an ffmpeg command string and a fixture test under tests/fixtures/. Run pnpm lint:privacy." ;;
  src/tools/registry/*|src/content/*|src/messages/*)
    emit registry "Registry/content edited. Rules: .claude/rules/registry-content.md. Run pnpm lint:copy && pnpm lint:registry. Before declaring done: run the seo-auditor agent. Content must be unique per page, dated for platform limits, brand-free (ADR-0001)." ;;
  src/lib/seo/*|src/app/sitemap.ts|src/app/robots.ts)
    emit seo "SEO surface edited. Policy: README.md#seo-strategy and #appendix-b-technical-seo-research. BreadcrumbList only (plus Organization/WebSite sitewide); no priority/changefreq; honest lastmod. Run the seo-auditor agent before declaring done." ;;
  package.json)
    emit deps "package.json edited. If a dependency was added: consult the pick-ui-library skill, add a row to README.md#tech-stack, and record any licensing or privacy implication in DECISIONS.md." ;;
  README.md|CLAUDE.md|DECISIONS.md|PROGRESS.md|.claude/*)
    emit docs "Handbook or agent config edited. Run pnpm lint:docs. Keep README anchors stable; PROGRESS.md sections Current state / Next up / Roadmap / Session log are required." ;;
esac
exit 0
