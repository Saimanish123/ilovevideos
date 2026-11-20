import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/layout/json-ld";
import { ToolPage } from "@/components/tool/tool-page";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { breadcrumbs } from "@/lib/seo/jsonld";
import { site } from "@/lib/site";
import { getCategory, getRelatedTools, getThenSteps, getTool, tools } from "@/tools/registry";

type Params = { locale: string; slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return routing.locales.flatMap((locale) => tools.map((t) => ({ locale, slug: t.slug })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  const c = tool.content[locale] ?? tool.content.en;
  const path = locale === routing.defaultLocale ? `/${slug}` : `/${locale}/${slug}`;
  const og = ogImages(slug, `${c.title}: ${c.subtitle}`);
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    // hreflang is emitted in the sitemap only (README.md#seo-strategy §4); the head carries the canonical.
    alternates: { canonical: `${site.url}${path}` },
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      url: `${site.url}${path}`,
      type: "website",
      images: og.images,
    },
    twitter: og.twitter,
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const tool = getTool(slug);
  if (!tool) notFound();
  const related = getRelatedTools(tool);
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const jsonLd = [breadcrumbs(tool, getCategory(tool.category), locale, localePath)];

  return (
    <>
      <JsonLd data={jsonLd} />
      <ToolPage
        tool={tool}
        category={getCategory(tool.category)}
        related={related}
        then={getThenSteps(tool)}
        locale={locale}
      />
    </>
  );
}
