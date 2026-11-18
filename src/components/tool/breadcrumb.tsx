import { ChevronRight } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import type { CategoryDefinition, ToolDefinition } from "@/tools/registry/schema";

/** Visible Home › Category › Tool trail (tool-page spec §1). Mirrors the BreadcrumbList JSON-LD. */
export function Breadcrumb({
  tool,
  category,
  locale,
}: {
  tool: ToolDefinition;
  category: CategoryDefinition;
  locale: string;
}) {
  const title = (tool.content[locale] ?? tool.content.en).title;
  const sep = <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-fg-subtle" />;
  return (
    <nav aria-label="Breadcrumb" className="text-fg-muted text-sm">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            href="/"
            className="inline-flex min-h-11 min-w-11 items-center rounded-sm hover:text-fg"
          >
            Home
          </Link>
        </li>
        <li aria-hidden>{sep}</li>
        <li>
          <Link
            href={`/tools/${category.id}`}
            // A short label ("Edit") sits centred in its 44 px target, so the space is even both sides.
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm hover:text-fg"
          >
            {category.title}
          </Link>
        </li>
        <li aria-hidden>{sep}</li>
        <li aria-current="page" className="text-fg">
          {title}
        </li>
      </ol>
    </nav>
  );
}
