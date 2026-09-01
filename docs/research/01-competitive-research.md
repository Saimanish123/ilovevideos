# Competitive Research

Compiled 2026-09-02. Items marked *(verify)* come from general knowledge of these products and should be re-checked before being quoted publicly; items marked *(observed)* were confirmed by fetching the live site or its sitemap during research.

## 1. The name is taken, several times over

| Domain | What it is *(observed)* |
|---|---|
| **ilovevideo.dev** | "Free online video tools that convert, compress, trim, crop, merge and extract audio with no file upload and no account needed." This is *our exact concept*, already live. |
| **ilovevideo.fun** | 185+ mixed tools (video compress, background removal, PDF, transcription, resume/invoice generators). Has `/learn/…` guide pages such as `compress-video-for-whatsapp`, `resize-video-for-tiktok-instagram-youtube`. |
| **ilovevideoeditor.com** | Template-based editor, 259 templates, free, no signup, no watermark. |
| **ilovevideo.ai** | AI video generator. |
| **iloveimg.com / ilovepdf.com** | The brand we are echoing. Owned by iLovePDF S.L. (Barcelona). Trademark exposure is real. |

**Implication.** "ilovevideos" as a brand is crowded, confusable, and legally exposed. It also has no SEO advantage: nobody searches the brand of a tool they haven't heard of; they search the task. Recommendation: keep `ilovevideos` as the codename, keep the brand string in one constant, and pick a distinctive, ownable name before launch (ADR-0001). A short, pronounceable, .com-available name is worth more than the iLove echo.

**Second implication.** ilovevideo.dev proves the "no upload" positioning is already being attempted. We must out-execute on (a) breadth of tools, (b) depth of content, (c) UI quality, (d) speed via WebCodecs rather than ffmpeg.wasm alone. Study it closely before Phase 1 ends.

## 2. Incumbents

| Site | Model | Free-tier friction *(verify)* | Processing | Notable |
|---|---|---|---|---|
| **iLovePDF / iLoveIMG** | Freemium, ~25 tools each | Daily task limits, file size caps on free | Server | Gold standard for *structure*: "All tools" dropdown with category filters (Organize, Optimize, Convert, Edit, Security), one page per tool, 25+ languages, workflows. Header: logo, "All PDF tools", Login/Sign up. *(observed)* |
| **Clideo** | Freemium | Watermark on free exports, 500 MB cap | Server | Very large sitemap (~3 MB raw) *(observed)*: aggressive programmatic pages per format/platform. |
| **Kapwing** | Freemium editor | Watermark, 720p export, ~4-min export length, 250 MB upload on free | Server | Strong content marketing; many "how to" pages. |
| **VEED.io** | Freemium editor | Watermark, 720p, ~10 min/export on free | Server | Heavy AI positioning (ads, avatars, UGC). Diverging from utility use-cases. *(observed nav)* |
| **123apps** (online-video-cutter.com, video-converter.com, mp3cut.net, online-voice-recorder.com…) | Free, ad-supported | Generous free limits (multi-GB), ads | Server | **Multi-domain strategy**: one domain per tool category, each domain ranks for its head term. *(observed)* Closest to our UX philosophy: one tool, one screen, no clutter. |
| **FreeConvert** | Freemium | 1 GB free; paid 1.5 / 2 / 5 GB at $12.99 / $24.99 / $29.99 *(observed pricing table)* | Server | Enormous format-pair page matrix (multiple 30 MB sitemap shards observed). |
| **CloudConvert** | Metered | 25 conversion minutes/day free, 1 GB | Server | API-first; developers. |
| **Convertio** | Freemium | 100 MB free; same paid tiers as FreeConvert *(observed)* | Server | Format-pair matrix. |
| **Ezgif** | Free, ads | ~200 MB | Server | Utilitarian, ugly, beloved. Ranks #1 for most GIF queries by sheer age and content. |
| **Clipchamp** (Microsoft) | Free tier | 1080p free, no watermark since 2022 | Hybrid | Full editor; not a utility site. |
| **Flixier, Media.io, Online-Convert, Aconvert, VideoCandy, Fastreel** | Freemium | Watermarks / caps | Server | Second tier; heavy programmatic SEO. |

## 3. Patterns worth copying

1. **One tool, one URL, one H1** (iLovePDF, 123apps). Title pattern that ranks: `Compress Video Online — Free Video Compressor` style: task first, "online"/"free" modifiers, tool noun.
2. **Category hub pages** (iLovePDF "Optimize PDF" etc.) that link every tool in the category, giving crawlers a shallow graph (home → hub → tool, depth 2).
3. **Format-pair matrices** (FreeConvert, Convertio, Clideo) capture long-tail. But most are thin; identical text with the format names swapped. Google tolerates it from old domains with authority; a new domain will not get the same benefit. Our rule: only ship pairs with unique, specific content (see catalog pruning rule).
4. **Platform/purpose guides** (ilovevideo.fun `/learn/compress-video-for-whatsapp`): use-case pages convert well and rank for "for X" queries.
5. **Multi-domain by category** (123apps): powerful but expensive to maintain; not for Phase 1. Revisit if one category (e.g. GIF) deserves its own brand.

## 4. Patterns to avoid

- Upload-first flows with a progress bar for the *upload*, then a queue, then a *download* from their CDN. Three waits.
- Watermarks and 720p caps: the number-one complaint in reviews of Kapwing/VEED/Clideo.
- Cookie banners, newsletter modals, "Rate us" popups, ad-slots between the H1 and the tool.
- Thin format-pair pages with boilerplate.
- AI feature sprawl that buries the utility (VEED).

## 5. User complaints we solve *(general knowledge, verify with fresh sampling)*

| Complaint | Our answer |
|---|---|
| "Uploading a 2 GB file took 20 minutes then it failed." | No upload. Device-side. |
| "Watermark on my school project." | None, ever. |
| "Free tier only gives 720p." | Output resolution is whatever you choose. |
| "I don't want my kid's video on some server." | Files never leave the device; provable (works offline). |
| "Too many ads / popups." | No ads. |
| "Had to sign up to download." | No accounts. |
| "Quality was terrible after compressing." | Honest presets, real before/after size, preview before download. |
| "Doesn't work on my phone." | Mobile-first workspace, PWA share-target. |

## 6. Search landscape (qualitative)

Head terms (very high volume, very high competition): `compress video`, `video compressor`, `video converter`, `mp4 to mp3`, `video to gif`, `mov to mp4`, `trim video`, `cut video online`, `merge videos`, `video to audio`.

Long-tail where a new site can win in months: `compress video for discord`, `compress video under 8mb`/`10mb`, `compress video for whatsapp`, `compress video for email`, `mov to mp4 iphone`, `hevc to h264`, `mkv to mp4 no quality loss`, `remove audio from video`, `video to gif high quality`, `screen recording to gif`, `resize video for tiktok`, `9:16 to 16:9`, `remove metadata from video`, `check video codec`, `srt to vtt`, `shift subtitles`, `extract audio from mp4`, `webm to mp4`, `gif to mp4 discord`, `rotate video 90 degrees`, `speed up video 2x`.

Ranking pages share: task-first `<title>`, `<h1>` matching query, tool above the fold, "How to" steps, FAQ, related tools, heavy internal linking, many languages.

## 7. Conclusions feeding the plan

- Rename before launch (ADR-0001).
- Device-first processing is *the* differentiator, and one competitor already claims it. We must be faster (WebCodecs) and broader.
- Content quality per page is the moat against programmatic incumbents on a young domain.
- Copy iLovePDF's information architecture; copy 123apps' one-screen calm; copy nobody's visual design.
