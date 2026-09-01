import type { MetadataRoute } from "next";
import { routing } from "@/lib/i18n/routing";
import { site } from "@/lib/site";
import { categories, tools } from "@/tools/registry";

/**
 * Google ignores <changefreq> and <priority>; we emit neither.
 * <lastmod> comes from the registry's updatedAt and is never deploy-stamped.
 * hreflang alternates live here, not in <head>. Shard by locale once a locale exceeds ~15k URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pathFor = (locale: string, path = "") =>
    `${site.url}${locale === routing.defaultLocale ? "" : `/${locale}`}${path || "/"}`;
  const alternates = (path: string) => ({
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, pathFor(l, path)])),
      "x-default": pathFor(routing.defaultLocale, path),
    },
  });
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of routing.locales) {
    entries.push({ url: pathFor(locale), alternates: alternates("") });
    for (const c of categories) {
      entries.push({
        url: pathFor(locale, `/tools/${c.id}`),
        alternates: alternates(`/tools/${c.id}`),
      });
    }
    for (const t of tools) {
      entries.push({
        url: pathFor(locale, `/${t.slug}`),
        lastModified: t.updatedAt,
        alternates: alternates(`/${t.slug}`),
      });
    }
  }
  return entries;
}
