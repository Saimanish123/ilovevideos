import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ClearRecent } from "@/components/layout/clear-recent";
import { HeroSearch } from "@/components/layout/hero-search";
import { HomeRowsFill } from "@/components/layout/home-rows-fill";
import { RowHeading, RowList, ToolRow } from "@/components/layout/tool-row";
import { home } from "@/content/site";
import { discovery, homeLead } from "@/content/site/discovery";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { homeRowsHoldScript, homeRowsScript } from "@/lib/recent-tools";
import { site } from "@/lib/site";
import {
  tools as allTools,
  getActiveCategories,
  getRelatedTools,
  getToolsByCategory,
  isGenerated,
} from "@/tools/registry";

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
      images: ogImages("home", `${home.title.replace(/\.$/, "")}: ${home.lead}`).images,
    },
    twitter: ogImages("home", `${home.title.replace(/\.$/, "")}: ${home.lead}`).twitter,
  };
}

/**
 * Home (README.md#seo-strategy §1, top of home → hub → tool), ADR-0154:
 * - Hero: the H1, the lead, and the site search as a large field with "Or choose a file" beside it (a
 *   file dropped anywhere on the hero works too). No single tool is the hero's action.
 * - The three promises, each a title and one short line.
 * - Netflix-style rows: one per category, every standalone tool on one scrolling line, lead tools
 *   first, no loop, "See all" to the hub. For a returning visitor, "Continue" (recent tools) and
 *   "Because you used <tool>" come first, filled before paint from localStorage by the inline script
 *   after the rows. The category rows keep the editorial order.
 * Format pairs and presets are not listed (they are for search). No popularity rows: there is no
 * usage data.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const categories = getActiveCategories().map((cat) => ({
    cat,
    list: getToolsByCategory(cat.id),
  }));
  // Each row's cards: standalone tools, lead first. Their order on the page is the index the inline
  // script uses for the "Because you used" row.
  const rows = categories.flatMap(({ cat, list }) => {
    const cards = list.filter((t) => !isGenerated(t));
    if (cards.length === 0) return [];
    const lead = (homeLead[cat.id] ?? []).flatMap((s) => cards.filter((t) => t.slug === s));
    return [{ cat, tools: [...lead, ...cards.filter((t) => !lead.includes(t))] }];
  });
  const order = rows.flatMap((r) => r.tools.map((t) => t.slug));
  const at = new Map(order.map((s, i) => [s, i]));
  const related = rows.flatMap((r) =>
    r.tools.map((t) => getRelatedTools(t).flatMap((x) => at.get(x.slug) ?? [])),
  );
  const count = Math.floor(allTools.length / 10) * 10;

  return (
    <>
      <div className="mx-auto w-full max-w-(--container-content) px-4 md:px-8">
        <section aria-labelledby="home-title" className="pt-16 md:pt-24">
          {/* The page's one entrance (ADR-0157): the search, then the promises 40 ms later. The title
              and lead (the LCP) stay still. */}
          <h1 id="home-title" className="max-w-(--container-headline) text-balance text-display">
            {home.title}
          </h1>
          <p className="mt-6 max-w-(--container-prose) text-body-lg text-fg-muted">{home.lead}</p>
          {/* Before first paint: the hero's field is on screen, so the header search starts hidden. */}
          <script
            dangerouslySetInnerHTML={{
              __html: 'document.documentElement.setAttribute("data-hero-search","")',
            }}
          />
          <div className="enter-0 mt-8">
            <HeroSearch
              placeholder={home.search(count)}
              short={home.searchShort(count)}
              chooseLabel={home.chooseFile}
            />
          </div>
        </section>

        <ul className="enter-1 mt-16 grid gap-8 md:mt-24 md:grid-cols-3">
          {home.promises.map((p) => (
            <li key={p.title} className="border-border border-t pt-6">
              <h2 className="text-h3">{p.title}</h2>
              <p className="mt-2 text-fg-muted text-sm">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Netflix-style rows (ADR-0154), full bleed: the first card lines up with the content column and
          the row runs to the viewport edges, fading where more cards wait. */}
      <div
        id="tools"
        data-related={JSON.stringify(related)}
        className="mt-24 flex scroll-mt-20 flex-col gap-16 md:mt-32 md:gap-24"
        suppressHydrationWarning
      >
        {/* Before the rows are drawn: if this browser has recent tools, keep the rows invisible until
            the script after them has filled Continue and Because, so nothing that
            was already drawn moves (CLS 0). Invisible, not removed: the page keeps its height. */}
        <script dangerouslySetInnerHTML={{ __html: homeRowsHoldScript }} />
        <section
          id="row-continue"
          aria-labelledby="row-continue-heading"
          data-reveal
          hidden
          suppressHydrationWarning
        >
          <RowHeading id="row-continue-heading" action={<ClearRecent />}>
            {discovery.continueRow}
          </RowHeading>
          <RowList id="row-continue" label="recent tools" copies />
        </section>
        <section
          id="row-because"
          aria-labelledby="row-because-heading"
          data-reveal
          hidden
          suppressHydrationWarning
        >
          <RowHeading id="row-because-heading">
            {discovery.becauseRow}{" "}
            <span
              id="row-because-title"
              dangerouslySetInnerHTML={{ __html: "" }}
              suppressHydrationWarning
            />
          </RowHeading>
          <RowList id="row-because" label="suggested tools" copies />
        </section>
        {rows.map(({ cat, tools }) => (
          <ToolRow
            key={cat.id}
            id={cat.id}
            title={cat.title}
            hubHref={`/tools/${cat.id}`}
            tools={tools}
            locale={locale}
          />
        ))}
        {/* Before React runs: Continue and Because, from this browser only. */}
        <script dangerouslySetInnerHTML={{ __html: homeRowsScript }} />
        <HomeRowsFill />
      </div>
    </>
  );
}
