import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ToolPage } from "@/components/tool/tool-page";
import { routing } from "@/lib/i18n/routing";
import { breadcrumbs } from "@/lib/seo/jsonld";
import { site } from "@/lib/site";
import { getCategory, getRelatedTools, getTool, tools } from "@/tools/registry";

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
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: {
      canonical: `${site.url}${path}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [
          l,
          `${site.url}${l === routing.defaultLocale ? "" : `/${l}`}/${slug}`,
        ]),
      ),
    },
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      url: `${site.url}${path}`,
      type: "website",
    },
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
      {jsonLd.map((obj) => (
        <script
          key={obj["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
        />
      ))}
      <ToolPage tool={tool} related={related} locale={locale} />
    </>
  );
}
