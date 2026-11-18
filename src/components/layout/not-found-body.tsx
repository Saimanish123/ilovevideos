import { proseLink } from "@/components/layout/legal-page";
import { Link } from "@/lib/i18n/navigation";
import { getActiveCategories } from "@/tools/registry";

/**
 * The 404 page's content, shared by `[locale]/not-found.tsx` (a `notFound()` inside a page) and
 * `global-not-found.tsx` (a URL no route matches). It says what happened and offers the ways in:
 * home, and every tool hub. No search box of its own: ⌘K in the header already is one.
 */
export function NotFoundBody() {
  return (
    <article className="mx-auto w-full max-w-(--container-content) px-4 py-12 md:px-8 md:py-16">
      <div className="max-w-(--container-prose)">
        <h1 className="text-balance text-h1">Page not found</h1>
        <p className="mt-3 text-body-lg text-fg-muted">
          There is no page at this address. It may have been typed or copied with a mistake. Every
          tool is listed on the home page and under the categories below.
        </p>
        <p className="mt-6 text-body">
          <Link href="/" className={`flex min-h-11 w-fit items-center ${proseLink}`}>
            Go to the home page
          </Link>
        </p>
        <h2 className="mt-12 text-h2">Tool categories</h2>
        <ul className="mt-4 flex flex-col gap-3 text-body">
          {getActiveCategories().map((c) => (
            <li key={c.id}>
              {/* The link on its own 44 px line, the description under it in smaller type: an
                  inline target next to wrapping text gave each item uneven line spacing. */}
              <Link
                href={`/tools/${c.id}`}
                className={`flex min-h-11 w-fit items-center ${proseLink}`}
              >
                {c.hubTitle ?? c.title}
              </Link>
              <p className="text-fg-muted text-sm">{c.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
