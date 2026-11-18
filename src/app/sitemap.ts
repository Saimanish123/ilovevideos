import type { MetadataRoute } from "next";
import { routing } from "@/lib/i18n/routing";
import { site } from "@/lib/site";
import { getActiveCategories, getToolsByCategory, tools } from "@/tools/registry";

/**
 * Google ignores <changefreq> and <priority>; we emit neither.
 * <lastmod> comes from the registry's updatedAt and is never deploy-stamped: a tool's own date, a hub's
 * the later of its copy's date and its tools' dates, the home page's the latest of all of them.
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
  // ISO dates sort as strings.
  const latest = (dates: (string | undefined)[]) =>
    dates.reduce<string | undefined>((a, d) => (d && (!a || d > a) ? d : a), undefined);
  const hubs = getActiveCategories().map((c) => ({
    id: c.id,
    lastModified: latest([c.updatedAt, ...getToolsByCategory(c.id).map((t) => t.updatedAt)]),
  }));
  const home = latest([...hubs.map((h) => h.lastModified), ...tools.map((t) => t.updatedAt)]);
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of routing.locales) {
    entries.push({ url: pathFor(locale), lastModified: home, alternates: alternates("") });
    for (const h of hubs) {
      entries.push({
        url: pathFor(locale, `/tools/${h.id}`),
        lastModified: h.lastModified,
        alternates: alternates(`/tools/${h.id}`),
      });
    }
    // Plain-language pages carry no lastmod: they have no registry date, and a deploy date is not one.
    for (const path of ["/about", "/privacy", "/licences"]) {
      entries.push({ url: pathFor(locale, path), alternates: alternates(path) });
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
