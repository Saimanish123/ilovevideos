#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit) hook: format the edited file with Biome.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$f" in
  *.ts|*.tsx|*.js|*.mjs|*.json|*.css) ./node_modules/.bin/biome check --write "$f" >/dev/null 2>&1 || true ;;
esac
exit 0
