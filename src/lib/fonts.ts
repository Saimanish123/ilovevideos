import localFont from "next/font/local";

/**
 * Geist Sans, Latin subset (scripts/subset-geist.sh): 33 KB instead of the package's 70 KB variable
 * font, because it is preloaded on every page and sits on the first paint. Other scripts fall back to
 * the system sans. OFL 1.1, no Reserved Font Name (src/fonts/OFL.txt).
 */
export const GeistSans = localFont({
  src: "../fonts/Geist-Latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

/**
 * Geist Mono, as the `geist` package defines it but not preloaded: it only sets ffmpeg commands and
 * a few figures below the fold, so it must not compete with the first paint (Lighthouse LCP, ADR-0029).
 */
export const GeistMono = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  adjustFontFallback: false,
  preload: false,
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Roboto Mono",
    "Menlo",
    "Monaco",
    "Liberation Mono",
    "DejaVu Sans Mono",
    "Courier New",
    "monospace",
  ],
  weight: "100 900",
});
