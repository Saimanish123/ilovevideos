#!/usr/bin/env bash
# UserPromptSubmit hook: one-line routing hint when the prompt clearly belongs to a domain.
# The routing table in CLAUDE.md is the authority; this only makes it hard to forget.
set -uo pipefail
p=$(jq -r '.prompt // ""' 2>/dev/null | tr '[:upper:]' '[:lower:]')
[ -z "$p" ] && exit 0
m() { printf '%s' "$p" | grep -Eq "$1"; }
h=()
m 'animat|motion|transition|spring|gesture|drag|swipe|sheet' && h+=("motion → animate skill to build, review-animations skill before done")
m '(add|build|create|implement|finish|new) .*(tool|page|converter|compressor)|-to-(mp4|mp3|gif|webm|mov|mkv|wav|aac)' && h+=("tool page → tool-builder agent, then seo-auditor agent")
m 'engine|codec|ffmpeg|webcodecs|mediabunny|remux|transcode|worker|opfs|wasm' && h+=("engine → media-engineer agent; engines-privacy rules; pnpm lint:privacy")
m 'component|button|dialog|slider|input|dropzone|drop zone|stage|layout|design|\bui\b|css|token|style|dark mode|theme' && h+=("UI → design-tokens rules; design-reviewer agent before done")
m '\bseo\b|sitemap|metadata|meta (title|description)|json-ld|structured data|robots|hreflang|canonical' && h+=("SEO → seo-auditor agent")
m 'dependenc|library|package|install |which lib|npm |pnpm add' && h+=("dependency → pick-ui-library skill; add a README tech-stack row")
m 'handoff|hand off|wrap up|end (the |this )?session|done for (today|now)|sign off' && h+=("→ handoff skill")
[ ${#h[@]} -eq 0 ] && exit 0
out=""; for x in "${h[@]}"; do out+="${out:+; }$x"; done
printf 'Routing (CLAUDE.md): %s\n' "$out"
exit 0
