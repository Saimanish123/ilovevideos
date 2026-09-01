# Design System

Concrete tokens and component rules that implement `05-design-principles.md`. Tokens live in code at `src/styles/tokens.css` (Tailwind v4 `@theme`). This document is the source of truth; code mirrors it.

---

## 1. Color

Grayscale only. Two themes (light, dark). Every value below is a neutral with **zero chroma**. Do not use Tailwind's `slate`/`zinc`/`stone` (they carry hue). Use our `gray` ramp.

### 1.1 Gray ramp (OKLCH, chroma = 0)

| Token | L (light) | Hex approx | Use |
|---|---|---|---|
| `gray-0` | 100% | `#ffffff` | Page background (light) |
| `gray-50` | 98.5% | `#fafafa` | Subtle surface, hover on white |
| `gray-100` | 96.5% | `#f4f4f4` | Raised surface, input background |
| `gray-200` | 92% | `#e6e6e6` | Borders, dividers |
| `gray-300` | 86% | `#d4d4d4` | Strong borders, disabled fill |
| `gray-400` | 70% | `#a3a3a3` | Placeholder, disabled text (decorative only, fails AA) |
| `gray-500` | 56% | `#737373` | Secondary text on white (4.6:1 ✓) |
| `gray-600` | 46% | `#575757` | Tertiary emphasis |
| `gray-700` | 36% | `#3f3f3f` | Body text, softer |
| `gray-800` | 26% | `#262626` | Body text |
| `gray-900` | 15% | `#171717` | Headlines, primary button |
| `gray-950` | 8% | `#0a0a0a` | Near-black, dark page background |
| `gray-1000` | 0% | `#000000` | True black (used sparingly: dark theme headlines, video stage) |

### 1.2 Semantic aliases

Components reference **semantic** tokens only, never ramp steps.

| Semantic | Light | Dark |
|---|---|---|
| `bg` | gray-0 | gray-950 |
| `bg-subtle` | gray-50 | gray-900 |
| `bg-raised` | gray-100 | gray-800 |
| `bg-stage` | gray-950 | gray-1000 | (video preview stage is always dark) |
| `fg` | gray-900 | gray-50 |
| `fg-muted` | gray-500 | gray-400 |
| `fg-subtle` | gray-400 | gray-500 | (decorative only) |
| `border` | gray-200 | gray-800 |
| `border-strong` | gray-300 | gray-700 |
| `accent` | gray-900 | gray-50 | (primary button fill; "accent" is just max contrast) |
| `accent-fg` | gray-0 | gray-950 |
| `ring` | gray-900 | gray-50 |
| `destructive` | oklch(55% 0.16 25) | oklch(70% 0.14 25) | only on hover/confirm of destructive actions |
| `overlay` | rgb(0 0 0 / 0.4) | rgb(0 0 0 / 0.6) | scrim behind dialogs |

Rules:
- `destructive` is the only chromatic token. It may not be used for anything except "delete/remove/discard" affordances, and only on hover or in the confirm step.
- Success and error are communicated with icons + copy + motion, never color.
- Never use opacity on text to make it muted. Use `fg-muted`. (Opacity on text breaks contrast on non-white backgrounds.)

### 1.3 Theme switching

- `prefers-color-scheme` by default; a manual toggle stores preference in `localStorage`.
- Both themes must pass the same contrast tests. Dark theme is not an afterthought: the video stage is dark in both themes, so most users see dark surfaces regardless.

---

## 2. Typography

### 2.1 Families

| Role | Font | Fallback | Notes |
|---|---|---|---|
| UI + prose | **Geist** (variable) or **Inter** (variable, with `ss01`, `cv11`, tabular nums enabled) | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif` | Self-hosted via `next/font`. One family only. Decision recorded in ADR-0003. |
| Numeric/technical | same family, `font-variant-numeric: tabular-nums` | | Durations, sizes, timestamps, progress |
| Mono | **Geist Mono** or system mono | `ui-monospace, "SF Mono", Menlo, monospace` | Code snippets in docs/FAQ only; ffmpeg command display |

Default OpenType features: `"cv11", "ss01", "ss03"` for Inter (single-storey a, open digits); tabular numbers on all numeric UI.

### 2.2 Scale (rem, fluid where noted)

| Token | Size | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `text-display` | clamp(2.5rem, 2rem + 2.5vw, 4.5rem) | 1.0 | -0.03em | 600 | Home hero only |
| `text-h1` | clamp(2rem, 1.6rem + 1.5vw, 3rem) | 1.1 | -0.025em | 600 | Tool page title |
| `text-h2` | 1.5rem | 1.2 | -0.02em | 600 | Section heading |
| `text-h3` | 1.125rem | 1.35 | -0.01em | 600 | Card / group heading |
| `text-body-lg` | 1.125rem | 1.6 | 0 | 400 | Lead paragraphs |
| `text-body` | 1rem | 1.6 | 0 | 400 | Prose, descriptions |
| `text-sm` | 0.875rem | 1.5 | 0 | 400/500 | UI labels, controls, meta |
| `text-xs` | 0.75rem | 1.4 | 0.01em | 500 | Captions, badges, timestamps |

Weights available: 400, 500, 600. Never 700+ (too heavy for the grotesque at display sizes), never 300 (fails contrast at small sizes).

### 2.3 Prose

- Max width `65ch` for body; `75ch` for FAQ answers.
- Paragraph spacing: `1em` margin, no first-line indent.
- Links in prose: underlined with `text-decoration-thickness: 1px`, `text-underline-offset: 3px`, same color as text; on hover, the underline color moves to `fg-muted`. Never blue.

---

## 3. Spacing & layout

- Base unit: 4px. Scale: `1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64, 20=80, 24=96, 32=128`.
- Page max width: `1200px` content, `1440px` for the tool stage on very wide screens.
- Gutters: 16px mobile, 24px tablet, 32px+ desktop.
- Section vertical rhythm: 64px mobile, 96px desktop, 128px between major home sections.
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.

---

## 4. Shape

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4px | Checkboxes, small chips, code |
| `radius-md` | 8px | Buttons, inputs, menus |
| `radius-lg` | 12px | Cards, dialogs, drop zone |
| `radius-full` | 9999px | Pills, avatar-less status dots |

Nothing larger than 12px. The video stage itself uses `radius-lg` and clips the video.

Borders: `1px solid border`. No `2px` borders except the focus ring. No dashed borders except the idle drop zone (1px dashed `border-strong`).

---

## 5. Elevation

Three levels only:

| Level | Treatment | Use |
|---|---|---|
| 0 | none | Almost everything |
| 1 | `1px solid border` | Cards, inputs, tool cards |
| 2 | `0 0 0 1px border, 0 8px 24px -8px rgb(0 0 0 / 0.12)` (light) / `0 0 0 1px border, 0 8px 24px -8px rgb(0 0 0 / 0.6)` (dark) | Popovers, dropdowns, dialogs |

No colored shadows. No `shadow-xl`. No inner shadows except the pressed state of a primary button (`inset 0 1px 0 rgb(255 255 255 / 0.08)` in dark).

---

## 6. Motion

### 6.1 Durations

| Token | ms | Use |
|---|---|---|
| `dur-instant` | 80 | Hover background, pressed states |
| `dur-fast` | 150 | Exit of small elements, toggles |
| `dur-base` | 220 | Enter of small elements, most transitions |
| `dur-slow` | 320 | Dialog/sheet enter, stage transitions |
| `dur-slower` | 480 | Only for large layout transitions (drop zone → workspace) |

### 6.2 Easings

These are the exact values used throughout the imported animation skills (`.claude/skills/animate`, `review-animations`, `apple-design`). Never hand-roll a different bezier.

| Token | Curve | Use |
|---|---|---|
| `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything entering **or leaving** (exits use the same curve, shorter duration) |
| `ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Anything moving that stays on screen |
| `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets and drawers (iOS curve) |
| `ease` (CSS default) | `ease` | Hover colour/background changes only |
| `linear` | `linear` | Progress fills and anything tied to real progress; never for movement |
| `spring` | Motion: `{ type: "spring", duration: 0.5, bounce: 0.2 }` (Apple form). Bounce 0 except when a gesture carried momentum. | Drag, sheet gestures, layout shifts |

`ease-in` is never used on UI.

### 6.3 Rules

- Animate `transform` and `opacity`; `clip-path` is the sanctioned third. Animating `height` is tolerated only for accordions. Never `transition: all`.
- Every pressable has `:active { transform: scale(0.97) }` at 100–160ms. Nothing enters from `scale(0)`; start at 0.95–0.97 with opacity 0.
- Popovers/menus/tooltips set `transform-origin` to their anchor. Dialogs stay centred.
- Keyboard-initiated actions do not animate. Actions performed 100+ times a day (scrubbing, play/pause) do not animate: 1:1 pointer tracking only.
- Exit is always faster than enter.
- Stagger children at 20–30ms, capped at 6 items. Beyond that, animate as a group.
- `prefers-reduced-motion: reduce`: movement collapses to opacity fades at `dur-fast`; nothing translates or scales. Hover effects are gated behind `@media (hover: hover) and (pointer: fine)`.
- Never animate on scroll into view.
- Never animate on initial page load except the tool stage's single fade (opacity 0→1, `dur-base`).

### 6.4 Signature moments (the only "delight" we allow, each tied to a real event)

1. **File accepted**: the dashed drop zone border becomes solid and the zone scales 1.0→0.98→1.0 (`spring`) as the file card slides in. Communicates "I have it".
2. **Processing**: a thin 2px progress line at the top of the stage, honest to real progress. Frame count ticks in tabular figures.
3. **Done**: the progress line completes, the output card fades in, the check icon draws its path (SVG stroke-dashoffset, 300ms). The primary button becomes "Download".
4. **Download started**: the button's label swaps to "Saved" with a small vertical text slide, then back after 1.5s.

That is the whole list. Add to it only via a design review.

---

## 7. Iconography

- **Lucide** icons, 20px in UI and 16px inline, `stroke-width: 1.5`. One weight, one style.
- Icons are always paired with a label or an `aria-label`.
- Tool icons on the home grid are custom: 24px, 1.5 stroke, monoline, drawn on the same grid, stored in `src/components/icons/tools/`. They depict the operation (a film strip being cut, two frames merging), never a generic "video" glyph repeated 200 times.
- No filled icons except the state check/x inside a `radius-full` badge.

---

## 8. Components

Built on **Base UI** (`@base-ui/react`, unstyled, accessible primitives from the Radix/MUI team) with our own styling. We do not use shadcn/ui defaults. Component source lives in `src/components/ui/`.

### 8.1 Button

| Variant | Fill | Text | Border | Hover | Pressed |
|---|---|---|---|---|---|
| `primary` | `accent` | `accent-fg` | none | fill → gray-800 (light) / gray-200 (dark) | scale 0.98 |
| `secondary` | `bg` | `fg` | `border` | fill → `bg-subtle` | scale 0.98 |
| `ghost` | transparent | `fg` | none | fill → `bg-subtle` | scale 0.98 |
| `destructive` | as `secondary` | `fg` | `border` | text & border → `destructive` | scale 0.98 |

Sizes: `sm` 32px, `md` 40px, `lg` 48px (primary action on tool pages). Height fixed; padding `0 12/16/20px`. Radius `md`. Label `text-sm` 500 for sm/md, `text-body` 500 for lg. Loading state: label stays, a 16px spinner replaces the leading icon, button width does not change (min-width lock).

Exactly one `primary` button visible per screen state.

### 8.2 Drop zone (idle stage)

- Full-width, min-height 320px (desktop) / 240px (mobile). `radius-lg`, 1px dashed `border-strong`, `bg-subtle`.
- Content: 24px upload icon, one line "Drop a video here or **choose a file**" (choose is the real `<label>` for a hidden input), one `text-sm fg-muted` line listing accepted formats and "Files stay on your device."
- Drag-over: border becomes solid `fg`, background `bg-raised`, `dur-instant`.
- Also accepts paste (Cmd/Ctrl+V of a file) and a "From URL" secondary action where legally sensible.

### 8.3 Stage (active)

- Left/top: video preview in a `bg-stage` container, `radius-lg`, aspect ratio of the source, letterboxed. Custom minimal controls (play/pause, scrubber, time in tabular nums, mute). Native controls hidden.
- Right/bottom: control panel, max width 360px on desktop. Groups separated by 24px, labelled with `text-xs` uppercase-free labels (we do not uppercase; we use weight 500 + `fg-muted`).
- Sticky footer on mobile with the primary button.

### 8.4 Inputs

- Height 40px, `radius-md`, `bg-raised`, 1px `border`, `text-sm`. Focus: 2px `ring` offset 2px, border stays.
- Sliders: 4px track `border-strong`, 16px thumb `fg` with 1px `bg` ring; value in a tabular numeric input to the right.
- Segmented control (for presets like 720p / 1080p / Original): pill container `bg-raised`, selected segment `bg` with elevation 1 and a Motion `layoutId` sliding highlight.
- Select: Base UI Select, menu elevation 2, items 36px.

### 8.5 File card

Appears after a file is accepted. Row: 40px thumbnail (first frame), filename (truncate middle, not end, so extensions stay visible), `fg-muted` meta line "12.4 MB · 1920×1080 · 0:42 · H.264", ghost "Remove" button.

### 8.6 Result card

Same shape as the file card. Adds an inline "before → after" line: "12.4 MB → 3.1 MB (−75%)" with tabular figures. Primary button "Download". Secondary "Start over". Tertiary link "Try another tool" that reveals related tools.

### 8.7 Tool card (home grid, category pages)

`radius-lg`, elevation 1, 20px padding. Custom 24px icon top-left, `text-h3` title, one `text-sm fg-muted` line. Hover: border → `border-strong`, `dur-instant`. No arrow icon, no "Learn more". The whole card is the link.

### 8.8 Dialog / Sheet

- Desktop: Dialog, max-width 480px, elevation 2, `radius-lg`, scale 0.96→1 + opacity, `dur-slow` `ease-out`; exit `dur-fast`.
- Mobile: bottom Sheet (Vaul-style, drag to dismiss), handle 32×4px `border-strong`.
- Used only for: confirming discard, server-fallback consent, keyboard shortcuts help. Never for marketing.

### 8.9 Toast

- Sonner-style, bottom-center, monochrome, max 1 visible, 4s. Used only for background events (a batch item finished while the user is elsewhere). Never for confirming a click the user just made.

### 8.10 Navigation

- Header: 56px, `bg` with 1px `border` bottom, wordmark left (text only, `text-h3` 600, tight tracking), "All tools" menu, search (⌘K), theme toggle. No CTA button in the header; the tool is the CTA.
- Command palette (⌘K): every tool searchable by name and by aliases ("shrink", "reduce size" → Compress). This is a primary navigation method on desktop.
- Footer: tool categories as plain text link columns, `text-sm`. Legal links. No newsletter form. No social icons unless we actually post.

---

## 9. Voice in UI (see also `11-content-guidelines.md`)

- Sentence case. No exclamation marks. No emoji.
- Tool title pattern: `<Verb> <object>` — "Compress video", "Convert MOV to MP4", "Extract audio".
- Empty state copy is one sentence. Error copy is two at most.
- Numbers use non-breaking spaces before units: `12.4 MB`, `1920×1080` (real multiplication sign), `0:42`.

---

## 10. Implementation notes

- Tokens are defined once in `src/styles/tokens.css` under Tailwind v4 `@theme`. Components use Tailwind utilities that reference tokens (`bg-bg`, `text-fg-muted`, `rounded-lg`). Arbitrary values (`bg-[#…]`, `p-[13px]`) are lint errors.
- Motion via the `motion` package (formerly Framer Motion) for layout/spring; CSS transitions for hover/pressed.
- All components have a Storybook-free "kitchen sink" route at `/dev/ui` (dev-only, excluded from build) for visual review.
- Every component ships with keyboard tests (Playwright) and an axe check.
