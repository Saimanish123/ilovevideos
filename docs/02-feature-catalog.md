# Feature Catalog

The complete map of what ilovevideos does. Two layers:

- **Engines** (~48): distinct processing capabilities. Each is code. Each has a stable ID, an options schema, and one or more execution backends (WebCodecs/mediabunny, ffmpeg.wasm, server).
- **Tool pages** (500+): SEO-facing, single-purpose pages generated from the tool registry (`src/tools/registry/*.ts`). A page = engine + preset options + unique content + search intent. Many pages share an engine.

Status legend: **T** table stakes (every competitor has it) · **D** differentiator (rare or absent in competitors) · **P1/P2/P3** launch phase (see `09-roadmap.md`).

Backend legend: **W** WebCodecs + mediabunny (fast, hardware-accelerated where available) · **F** ffmpeg.wasm (universal, slower, filters/codecs WebCodecs lacks) · **S** server fallback (opt-in; large files / codecs browsers cannot encode) · **J** pure JS/Canvas/WebGPU (no codec work).

---

## A. Size & quality

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| A1 | **Compress video** (quality/CRF-like, target size, target bitrate, resolution cap) | W, F | T, P1 | Flagship. Presets: "Smaller", "Balanced", "Best quality"; target-size mode with two-pass estimation. |
| A2 | **Resize / change resolution** (presets 4K/1080p/720p/480p/360p, custom, keep aspect, upscale warning) | W | T, P1 | |
| A3 | **Change bitrate** (video/audio explicit) | W, F | P2 | For technical users. |
| A4 | **Change frame rate** (60→30→24→15, drop or blend) | W, F | T, P2 | |
| A5 | **Change codec** (H.264 ↔ HEVC ↔ VP9 ↔ AV1; audio AAC/Opus/MP3) | W, F, S | P2 | HEVC/AV1 encode availability varies by browser; declare capability at runtime. |
| A6 | **Remux** (change container without re-encoding: MOV→MP4, MKV→MP4, WebM→MKV) | W | D, P1 | Instant. Most "convert" queries where codecs are compatible should hit this path; competitors always re-encode. |
| A7 | **Optimise for web / faststart** (moov atom to front, streaming-friendly) | W | D, P2 | |
| A8 | **Compress for platform** (Discord 10 MB/25 MB, WhatsApp 16 MB, email 25 MB, Telegram, Slack, iMessage, Twitter/X 512 MB & 2:20, Instagram, TikTok, LinkedIn) | W, F | D, P1 | Each platform is its own page with real, dated limits. High long-tail value. |

## B. Format conversion

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| B1 | **Convert video** (generic: any → MP4/WebM/MOV/MKV/AVI/GIF/…) | W, F | T, P1 | One engine; `from × to` pairs generate pages. Remux when possible, else transcode. |
| B2 | **Video → audio** (MP4→MP3/AAC/WAV/FLAC/OGG/OPUS/M4A) | W, F | T, P1 | "Video to MP3" is one of the highest-volume queries. |
| B3 | **Audio → audio** (MP3/WAV/FLAC/AAC/OGG/OPUS/M4A/AIFF/WMA pairs) | W, F | T, P1 | Cheap to add; huge page fan-out. |
| B4 | **Video → GIF** (fps, width, start/end, loop, dithering, palette quality) | J, F | T, P1 | gifenc palette; ffmpeg `palettegen` path for quality mode. |
| B5 | **GIF → video** (GIF→MP4/WebM, for Twitter/Discord size) | W, F | T, P1 | |
| B6 | **Video → animated WebP / AVIF / APNG** | F, J | D, P2 | |
| B7 | **Video → image sequence** (JPG/PNG/WebP frames, every Nth frame or every N seconds, zip) | W, J | P2 | |
| B8 | **Images → video** (slideshow; per-image duration, crossfade, Ken Burns, music) | W, J | T, P2 | |
| B9 | **Audio → video** (waveform / static image + audio → MP4 for YouTube) | J, W | P2 | |
| B10 | **Screen-recording formats** (MKV/OBS → MP4, QuickTime MOV → MP4, .webm from browser recorders → MP4) | W | P1 | Same engine as B1 with source-specific pages. |
| B11 | **Camera/phone formats** (HEVC iPhone → H.264, MTS/M2TS/AVCHD → MP4, 3GP → MP4, MOD/TOD, DV, MXF, ProRes → H.264) | W, F, S | P2 | |
| B12 | **Legacy formats** (WMV, FLV, F4V, SWF video, RM/RMVB, VOB, MPG/MPEG-1/2, ASF, DivX/XviD AVI, OGV, TS) | F | P2 | ffmpeg.wasm only. |

## C. Cut, join, arrange

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| C1 | **Trim / cut** (in/out points, multiple segments keep or remove, lossless keyframe cut option) | W | T, P1 | Lossless mode when cut on keyframes is a **D**. |
| C2 | **Split** (by time, into N equal parts, by size cap, at custom points) | W | T, P1 | |
| C3 | **Merge / join** (concat, mismatched-resolution handling, optional crossfade, optional re-encode) | W, F | T, P1 | |
| C4 | **Loop / repeat** (N times or to duration, boomerang) | W | T, P2 | |
| C5 | **Reverse** | F, W | T, P2 | |
| C6 | **Speed** (0.25×–8×, pitch-preserve audio, ramp) | W, F | T, P1 | |
| C7 | **Remove silence / jump cut** (threshold, min duration, padding) | J+W | D, P2 | Talking-head videos; on-device analysis. |
| C8 | **Cut into clips for Shorts/Reels/TikTok** (auto 15/30/60s chunks) | W | D, P2 | |
| C9 | **Freeze frame / hold** | W | P3 | |
| C10 | **Picture-in-picture / side-by-side** (two videos) | J+W | P3 | |

## D. Geometry

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| D1 | **Crop** (free, ratio presets 16:9/9:16/1:1/4:5/4:3/21:9, exact px) | W | T, P1 | |
| D2 | **Change aspect ratio** (crop/pad/blur-pad to target ratio) | W | T, P1 | Per-platform pages: "Convert to 9:16 for TikTok", "Square for Instagram". |
| D3 | **Rotate** (90/180/270, arbitrary angle, metadata-only rotate = lossless) | W | T, P1 | Metadata-only rotation is a **D**. |
| D4 | **Flip / mirror** (horizontal, vertical) | W | T, P1 | |
| D5 | **Pad / add borders / letterbox** (colour, blurred background) | W | P2 | |
| D6 | **Zoom / pan (Ken Burns on video)** | W | P3 | |
| D7 | **Stabilise** | F (vidstab) | P3 | Expensive; two-pass; likely S fallback for long clips. |
| D8 | **Remove black bars (auto-detect crop)** | J+W | D, P2 | |
| D9 | **Fix vertical video for landscape (blurred sides)** | W | P2 | |

## E. Audio in video

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| E1 | **Mute / remove audio** | W | T, P1 | Remux-only; instant. |
| E2 | **Extract audio** (see B2) | W | T, P1 | |
| E3 | **Add / replace audio track** (music, voiceover; trim to video, loop, fade) | W | T, P1 | |
| E4 | **Adjust volume / gain / normalise (EBU R128 loudness)** | F, J | T, P2 | |
| E5 | **Fade audio in/out** | W, J | P2 | |
| E6 | **Audio delay / sync fix** (shift ms) | W | D, P2 | |
| E7 | **Change audio codec / bitrate / channels (stereo→mono)** | W | P2 | |
| E8 | **Remove background noise** (RNNoise-style on-device) | F/J | D, P3 | |
| E9 | **Isolate vocals / remove music** (on-device model) | J (WebGPU) | D, P3 | Heavy; feasibility spike required. |
| E10 | **Select/keep/remove audio tracks** (multi-track MKV) | W | P2 | |
| E11 | **Audio tools standalone**: trim, merge, speed, reverse, volume, fade, normalise, cut silence, pitch, tempo, mono/stereo, sample rate, bitrate, ringtone maker (M4R), voice recorder | W, F, J | T, P2 | Each is its own page family. |

## F. Text, captions, subtitles

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| F1 | **Add subtitles from file** (SRT/VTT/ASS → soft track or burned-in) | W (soft), F (burn) | T, P1 | Soft-sub muxing is instant. |
| F2 | **Auto-generate subtitles** (on-device Whisper via transformers.js/WebGPU; languages; word-level timing) | J | D, P2 | Privacy-safe captions are a headline differentiator. |
| F3 | **Burn-in / style captions** (font, size, position, background, TikTok-style word highlight) | J+W | T, P2 | Render with Canvas, composite via WebCodecs. |
| F4 | **Extract subtitles** (from MKV/MP4 soft tracks → SRT/VTT) | W | P2 | |
| F5 | **Subtitle utilities**: SRT↔VTT↔ASS↔SBV↔TXT convert, shift timing, fix overlaps, merge, split, change frame rate, translate (on-device model, P3) | J | D, P1 | Pure text tools; cheap; strong long-tail. |
| F6 | **Add text overlay / title** (positioned, timed, animated in/out) | J+W | T, P2 | |
| F7 | **Transcribe video to text** (transcript export TXT/DOCX/MD) | J | D, P2 | Shares F2. |
| F8 | **Translate subtitles** | J (on-device) / S (optional API) | P3 | |

## G. Overlays & visual

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| G1 | **Add watermark / logo** (image or text, position, opacity, scale, timed) | J+W | T, P1 | |
| G2 | **Remove watermark** (crop, blur region, delogo) | F | T, P2 | Region-based only; no "AI removal" claims. |
| G3 | **Blur / pixelate region** (static or tracked, faces P3) | J+W | P2 | Face-blur on device is a **D** (privacy). |
| G4 | **Brightness / contrast / saturation / exposure / gamma** | J+W | T, P2 | |
| G5 | **Filters / LUT** (monochrome, sepia, cinematic; upload .cube LUT) | J+W | P2 | |
| G6 | **Sharpen / denoise** | F | P3 | |
| G7 | **Add image overlay / sticker** | J+W | P2 | |
| G8 | **Add progress bar / timer / countdown** | J+W | P3 | |
| G9 | **Colour to black & white** | J+W | P2 | On-brand. |
| G10 | **Fade in/out (video)** | J+W | P2 | |
| G11 | **Add intro/outro** (image or clip, concat) | W | P3 | |
| G12 | **Green screen / chroma key** | J (WebGL) | P3 | |
| G13 | **Change background colour (padding regions)** | W | P2 | |

## H. Frames, stills, thumbnails

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| H1 | **Extract frame / screenshot at time** (PNG/JPG/WebP, full resolution) | W | T, P1 | |
| H2 | **Thumbnail generator** (multi-frame grid, contact sheet / storyboard) | W, J | P2 | |
| H3 | **Video → images (every N seconds)** (see B7) | W | P2 | |
| H4 | **Best-frame picker** (sharpness scoring) | J | D, P3 | |
| H5 | **Set poster/cover frame** (metadata) | W | P3 | |

## I. Metadata & inspection

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| I1 | **Video info / inspector** (codec, profile, bitrate, fps, resolution, duration, audio tracks, colour space, HDR) | W | D, P1 | mediainfo-like, instant, zero processing. Strong SEO: "check video codec online". |
| I2 | **Remove metadata / strip EXIF & GPS** | W | D, P1 | Privacy story. Instant remux. |
| I3 | **Edit metadata** (title, artist, date, comment, cover art for MP4/M4A/MP3) | W | P2 | |
| I4 | **Change creation date** | W | P3 | |
| I5 | **Check if video is corrupt / repair moov** | W, F | P3 | |
| I6 | **Compare two videos** (side-by-side, metadata diff) | J | D, P3 | |

## J. Capture

| # | Engine | Backend | Status | Notes |
|---|---|---|---|---|
| J1 | **Screen recorder** (tab/window/screen, mic, system audio, camera bubble) → MP4/WebM | W (MediaRecorder + remux) | T, P2 | Output MP4 directly (competitors give WebM). |
| J2 | **Webcam recorder** | W | T, P2 | |
| J3 | **Audio/voice recorder** | W | T, P2 | |
| J4 | **Screenshot of a video frame (see H1)** | | | |

## K. Platform & purpose presets (pages, not engines)

Each resolves to an existing engine with locked/preselected options and dedicated content:

- **Compress for**: Discord (10 MB free / 50 MB Nitro Basic / 500 MB Nitro), WhatsApp, Telegram, Email/Gmail (25 MB), Outlook (20 MB), iMessage, Slack, Teams, Messenger, Snapchat, Signal, Line, WeChat, KakaoTalk.
- **Resize/crop for**: TikTok (9:16 1080×1920), Instagram Reels/Feed/Story, YouTube (16:9) / Shorts (9:16), Twitter/X, Facebook, LinkedIn, Pinterest, Snapchat, Twitch, Threads, Bluesky.
- **Convert for**: iPhone, Android, iMovie, Premiere Pro (ProRes/DNxHD), DaVinci Resolve, Final Cut, PowerPoint, Google Slides, Keynote, Canva, WordPress, Shopify, Squarespace, Notion, Discord (GIF ≤ 8 MB), Twitter GIF, Steam artwork, Kindle, PS5/Xbox/Switch capture, GoPro, DJI drone, Zoom recording, Teams recording, OBS, Loom, Screen Studio.
- **Make a GIF from**: YouTube clip (user-supplied file), screen recording, TikTok, iPhone Live Photo (MOV), Boomerang.

## L. Batch & workflow (D)

| # | Feature | Status | Notes |
|---|---|---|---|
| L1 | **Batch processing** on every tool (queue, per-file status, zip download) | P1 core | Free, unlimited; competitors gate this. |
| L2 | **Chain tools** ("send result to another tool" without re-download) | P2 | In-memory handoff; unique. |
| L3 | **Presets** (save option sets in localStorage) | P2 | |
| L4 | **Command palette** (⌘K) over all tools | P1 | |
| L5 | **Paste a file / drag from another tab / share-target PWA** | P2 | Installable PWA with `share_target` so phones can "Share → ilovevideos". |
| L6 | **Offline** (PWA caches engines; works with no network) | P2 | Strong privacy proof. |
| L7 | **Show the equivalent ffmpeg command** for every operation | P1 | Teaches, builds trust, unique. |
| L8 | **Keyboard shortcuts** | P1 | |

---

## Page count estimate

| Family | How pages are generated | Approx. pages |
|---|---|---|
| Core tool pages (one per engine) | 1 each | ~70 |
| Video→video format pairs | 14 sources × 8 targets (only meaningful pairs) | ~90 |
| Video→audio pairs | 12 video × 8 audio | ~60 (pruned to meaningful) |
| Audio→audio pairs | 10 × 9 | ~60 (pruned) |
| GIF/animated pairs | (video, live photo, images) × (GIF, WebP, APNG, MP4) | ~20 |
| Compress for platform | 15 platforms | 15 |
| Resize/crop/aspect for platform × surface | ~12 platforms × ~2 surfaces | ~25 |
| Convert for device/app | ~35 | 35 |
| Subtitle utilities | ~20 | 20 |
| Audio standalone tools | ~15 | 15 |
| "Under N MB" size targets | 8 MB, 10 MB, 16 MB, 25 MB, 50 MB, 100 MB, 500 MB | 7 |
| Info/metadata/inspector variants | ~8 | 8 |
| Recorders | 3 | 3 |
| Guides/how-to (editorial, supports tool pages) | ongoing | 50+ |
| **Total at maturity** | | **~480–580** |

Pruning rule: a format-pair page ships only if (a) real search demand exists (verified in Search Console/keyword tools) **and** (b) we can write ≥ 150 words specific to that pair. Otherwise the pair is available in the generic converter but has no dedicated page. This is how we avoid the doorway-page penalty.

---

## What competitors gate that we do not

- Batch processing (Clideo/Kapwing/VEED paywall it).
- Files over ~500 MB–2 GB (most cap free tier at 500 MB or less; our device-side path is limited only by the user's RAM/disk, and we say so).
- No watermarks anywhere.
- No daily operation limits.
- No account.
- Output resolution not capped (Kapwing/VEED cap free exports at 720p).

## What we do not do (and say so)

- Full timeline editing.
- AI generation (text-to-video, avatars, voice cloning).
- Downloading videos from YouTube/TikTok/Instagram URLs (legal exposure; we process files the user already has).
