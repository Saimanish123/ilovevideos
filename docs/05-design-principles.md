# Design Principles

> The site should feel like a tool Apple would ship if Apple made a website of video utilities. Quiet, exact, confident. Nothing decorative. Everything earns its place.

This document is normative. Every UI decision is checked against it. When a rule here conflicts with a convenience, the rule wins.

---

## 0. The one-line brief

**A file drops in. A file comes out. Everything between those two moments is invisible or essential.**

The user is not here to admire the site. They are here because a video is the wrong size, format, length or shape. Our job is to make the fix feel effortless and then get out of the way.

---

## 1. Principles

### 1.1 Monochrome by conviction, not by default

The palette is grayscale. No brand color. No blue links. No green success or red error as color alone.

- Hierarchy is carried by **value** (lightness), **weight**, **size** and **space**, never by hue.
- State is carried by **shape, motion, icon and copy**. A success state is a check icon drawing itself in, not a green box. An error is a firm sentence, a small icon, and a subtle shake of the affected control, not a red banner.
- The single permitted exception is the **destructive** action, which may use a desaturated red on hover/confirm only, and the **focus ring**, which uses the foreground color at full contrast.
- Photography and the user's own video content provide all the color the page will ever need. The chrome must stay out of its way.

Why: color is the fastest tell of a template. Removing it forces every other decision (type, spacing, motion) to be right, because there is nothing to hide behind.

### 1.2 Typography is the interface

- One typeface family for everything: a neutral grotesque with real optical sizing and tabular figures (see design system). No display font, no second family, no gradient text.
- Sizes come from a fixed scale. Never invent a size.
- Headlines are set tight (negative tracking), body is set default, small labels are set slightly loose. Never the reverse.
- Text is left-aligned. Center alignment is allowed only for a single short line (a page title, an empty state) and never for paragraphs.
- Numbers that change (file size, duration, progress) use tabular figures so they do not jitter.
- Line length for prose is capped at ~65–75 characters.

### 1.3 Space is structure

- All spacing is on a 4px grid. Component internals use 4/8/12/16. Layout uses 24/32/48/64/96/128.
- Prefer whitespace over dividers. Prefer dividers over borders. Prefer borders over shadows. Prefer one shadow over a card-in-a-card.
- No nested cards. A surface may sit on the page; a surface may not sit on another surface.
- Density is medium-low on marketing pages and medium on the tool workspace. Both use the same grid.

### 1.4 Motion is physics, not decoration

- Every animation communicates a state change or a spatial relationship. If removing it loses no information, remove it.
- Enter and exit are asymmetric in duration: enter 200–300ms, exit 120–180ms, both ease-out. Things leave the screen faster than they arrive.
- Durations are short. Nothing on the page takes longer than 400ms unless it is tied to real progress.
- Use the project's easing tokens only (see design system §6.2). Never `linear` for movement, never `ease-in` on UI.
- Respect `prefers-reduced-motion`: motion collapses to opacity-only or instant.
- Progress is honest. A progress bar reflects real work (frames processed / total). Indeterminate spinners are a last resort and never appear for more than ~2 seconds without an explanation.
- Hover states change one property (usually background value by one step). Not two, not three.
- No scroll-jacking, no parallax, no elements that animate on scroll into view "for delight".

### 1.5 The workspace is a single stage

Each tool page has one primary surface: the **stage**. Before a file is added, the stage is the drop zone. After, it becomes the preview and controls. The URL does not change. Nothing navigates away. The user never loses their place.

- One primary action per screen state. It is the only high-contrast button visible.
- Secondary actions are text or ghost buttons.
- Controls sit beside the preview on desktop and below it on mobile. They never cover the preview.
- Options have sensible defaults chosen so that pressing the primary action immediately, without touching anything, produces a good result.

### 1.6 Say less, mean it

- Headlines are plain: "Compress video." not "Shrink your videos in seconds with our AI-powered compressor!"
- No exclamation marks in UI copy. No emoji in UI copy.
- No marketing adjectives on tool pages: "powerful", "seamless", "blazing", "AI-powered", "ultimate" are banned.
- Say what happens: "Your file stays on this device." beats "100% secure and private!!!"
- Error copy states what went wrong and what to do next, in that order, in one or two sentences.
- Buttons are verbs: "Compress", "Download", "Start over". Never "Submit", "OK", "Go".
- Sentence case everywhere. Title Case only for the product name.

### 1.7 Honest about the machine

- If processing happens on the device, say so, once, near the action.
- If a file would need the server (too large, unsupported codec), say so before uploading and let the user decide.
- Show real numbers: estimated output size, actual output size, time elapsed. Never round to make it look better.
- If a tool cannot do something well in the browser (e.g. HEVC encode), we do not pretend. We offer the nearest good option.

### 1.8 Instant, then fast

- Tool pages are static HTML. The drop zone is interactive before any processing code downloads.
- Heavy code (codecs, WASM) loads only after a file is added, and shows a small honest indicator while doing so.
- Time to first useful interaction under 1 second on a mid-range phone on 4G.
- Core Web Vitals are a design constraint, not an afterthought: no layout shift, INP under 200ms, LCP under 2.5s on every page.

### 1.9 Mobile is a first-class device, not a breakpoint

- Half of video files people need to fix are on their phone. Every tool works one-handed on a 375px-wide screen.
- Tap targets are at least 44×44px.
- The file picker opens the native picker; drag-and-drop is a desktop bonus.
- Sliders and range inputs are large, with numeric inputs beside them for precision.

### 1.10 Accessible by construction

- Contrast: all text meets WCAG AA (4.5:1). Large headings meet 3:1. This is easy in grayscale; do not break it with light-gray-on-white "subtle" text below 4.5:1.
- Everything is keyboard operable. Focus is always visible (2px ring in foreground color, 2px offset).
- All icon-only buttons have labels. All progress has `aria-live` announcements at sensible intervals.
- Never disable a button without explaining why (tooltip or inline text).

---

## 2. Anti-patterns (the "vibe-coded" tells)

The following are banned. Their presence in a PR is a rejection.

| Tell | Why it reads as generic |
|---|---|
| Purple/indigo/violet gradients, gradient text, gradient borders | Default of every AI-generated landing page 2023–2026 |
| Glassmorphism / `backdrop-blur` cards on colored blobs | Same |
| Emoji as icons or in headings | Reads as unfinished |
| Three-column "feature cards" with an icon in a colored circle | Template pattern |
| Rounded-2xl everything; radius larger than 12px on containers | Toy-like |
| Drop shadows with visible color or large blur on every card | Muddy, non-committal |
| "Trusted by 10,000+ users" social proof strips with fake logos | Dishonest |
| Rotating testimonials carousel | Nobody reads them |
| Animated gradient background blobs | Decoration with no meaning |
| Hero with a mock browser window screenshot at an angle | Template |
| Typing/typewriter animations, count-up numbers on scroll | Decoration with no meaning |
| Marketing exclamation marks, "🚀", "✨" | Tone |
| Default shadcn/ui look left untouched (slate palette, default radius, default shadows) | Recognizable instantly |
| Inter at default tracking for headlines | The most default typographic choice on the web; fine for body, must be tuned for display |
| Toast notifications for every action | Noise. Toasts are for background events only |
| Cookie banners, newsletter modals, exit-intent popups | We do not use cookies that need consent. We do not interrupt |
| Skeleton loaders shimmering for content that is static | Static content is static; it does not load |
| "Powered by AI" badges | Nobody cares how; they care that it worked |

---

## 3. References we hold ourselves to

Study these, not to copy, but to calibrate what "finished" feels like:

- **apple.com** product pages: type scale, whitespace, restraint, how a single high-contrast button carries a whole section.
- **Linear** (linear.app): monochrome-first UI, motion discipline, keyboard-first.
- **Vercel** dashboard and geist design system: grayscale scales, borders over shadows, typography hierarchy.
- **Raycast** website: dark-monochrome polish, motion that communicates.
- **Emil Kowalski's work** (Sonner, Vaul, animations.dev): easing, duration, and the discipline of animating one property. His skills are imported into `.claude/skills/` and are mandatory reading before touching any interaction.
- **iA Writer**, **Things 3**: how few controls a tool can have and still feel complete.
- **Handbrake / ffmpeg documentation**: honesty about what the machine is doing.

---

## 4. Decision procedure

When unsure whether something belongs:

1. Does removing it lose information the user needs to complete the task? If no, remove it.
2. Can the same information be carried by type, space or one icon instead of color, a box or an animation? If yes, do that.
3. Would this look at home on an Apple product page? If no, redo it.
4. Would a senior designer at Linear or Vercel be able to tell this was generated? If yes, redo it.

---

## 5. Definition of done for any UI

- [ ] Uses only tokens from the design system (no raw hex, no arbitrary spacing, no arbitrary font sizes).
- [ ] Zero hue anywhere in the chrome (grayscale only), except focus ring and destructive hover.
- [ ] Works at 375px, 768px, 1280px and 1920px with no horizontal scroll.
- [ ] Keyboard-operable end to end, visible focus, labelled controls.
- [ ] Every animation has a stated purpose and respects reduced motion.
- [ ] Copy passes the banned-words check (see `docs/11-content-guidelines.md`).
- [ ] Lighthouse: Performance ≥ 95, Accessibility 100, SEO 100, Best Practices 100 on the production build.
- [ ] Reviewed against the anti-pattern table.
