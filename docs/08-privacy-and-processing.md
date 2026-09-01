# Privacy & Processing Policy

The privacy promise is the product. This document defines exactly what we promise, how it is enforced technically, and what we say when we cannot keep it.

## 1. The promise, precisely

1. **On-device by default.** Every tool processes files inside the user's browser unless the tool page says otherwise before a file is chosen.
2. **No upload without consent.** The server path (Phase 2) requires a per-file, explicit confirmation dialog that states what is sent, where, for how long.
3. **No accounts.** Nothing identifies a user across sessions except a `localStorage` theme/preset preference they can clear.
4. **No consent-requiring cookies.** We set no cookies. Analytics are cookieless and aggregate.
5. **No content logging.** The server path never logs filenames, content, or metadata beyond byte counts and durations for capacity planning.
6. **Deletion.** Server-processed files live in RAM/tmpfs and are deleted on download completion or after 60 minutes, whichever is first.
7. **Provable.** Tool pages work offline once loaded (PWA, Phase 2). Network activity during processing is zero and users can verify in DevTools; we say so in the FAQ.

## 2. Enforcement

| Promise | Mechanism |
|---|---|
| On-device | Engines run in Web Workers; no `fetch` of user data anywhere in engine code. Lint rule: `fetch`/`XMLHttpRequest`/`navigator.sendBeacon` are banned in `src/tools/engines/**` and `src/tools/workers/**` except the ffmpeg core loader fetching *our* static assets. |
| No upload without consent | Server backend is a separate module behind a `ConsentGate` component; it cannot be invoked without a resolved consent promise. E2E test asserts no network request carries a body > 1 KB on any tool page in default flow. |
| No cookies | CI check: response headers of the built site contain no `Set-Cookie`. Analytics script is proxied and configured cookieless. |
| Deletion | Server: tmpfs mount, cron reaper at 60 min, download endpoint deletes on completion. Logged and monitored. |
| Content logging | Server logs are structured; allowlisted fields only (`bytes_in`, `bytes_out`, `duration_ms`, `engine`, `status`). |

## 3. Copy rules for privacy claims

- Say "Your file stays on this device." only on tools where `onDeviceOnly: true`.
- On tools with a server backend, the idle stage says: "Runs on your device. Files over N GB or with unsupported codecs can be processed on our server with your permission."
- Never say "100% secure", "military-grade", "bank-level". Say what we do.
- The privacy page is written in plain language, one screen long, and links to the technical description above.

## 4. Third parties

- Fonts: self-hosted. No Google Fonts requests.
- Analytics: Plausible or Umami, self-hosted or proxied from our origin, cookieless, no cross-site identifiers, respects DNT.
- Error reporting: none in Phase 1. If added later, scrub file names and paths; opt-in.
- No ads, no tag managers, no social embeds, no chat widgets.

## 5. Where the browser falls short (and we say so)

| Case | Behaviour |
|---|---|
| Codec the browser cannot encode (e.g. HEVC on some Chrome builds) | Offer H.264/AV1 instead; explain. Server path is opt-in. |
| File larger than device memory allows via ffmpeg.wasm (32-bit) | Prefer WebCodecs path (per-frame memory). If unavailable, say the file is too large for this browser and suggest desktop Chrome or the opt-in server. |
| Firefox for Android (no WebCodecs) | ffmpeg.wasm single-thread; warn about speed. |
| Very long Whisper transcription on a phone | Estimate time up front; allow smaller model. |

## 6. Legal pages required before launch

- Privacy policy (plain language + technical annex).
- Terms of use (no uploading of content you do not have rights to; no warranty).
- Open-source licences page (mediabunny MPL-2.0, ffmpeg.wasm GPL build with source link, fonts, icons).
- Imprint/contact where legally required.
