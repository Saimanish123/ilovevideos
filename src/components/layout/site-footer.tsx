import { groupTools } from "@/components/layout/tool-directory";
import { footer } from "@/content/site";
import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";
import { getActiveCategories, getToolsByCategory } from "@/tools/registry";
import { ShortcutsLink } from "./shortcuts-link";

const link =
  "inline-flex min-h-11 min-w-11 items-center rounded-sm md:min-h-8 pointer-coarse:min-h-11 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * Footer (design system §8.10): each category as a plain column headed by its hub, listing the
 * category's standalone tools. Generated families and format pairs are reached through the hub, the
 * home page and the converters, which keeps every page's HTML small. Legal links and the one
 * sentence about where processing happens close it. No newsletter, no social icons.
 */
export function SiteFooter({ locale = "en" }: { locale?: string }) {
  return (
    <footer className="mt-32 border-border border-t">
      <nav
        aria-labelledby="footer-tools"
        className="mx-auto grid w-full max-w-(--container-content) grid-cols-2 gap-x-6 gap-y-10 px-4 py-16 md:grid-cols-3 md:px-8 lg:grid-cols-5"
      >
        {/* One h2 for the whole list keeps the page's own outline: categories sit under it as h3. */}
        <h2 id="footer-tools" className="sr-only">
          All tools
        </h2>
        {getActiveCategories().map((cat) => {
          const { cards, groups } = groupTools(getToolsByCategory(cat.id), locale);
          return (
            <div key={cat.id}>
              <h3 className="font-medium text-sm">
                <Link prefetch={false} href={`/tools/${cat.id}`} className={link}>
                  {cat.title}
                </Link>
              </h3>
              <ul className="mt-1 flex flex-col gap-1 text-fg-muted text-sm leading-snug">
                {cards.map((t) => (
                  <li key={t.slug}>
                    <Link prefetch={false} href={`/${t.slug}`} className={link}>
                      {(t.content[locale] ?? t.content.en).title}
                    </Link>
                  </li>
                ))}
                {groups.map((g) => (
                  <li key={g.key}>
                    <Link prefetch={false} href={`/tools/${cat.id}`} className={link}>
                      {g.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="mx-auto flex w-full max-w-(--container-content) flex-col gap-4 border-border border-t px-4 py-8 text-fg-muted text-sm md:flex-row md:items-center md:justify-between md:px-8">
        <p>{footer.device}</p>
        <ul className="flex flex-wrap items-center gap-x-6">
          {footer.legal.map((l) => (
            <li key={l.href}>
              <Link prefetch={false} href={l.href} className={link}>
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <ShortcutsLink className={link} />
          </li>
          <li>{site.name}</li>
        </ul>
      </div>
    </footer>
  );
}
