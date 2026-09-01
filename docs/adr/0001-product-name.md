# ADR-0001: Product name is undecided; "ilovevideos" is a codename

**Status:** Open (launch blocker) · **Date:** 2026-09-02

## Context
"ilovevideos" echoes iLovePDF/iLoveIMG (iLovePDF S.L.). ilovevideo.dev, .fun, .ai and ilovevideoeditor.com already exist; ilovevideo.dev is the same concept. Brand searches are not our acquisition channel; task searches are.

## Decision
Use `ilovevideos` as the repo/codename only. All brand strings come from `site.name` (`NEXT_PUBLIC_SITE_NAME`). Choose a distinctive, ownable name with an available .com before launch. Candidate criteria: two syllables, pronounceable, no "video" trademark collisions, works as a wordmark in a neutral grotesque.

## Consequences
No hardcoded brand text in components or content. Registry content must not mention the brand by name.
