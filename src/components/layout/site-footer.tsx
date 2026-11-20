import { footer } from "@/content/site";
import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";
import { getActiveCategories, hubTitleOf } from "@/tools/registry";
import { ShortcutsLink } from "./shortcuts-link";

const link =
  "inline-flex min-h-11 items-center justify-center rounded-sm md:min-h-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * Footer (design system §8.10, ADR-0127): the category hubs as one calm list, then legal links.
 * Where processing happens is stated on /privacy and once on home, not on every page (ADR-0149).
 * It used to list every standalone tool on every page (about 150 links); each tool is now reached
 * from the home directory and its hub, both one click from any page, and from six related tools.
 * No newsletter, no social icons.
 */
export function SiteFooter({ locale: _locale = "en" }: { locale?: string }) {
  return (
    <footer className="mt-32 border-border border-t">
      <nav
        aria-labelledby="footer-tools"
        className="mx-auto w-full max-w-(--container-content) px-4 py-12 md:px-8"
      >
        <h2 id="footer-tools" className="font-medium text-sm">
          Tool categories
        </h2>
        <ul className="mt-2 grid grid-cols-1 gap-x-6 text-fg-muted text-sm sm:grid-cols-2 lg:grid-cols-5">
          {getActiveCategories().map((cat) => (
            <li key={cat.id}>
              <Link prefetch={false} href={`/tools/${cat.id}`} className={link}>
                {hubTitleOf(cat)}
              </Link>
            </li>
          ))}
          <li>
            <Link prefetch={false} href="/#tools" className={link}>
              All tools
            </Link>
          </li>
        </ul>
      </nav>
      {/* Full-width divider, the same edge as the footer's top border. */}
      <div className="border-border border-t">
        <div className="mx-auto flex w-full max-w-(--container-content) flex-col gap-4 px-4 py-8 text-fg-muted text-sm md:flex-row md:items-center md:justify-between md:px-8">
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
      </div>
    </footer>
  );
}
