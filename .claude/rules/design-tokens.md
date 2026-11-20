---
paths:
  - "src/components/**"
  - "src/app/**"
  - "src/styles/**"
---
# UI rules

- Warm neutral palette, semantic tokens only (ADR-0009). Tailwind chromatic palettes are disabled in `tokens.css`; do not re-enable or use arbitrary colours (`bg-[#…]`, `text-[oklch…]`). `accent` appears in at most three places per screen (primary action, real progress, one link). Only `destructive` (hover/confirm of delete actions) and the focus ring may otherwise carry hue.
- Semantic tokens only: `bg`, `bg-subtle`, `bg-raised`, `bg-stage`, `fg`, `fg-muted`, `fg-subtle`, `border`, `border-strong`, `accent`, `accent-hover`, `accent-fg`, `ring`. Never `gray-500` directly in components (the `gray-*` ramp is only for controls drawn on the always-dark stage).
- Type scale tokens only: `text-display|h1|h2|h3|body-lg|body|sm|xs`. No arbitrary sizes. Weights 400/500/600 only.
- Radius: `rounded-sm|md|lg|full`. Nothing larger than 12px.
- Spacing on the 4px grid; layout rhythm 24/32/48/64/96/128.
- Elevation: border first; `shadow-2` only for popovers/dialogs. No coloured shadows.
- Exactly one `primary` button per screen state. Buttons are verbs.
- Numbers that change use the `tabular` class.
- Icons: lucide at `strokeWidth={1.5}`, 20px UI / 16px inline / 24px tool glyphs, always labelled.
- Motion: durations `--duration-*`, easings `--ease-out|in-out|drawer` only; exits shorter than enters; `transform`/`opacity`/`clip-path` only; reduced-motion respected; entrance, reveal-once and page-transition motion only within ADR-0153's budgets (once per element, never scroll-linked, CLS 0, LCP unchanged). Run the `review-animations` skill on any motion change.
- Before building a component, check `README.md#design-system` §8 for its spec and the anti-pattern table in `README.md#design-principles` §2.
- Mobile is built alongside desktop, never after. Before declaring a change in these paths done: screenshot at 390 and 1280 (Playwright), check 44px targets and one-handed reach, run the `design-reviewer` agent on the diff, and the `review-animations` skill if motion changed. Build new motion with the `animate` skill.
