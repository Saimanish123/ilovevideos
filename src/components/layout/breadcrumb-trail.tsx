import { ChevronRight } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

/**
 * Visible breadcrumb for pages that are not tools (hubs, legal pages). Mirrors the BreadcrumbList
 * JSON-LD built by `pageBreadcrumbs` in lib/seo. The last item is the current page and is not a link.
 */
export function BreadcrumbTrail({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-fg-muted text-sm">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={item.name} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-fg-subtle" />
            )}
            {item.href ? (
              <Link
                href={item.href}
                className="-mx-2 inline-flex min-h-11 items-center rounded-sm px-2 hover:text-fg"
              >
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
