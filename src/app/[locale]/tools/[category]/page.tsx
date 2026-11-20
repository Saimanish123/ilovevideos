import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BreadcrumbTrail } from "@/components/layout/breadcrumb-trail";
import { JsonLd } from "@/components/layout/json-ld";
import {
  GeneratedPages,
  groupTools,
  ToolCardGrid,
  ToolGroupList,
} from "@/components/layout/tool-directory";
import { taskGroups } from "@/components/layout/tool-groups";
import { ProseSection } from "@/components/tool/prose-section";
import { buttonVariants } from "@/components/ui/button";
import { hubIntros } from "@/content/site";
import { discovery, hubLines } from "@/content/site/discovery";
import { cn } from "@/lib/cn";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { pageBreadcrumbs } from "@/lib/seo/jsonld";
import { site } from "@/lib/site";
import { getActiveCategories, getToolsByCategory, hubTitleOf } from "@/tools/registry";
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
  const title = hubTitleOf(cat);
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
 *
 * Grouped by task (ADR-0127): a hub with many standalone tools lists them under task headings, with a
 * row of links to each heading. Families and format pairs (ADR-0154) sit in one closed disclosure at
 * the very bottom ("All 36 format pages") when the hub also has standalone tools, and in the open when
 * they are the hub's whole content.
 */
export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { locale, category } = await params;
  setRequestLocale(locale);
  const parsed = CategoryId.safeParse(category);
  if (!parsed.success) notFound();
  const cat = getActiveCategories().find((c) => c.id === parsed.data);
  if (!cat) notFound();
  const { cards, groups } = groupTools(getToolsByCategory(parsed.data), locale);
  const tasks = taskGroups(parsed.data, cards);
  const anchor = (label: string) => `task-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const title = hubTitleOf(cat);
  const intro = hubIntros[cat.id] ?? [];

  return (
    <div className="mx-auto w-full max-w-(--container-content) px-4 py-12 md:px-8 md:py-16">
      <JsonLd
        data={pageBreadcrumbs(
          [{ name: cat.title, path: `/tools/${cat.id}` }],
          localePathOf(locale),
        )}
      />
      {/* The page's one entrance (ADR-0157): trail, task chips (if any), tools, generated pages, 40 ms apart;
          the title and line (the LCP) stay still. Task groups and the folded text below the fold
          reveal once as they scroll into view. */}
      <div className="enter-0">
        <BreadcrumbTrail items={[{ name: "Home", href: "/" }, { name: cat.title }]} />
      </div>
      <h1 className="mt-4 text-balance text-h1">{title}</h1>
      <p className="mt-3 max-w-(--container-prose) text-body-lg text-fg-muted">
        {hubLines[cat.id]}
      </p>
      {tasks && (
        <nav aria-label="Tasks on this page" className="enter-1 mt-6">
          {/* A fixed grid, not a wrapping row: where a chip breaks never depends on font metrics,
              so the web font swapping in cannot move the row (Lighthouse caught a 0.036 shift). */}
          <ul className={`grid grid-cols-2 gap-2 ${chipColumns[tasks.length] ?? chipColumns[6]}`}>
            {tasks.map((g) => (
              <li key={g.label}>
                <a
                  href={`#${anchor(g.label)}`}
                  className={buttonVariants({ variant: "chip", size: "pill", className: "w-full" })}
                >
                  {g.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {tasks && (
        <div className="enter-2 mt-16 space-y-16">
          {tasks.map((g) => (
            <section
              key={g.label}
              aria-labelledby={anchor(g.label)}
              data-reveal
              className="scroll-mt-20"
            >
              <h2 id={anchor(g.label)} className="scroll-mt-20 text-h2">
                {g.label}
              </h2>
              <div className="mt-6">
                <ToolCardGrid tools={g.tools} locale={locale} />
              </div>
            </section>
          ))}
        </div>
      )}
      {!tasks && cards.length > 0 && (
        <section aria-labelledby="hub-tools" className="enter-1 mt-12">
          {/* Cards carry h3 titles; this keeps the outline h1 → h2 → h3 without a visible label. */}
          <h2 id="hub-tools" className="sr-only">
            Tools
          </h2>
          <ToolCardGrid tools={cards} locale={locale} />
        </section>
      )}
      {/* The hub's longer text, folded below the tools as on tool pages: in the HTML for search
          engines, out of the way of someone who came to pick a tool. */}
      {intro.length > 0 && (
        <div data-reveal className="mt-16 max-w-(--container-prose) border-border border-b">
          <ProseSection id="about-hub" title={discovery.aboutHub}>
            <div className="space-y-4 text-body text-fg-muted">
              {intro.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
          </ProseSection>
        </div>
      )}
      {/* Generated pages (ADR-0154): the hub's content when it has nothing else (platforms), otherwise
          one closed disclosure at the very bottom, the quiet crawlable path to every pair and preset. */}
      {groups.length > 0 && cards.length === 0 && (
        <div className="enter-1 mt-16 space-y-16">
          {groups.map((g) => (
            <ToolGroupList key={g.key} group={g} locale={locale} />
          ))}
        </div>
      )}
      {groups.length > 0 && cards.length > 0 && (
        // Right under "About these tools" when there is one (its hairline is the divider), so the hub
        // ends in one quiet block instead of two separated rules.
        <div
          data-reveal
          className={cn(
            tasks ? "enter-3" : "enter-2",
            intro.length > 0 ? "mt-4" : "mt-16 border-border border-t pt-4",
          )}
        >
          <GeneratedPages groups={groups} locale={locale} />
        </div>
      )}
    </div>
  );
}

/** The chip grid sized to the chips: one row from lg for up to seven tasks, never empty columns. */
const chipColumns: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-3 lg:grid-cols-6",
  7: "sm:grid-cols-4 lg:grid-cols-7",
};
