import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { groupTools, ToolCardGrid, ToolGroupRow } from "@/components/layout/tool-directory";
import { buttonVariants } from "@/components/ui/button";
import { home } from "@/content/site";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { site } from "@/lib/site";
import { getActiveCategories, getToolsByCategory } from "@/tools/registry";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const url = `${site.url}${locale === routing.defaultLocale ? "/" : `/${locale}`}`;
  return {
    alternates: { canonical: url },
    openGraph: {
      url,
      type: "website",
      title: home.title,
      description: site.description,
      images: ogImages("home", `${home.title}: ${home.lead}`).images,
    },
    twitter: ogImages("home", `${home.title}: ${home.lead}`).twitter,
  };
}

/**
 * Home (README.md#seo-strategy §1, top of home → hub → tool): hero, the three promises, the hubs, then
 * every tool by category. Standalone tools are illustrated cards; generated families and format pairs
 * are compact rows of links (tool-directory.tsx). Accent: the hero's primary action only.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const categories = getActiveCategories().map((cat) => ({
    cat,
    list: getToolsByCategory(cat.id),
  }));

  return (
    <div className="mx-auto w-full max-w-(--container-content) px-4 md:px-8">
      <section className="pt-16 md:pt-24">
        <h1 className="max-w-(--container-headline) text-balance text-display">{home.title}</h1>
        <p className="mt-6 max-w-(--container-prose) text-body-lg text-fg-muted">{home.lead}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            prefetch={false}
            href="/compress-video"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            {home.primary}
          </Link>
          <a href="#tools" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            {home.secondary}
          </a>
        </div>
      </section>

      <ul className="mt-16 grid gap-8 md:mt-24 md:grid-cols-3">
        {home.promises.map((p) => (
          <li key={p.title} className="border-border border-t pt-6">
            <h2 className="text-h3">{p.title}</h2>
            <p className="mt-2 text-fg-muted text-sm">{p.text}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="browse" className="mt-24 md:mt-32">
        <h2 id="browse" className="text-h2">
          {home.browse}
        </h2>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(({ cat, list }) => (
            <li key={cat.id}>
              <Link
                prefetch={false}
                href={`/tools/${cat.id}`}
                className="flex h-full flex-col rounded-md border border-border bg-bg-raised px-4 py-3 transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-sm">{cat.hubTitle ?? cat.title}</span>
                  <span className="tabular text-fg-muted text-xs">
                    {list.length === 1 ? "1 page" : `${list.length} pages`}
                  </span>
                </span>
                <span className="mt-1 text-fg-muted text-xs">{cat.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div id="tools" className="scroll-mt-20">
        {categories.map(({ cat, list }) => {
          const { cards, groups } = groupTools(list, locale);
          return (
            <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className="mt-24 md:mt-32">
              <h2 id={`cat-${cat.id}`} className="text-h2">
                <Link
                  prefetch={false}
                  href={`/tools/${cat.id}`}
                  className="inline-flex min-h-11 min-w-11 items-center rounded-sm underline decoration-transparent decoration-1 underline-offset-4 transition-colors duration-(--duration-instant) hover:decoration-fg-muted"
                >
                  {cat.title}
                </Link>
              </h2>
              <p className="mt-2 max-w-(--container-prose) text-body text-fg-muted">
                {cat.description}
              </p>
              {cards.length > 0 && (
                <div className="mt-8">
                  <ToolCardGrid tools={cards} locale={locale} />
                </div>
              )}
              {groups.length > 0 && (
                <div className="mt-8 space-y-6">
                  {groups.map((g) => (
                    <ToolGroupRow key={g.key} group={g} locale={locale} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
