import { defineRouting } from "next-intl/routing";

/** English ships first. Add locales here; content and registry are locale-aware from day one. */
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  /** No cookies anywhere (docs/08-privacy-and-processing.md). No IP/Accept-Language redirects (SEO research §4). */
  localeCookie: false,
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
