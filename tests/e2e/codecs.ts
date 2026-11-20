import type { Page } from "@playwright/test";

/**
 * Whether this browser build can encode AAC with WebCodecs. Chromium on macOS, Windows and Android
 * uses the platform encoder; Chromium on Linux (the CI runner) has none, and the engines then write
 * Opus. Call after a page of the site has loaded.
 */
export async function aacEncodes(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (typeof AudioEncoder === "undefined") return false;
    const r = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 192_000,
    }).catch(() => ({ supported: false }));
    return r.supported === true;
  });
}

/** The skip reason for tests that check AAC output, kept in one place. */
export const NO_AAC =
  "No AAC encoder in this browser build (Chromium on Linux); the AAC output checks need one";
