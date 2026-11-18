import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BreadcrumbTrail } from "@/components/layout/breadcrumb-trail";
import { JsonLd } from "@/components/layout/json-ld";
import { groupTools, ToolCardGrid, ToolGroupList } from "@/components/layout/tool-directory";
import { hubIntros } from "@/content/site";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { pageBreadcrumbs } from "@/lib/seo/jsonld";
import { site } from "@/lib/site";
import { getActiveCategories, getToolsByCategory } from "@/tools/registry";
import { CategoryId } from "@/tools/registry/schema";

type Params = { locale: string; category: string };
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  // Only categories with at least one tool get a hub; an empty hub is a soft 404.
  return routing.locales.flatMap((locale) =>
    getActiveCategories().map((c) => ({ locale, category: c.id })),
  );
}

const localePathOf = (locale: string) => (locale === routing.defaultLocale ? "" : `/${locale}`);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, category } = await params;
  const cat = getActiveCategories().find((c) => c.id === category);
  if (!cat) return {};
  const url = `${site.url}${localePathOf(locale)}/tools/${cat.id}`;
  const title = cat.hubTitle ?? `${cat.title} video tools`;
  return {
    title,
    description: cat.metaDescription ?? cat.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: cat.description,
      url,
      type: "website",
      images: ogImages(`hub-${cat.id}`, `${title}: ${cat.description}`).images,
    },
    twitter: ogImages(`hub-${cat.id}`, `${title}: ${cat.description}`).twitter,
  };
}

/**
 * Category hub: the middle level of home → hub → tool (README.md#seo-strategy §1). Visible breadcrumb
 * plus BreadcrumbList, a hand-written intro (src/content/site), a card for every standalone tool and
 * a link list for each generated family or set of format pairs.
 */
export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { locale, category } = await params;
  setRequestLocale(locale);
  const parsed = CategoryId.safeParse(category);
  if (!parsed.success) notFound();
  const cat = getActiveCategories().find((c) => c.id === parsed.data);
  if (!cat) notFound();
  const { cards, groups } = groupTools(getToolsByCategory(parsed.data), locale);
  const title = cat.hubTitle ?? `${cat.title} video tools`;
  const intro = hubIntros[cat.id] ?? [];

  return (
    <div className="mx-auto w-full max-w-(--container-content) px-4 py-12 md:px-8 md:py-16">
      <JsonLd
        data={pageBreadcrumbs(
          [{ name: cat.title, path: `/tools/${cat.id}` }],
          localePathOf(locale),
        )}
      />
      <BreadcrumbTrail items={[{ name: "Home", href: "/" }, { name: cat.title }]} />
      <h1 className="mt-4 text-balance text-h1">{title}</h1>
      <p className="mt-3 max-w-(--container-prose) text-body-lg text-fg-muted">{cat.description}</p>
      {intro.length > 0 && (
        <div className="mt-6 max-w-(--container-prose) space-y-4 text-body text-fg-muted">
          {intro.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <section aria-labelledby="hub-tools" className="mt-12">
          {/* Cards carry h3 titles; this keeps the outline h1 → h2 → h3 without a visible label. */}
          <h2 id="hub-tools" className="sr-only">
            Tools
          </h2>
          <ToolCardGrid tools={cards} locale={locale} />
        </section>
      )}
      {groups.length > 0 && (
        <div className="mt-16 space-y-16">
          {groups.map((g) => (
            <ToolGroupList key={g.key} group={g} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
