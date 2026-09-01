# Content & Copy Guidelines

Applies to UI strings, tool page prose, FAQs, blog/guides, metadata. Copy is part of the design. Generic copy is the loudest "vibe-coded" signal after purple gradients.

---

## 1. Voice

Calm, exact, plain. We sound like a competent engineer explaining what will happen, not like a marketer. Think Apple's technical specs page or the Stripe docs, not a product launch email.

- **Direct**: "Compress video." not "Compress your videos easily online for free!"
- **Concrete**: "Reduces a 100 MB phone clip to about 20 MB at 1080p." not "Dramatically reduce file size."
- **Honest**: "Runs on your device. Nothing is uploaded." Only say it where it is true. Where a server fallback exists, say that too.
- **Unhurried**: no urgency, no "now", no "instantly", no "in seconds" unless we measured it.

## 2. Banned words and patterns

These are lint-checked in `scripts/lint-copy.ts` against `src/content/**` and `src/tools/**`.

**Adjectives**: powerful, seamless, seamlessly, blazing, lightning-fast, ultimate, best-in-class, cutting-edge, state-of-the-art, revolutionary, effortless (in marketing sense), stunning, beautiful (about our own UI), amazing, awesome, incredible, supercharge, unleash, unlock, elevate, empower, next-level, game-changing, robust, hassle-free, one-stop.

**Phrases**: "AI-powered", "in seconds" (unless measured), "100% free" (say "Free."), "no strings attached", "trusted by", "join thousands", "the #1", "the best online", "sign up today", "get started for free", "take your videos to the next level".

**Punctuation**: exclamation marks (anywhere in UI/marketing), emoji, ALL CAPS for emphasis, ellipses for suspense.

**Structure**: rhetorical questions as headings ("Tired of large video files?"), listicle-style "Why choose us?", triplets of synonyms ("fast, easy and secure").

## 3. Patterns to use

| Element | Pattern | Example |
|---|---|---|
| Tool H1 | `<Verb> <object>` | Compress video · Convert MOV to MP4 · Remove audio from video |
| Tool subtitle | What it does + where it runs, one sentence | Make a video smaller without visible quality loss. Runs in your browser. |
| Meta title | `<Tool name> online, free, no upload · ilovevideos` (≤ 60 chars; drop "no upload" if server-only) | Compress video online, free, no upload · ilovevideos |
| Meta description | ≤ 155 chars, what + how + privacy | Reduce video file size in your browser. Choose a target size or quality. Files never leave your device. Free, no account. |
| Primary button | Verb, matches H1 | Compress · Convert · Trim · Download |
| Progress copy | Real state | Processing frame 1,204 of 3,600 · Encoding audio · Finishing |
| Success | Result, then action | 12.4 MB → 3.1 MB. Download below. |
| Error | What happened, then what to do | This file uses a codec your browser can't decode. Convert it to MP4 first, or try on desktop Chrome. |
| Privacy line | One sentence, near the action | Your file stays on this device. |

## 4. Tool page prose (SEO body)

Every tool page has unique prose, minimum ~350 words, written for a human who searched the query. Structure:

1. **What this does** (2–3 sentences, plain).
2. **How to use it** (3–5 numbered steps, each one sentence).
3. **Good to know** (3–6 short paragraphs of real, tool-specific knowledge: what settings mean, tradeoffs, format facts, platform limits like Discord 10 MB / WhatsApp 16 MB / email 25 MB). This is where we beat competitors: real information, not filler.
4. **FAQ** (4–8 questions people actually search; answers 1–3 sentences).
5. **Related tools** (links, generated from the registry).

Do not reuse paragraphs across pages. Format pairs (MOV→MP4 vs AVI→MP4) must each explain something specific about the source format. If there is nothing specific to say, the page should not exist.

## 5. Numbers and units

- Space before unit, non-breaking: `12.4 MB`, `1080p`, `30 fps`, `0:42`.
- Dimensions use `×`: `1920×1080`.
- Percentages have no space: `−75%`. Use a real minus sign for negatives.
- Durations: `m:ss` under an hour, `h:mm:ss` above.
- Round file sizes to 1 decimal under 100, whole above.

## 6. Capitalisation

- Sentence case for everything, including headings, buttons, nav.
- Format names as the world writes them: MP4, MOV, WebM, GIF, MP3, AAC, H.264, HEVC, AV1, VP9, ProRes.
- Product name: `ilovevideos` in lowercase in body text and the wordmark. Title Case never.

## 7. Internationalisation readiness

- No concatenated strings. Use ICU message format with placeholders.
- No text in images.
- Leave room: German runs ~30% longer than English; buttons must not truncate.
