---
paths:
  - "src/components/**"
  - "src/app/**"
  - "src/styles/**"
---
# UI rules

- Grayscale only. Tailwind chromatic palettes are disabled in `tokens.css`; do not re-enable or use arbitrary colours (`bg-[#…]`, `text-[oklch…]`). Only `destructive` (hover/confirm of delete actions) and the focus ring may carry hue.
- Semantic tokens only: `bg`, `bg-subtle`, `bg-raised`, `bg-stage`, `fg`, `fg-muted`, `fg-subtle`, `border`, `border-strong`, `accent`, `accent-fg`, `ring`. Never `gray-500` directly in components.
- Type scale tokens only: `text-display|h1|h2|h3|body-lg|body|sm|xs`. No arbitrary sizes. Weights 400/500/600 only.
- Radius: `rounded-sm|md|lg|full`. Nothing larger than 12px.
- Spacing on the 4px grid; layout rhythm 24/32/48/64/96/128.
- Elevation: border first; `shadow-2` only for popovers/dialogs. No coloured shadows.
- Exactly one `primary` button per screen state. Buttons are verbs.
- Numbers that change use the `tabular` class.
- Icons: lucide at `strokeWidth={1.5}`, 20px UI / 16px inline / 24px tool glyphs, always labelled.
- Motion: durations `--duration-*`, easings `--ease-out|in-out|drawer` only; exits shorter than enters; `transform`/`opacity`/`clip-path` only; reduced-motion respected; nothing animates on scroll or page load except the stage fade. Run the `review-animations` skill on any motion change.
- Before building a component, check `docs/06-design-system.md` §8 for its spec and the anti-pattern table in `docs/05-design-principles.md` §2.
