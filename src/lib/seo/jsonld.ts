import type { BreadcrumbList, Organization, WebSite, WithContext } from "schema-dts";
import { site } from "@/lib/site";
import type { CategoryDefinition, ToolDefinition } from "@/tools/registry/schema";

/**
 * Structured data policy (docs/research/02-seo-technical-research.md §3):
 *  - BreadcrumbList on every page (live rich result; proves browseable hierarchy)
 *  - Organization + WebSite once, sitewide (no SearchAction: retired 2024)
 *  - NO FAQPage (rich result retired May 2026), NO HowTo (retired 2023),
 *    NO SoftwareApplication until we have real user ratings (fabricated aggregateRating = manual action risk)
 */

export function breadcrumbs(
  tool: ToolDefinition,
  category: CategoryDefinition,
  locale: string,
  localePath: string,
): WithContext<BreadcrumbList> {
  const c = tool.content[locale] ?? tool.content.en;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: site.name,
        item: `${site.url}${localePath || "/"}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: category.title,
        item: `${site.url}${localePath}/tools/${category.id}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: c.title,
        item: `${site.url}${localePath}/${tool.slug}`,
      },
    ],
  };
}

export function organization(): WithContext<Organization> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: `${site.url}/icon.svg`,
  };
}

export function website(): WithContext<WebSite> {
  return { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: site.url };
}
